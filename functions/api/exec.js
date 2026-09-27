// ============================================================================
// Q-TIBA - Cloudflare Pages Function: /api/exec
// ----------------------------------------------------------------------------
// Proxy ini ialah PENJAGA SEBENAR sistem. Sebelum ini ia memalsukan API key ke
// SETIAP request tanpa semakan, jadi sesiapa yang tahu URL sahaja boleh membaca
// dan menulis data murid tanpa kata laluan.
//
// Tanggungjawab:
//   1. Pisah tindakan kepada 3 peringkat (public / staff / admin), default DENY.
//   2. Session admin/staf: signed HttpOnly cookie (bukan localStorage/URL).
//   3. Rate limit login dan bacaan awam (per-IP) - anti mass-scraping.
//   4. API key tidak pernah dihantar ke pelayar.
// ============================================================================

const UPSTREAM_RETRIES = 2;      // HANYA untuk GET (POST tidak diulang, elak tulis berganda)
const SESSION_COOKIE = "qtiba_session";
const SESSION_HOURS = 12;        // Satu hari persekolahan sahaja.
const LOGIN_WINDOW_MS = 60000;   // 1 minit
const LOGIN_MAX_PER_IP = 8;      // percubaan login / minit / IP
const READ_MAX_PER_IP = 60;      // bacaan awam / minit / IP
const READ_WINDOW_MS = 60000;

// Tindakan AWAM - tidak mengandungi data peribadi.
// Data utama (tiada "action") juga awam: ia asas papan paparan ibu bapa.
// "session" dan "login" TIDAK disenaraikan: ia dikendalikan oleh handler
// khusus sebelum resolveTier, jadi tidak perlu lalu ke hulu.
const PUBLIC_ACTIONS = new Set(["", "settings"]);

// Tindakan STAF - skrin pintu dan imbasan scanner.
const STAFF_ACTIONS = new Set(["gateLock"]);

// Tindakan ADMIN - nota intervensi, tukar PIN, daftar admin.
const ADMIN_ACTIONS = new Set(["intervensi", "saveIntervensi", "changePin", "registerAdmin"]);

// Rate limit in-memory per isolate. Cukup untuk menapis abuse kasar dan
// scraper biasa. Penyerang yang diedarkan ke banyak isolate memerlukan
// KV namespace (bukan sebahagian daripada skop ini).
const rateBuckets = new Map();

function jsonResponse(payload, status, extraHeaders) {
  return new Response(JSON.stringify(payload), {
    status: status || 200,
    headers: Object.assign({
      "Content-Type": "application/json",
      // Respons API mengandungi data kehadiran peribadi murid. Jangan biarkan
      // edge/CDN atau cache pelayar menyimpan salinan.
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache"
    }, extraHeaders || {})
  });
}

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || now - bucket.start > windowMs) {
    rateBuckets.set(key, { start: now, count: 1 });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= max;
}

// Bersihkan bucket lama supaya Memory tidak telleruh.
function sweepRateBuckets() {
  const cutoff = Date.now() - 300000;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.start < cutoff) rateBuckets.delete(key);
  }
}

// --- base64url -------------------------------------------------------------
function b64urlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(text) {
  const padded = String(text).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- HMAC ------------------------------------------------------------------
async function hmacHex(secret, data) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const bytes = new Uint8Array(signature);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += ("0" + bytes[i].toString(16)).slice(-2);
  return hex;
}

// Perbandingan masa-tetap untuk elak timing attack pada signature.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Signing key diturunkan daripada API key sedia ada supaya TIDAK perlu satu
// rahsia Cloudflare tambahan. API key kekala rahsia tunggal sistem.
async function sessionSigningKey(apiKey) {
  return hmacHex(apiKey, "qtiba-session-v1");
}

// --- Session cookie --------------------------------------------------------
async function signSession(sessionSigningKeyValue, claims) {
  const payload = b64urlEncode(
    new TextEncoder().encode(
      JSON.stringify({ e: claims.email, r: claims.role, x: claims.exp })
    )
  );
  const signature = await hmacHex(sessionSigningKeyValue, payload);
  return payload + "." + signature;
}

async function readSession(request, sessionSigningKeyValue) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(SESSION_COOKIE + "="));

  if (!match) return null;

  const value = match.slice(SESSION_COOKIE.length + 1);
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;

  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  const expected = await hmacHex(sessionSigningKeyValue, payload);

  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    if (!claims || typeof claims.x !== "number" || claims.x < Date.now()) return null;
    return { email: String(claims.e || ""), role: String(claims.r || "") };
  } catch (err) {
    return null;
  }
}

function sessionCookieHeader(token) {
  const maxAge = SESSION_HOURS * 3600;
  return (
    SESSION_COOKIE + "=" + token +
    "; Path=/; Max-Age=" + maxAge +
    "; HttpOnly; Secure; SameSite=Strict"
  );
}

function clearSessionCookieHeader() {
  return SESSION_COOKIE + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict";
}

// --- Penentuan peringkat tindakan -----------------------------------------
function resolveTier(method, action) {
  const a = String(action || "").trim();

  if (method === "GET" || method === "HEAD") {
    if (PUBLIC_ACTIONS.has(a)) return "public";
    if (STAFF_ACTIONS.has(a)) return "staff";
    if (ADMIN_ACTIONS.has(a)) return "admin";
    return "deny";
  }

  if (method === "POST") {
    if (a === "login") return "public";
    if (a === "") return "staff";            // rekod imbasan (scanner / pintu)
    if (STAFF_ACTIONS.has(a)) return "staff";
    if (ADMIN_ACTIONS.has(a)) return "admin";
    return "deny";
  }

  return "deny";
}

// Semak Origin untuk tindakan bertier. Browser hantar Origin untuk POST
// same-origin; tiada Origin = bukan browser (curl/server), biarkan.
// Cookie SameSite=Strict sudah menjadi defence utama untuk cross-site.
function originAllowed(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch (err) {
    return false;
  }
}

// --- Komunikasi dengan Apps Script ----------------------------------------
async function callUpstream(baseUrl, method, body, retries, extraHeaders) {
  const headers = { "Content-Type": "application/json" };
  for (const [key, value] of Object.entries(extraHeaders || {})) {
    headers[key] = value;
  }

  const response = await fetch(baseUrl, {
    method: method,
    redirect: "follow",
    headers: headers,
    body: body || undefined
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const isOk = response.ok && contentType.indexOf("json") !== -1;

  if (!isOk && retries > 0) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return callUpstream(baseUrl, method, body, retries - 1, extraHeaders);
  }

  return { status: response.status, contentType: contentType, text: text };
}

// Buang apiKey daripada body pelayar sebelum dihantar, supaya logik
// pengesahan code.gs hanya bergantung pada kunci yang disuntik proxy.
function stripApiKey(bodyText) {
  if (!bodyText) return null;
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch (err) {
    return bodyText;
  }
  if (!parsed || typeof parsed !== "object") return bodyText;
  delete parsed.apiKey;
  return JSON.stringify(parsed);
}

export async function onRequest(context) {
  const { request, env } = context;
  const upstreamUrl = env.GAS_API_URL;
  const apiKey = env.QTIBA_API_KEY;

  try {
    if (!upstreamUrl || !apiKey) {
      return jsonResponse(
        {
          status: "Error",
          message: "Environment belum diset: GAS_API_URL / QTIBA_API_KEY dalam Cloudflare Pages."
        },
        500
      );
    }

    sweepRateBuckets();
    const signingKey = await sessionSigningKey(apiKey);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const session = await readSession(request, signingKey);

    // ---- LOGIN ------------------------------------------------------------
    if (method === "POST" && String(url.searchParams.get("action") || "") === "login") {
      if (!rateLimit("login:" + clientIp, LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS)) {
        return jsonResponse(
          { status: "Error", authorized: false, message: "Terlalu banyak percubaan. Sila tunggu sebentar." },
          429
        );
      }

      const body = await request.text();
      let credentials = {};
      try {
        credentials = JSON.parse(stripApiKey(body) || "{}");
      } catch (err) {
        return jsonResponse({ status: "Error", authorized: false, message: "Permintaan tidak sah." }, 400);
      }

      const email = String(credentials.email || "").trim().toLowerCase();
      const pin = String(credentials.pin || "").trim();
      if (email === "" || pin === "") {
        return jsonResponse({ status: "Error", authorized: false, message: "Emel dan PIN wajib diisi." }, 400);
      }

      // Apps Script kekal sumber kebenaran kelayakan (PIN di Sheet).
      const loginUpstream = new URL(upstreamUrl);
      loginUpstream.searchParams.set("action", "verifyAdmin");
      loginUpstream.searchParams.set("email", email);
      loginUpstream.searchParams.set("pin", pin);
      loginUpstream.searchParams.set("apiKey", apiKey);

      const result = await callUpstream(loginUpstream.toString(), "GET", null, UPSTREAM_RETRIES);
      let verdict = { authorized: false, message: "Emel atau PIN tidak sah." };
      try {
        const parsed = JSON.parse(result.text);
        if (parsed && parsed.authorized) {
          verdict = { authorized: true };
        } else if (parsed && parsed.locked) {
          verdict = { authorized: false, message: "Akaun dikunci sementara. Cuba lagi nanti." };
        } else if (parsed && parsed.message) {
          verdict = { authorized: false, message: String(parsed.message) };
        }
      } catch (err) {
        // Balasan upstream tidak boleh dibaca - kekalkan "tidak sah" sahaja,
        // jangan bocorkan butiran.
      }

      if (!verdict.authorized) {
        return jsonResponse({ status: "Error", authorized: false, message: verdict.message }, 401);
      }

      const token = await signSession(signingKey, {
        email: email,
        role: "admin",
        exp: Date.now() + SESSION_HOURS * 3600000
      });

      // Token session milik proxy sahaja - token Apps Script TIDAK relayed.
      return jsonResponse(
        { status: "Success", authorized: true, email: email, role: "admin", expiresIn: SESSION_HOURS * 3600 },
        200,
        { "Set-Cookie": sessionCookieHeader(token) }
      );
    }

    // ---- SEMAK SESI -------------------------------------------------------
    if (method === "GET" && String(url.searchParams.get("action") || "") === "session") {
      if (!session) {
        return jsonResponse({ status: "Success", authenticated: false });
      }
      return jsonResponse({
        status: "Success",
        authenticated: true,
        email: session.email,
        role: session.role
      });
    }

    // ---- LOGOUT -----------------------------------------------------------
    if (method === "POST" && String(url.searchParams.get("action") || "") === "logout") {
      return jsonResponse(
        { status: "Success", authenticated: false },
        200,
        { "Set-Cookie": clearSessionCookieHeader() }
      );
    }

    // ---- PENENTUAN PERINGKAT ----------------------------------------------
    const action = url.searchParams.get("action") || "";
    const tier = resolveTier(method, action);

    if (tier === "deny") {
      return jsonResponse(
        { status: "Error", message: "Tindakan tidak dibenarkan." },
        403
      );
    }

    if (tier === "public" && method === "GET") {
      if (!rateLimit("read:" + clientIp, READ_MAX_PER_IP, READ_WINDOW_MS)) {
        return jsonResponse(
          { status: "Error", message: "Terlalu banyak permintaan. Sila cuba sebentar lagi." },
          429
        );
      }
    }

    if (tier === "staff" || tier === "admin") {
      if (!originAllowed(request)) {
        return jsonResponse({ status: "Error", message: "Origin tidak dibenarkan." }, 403);
      }
      if (!session) {
        return jsonResponse(
          { status: "Error", message: "Sesi tidak sah atau sudah tamat. Sila log masuk semula." },
          401
        );
      }
    }

    // ---- TERUSKAN KE APPS SCRIPT -----------------------------------------
    const target = new URL(upstreamUrl);
    for (const [key, value] of url.searchParams) {
      // apiKey: disuntik sendiri di bawah.
      // token: mekanisme legasi dalam query string - sudah digantikan oleh
      // header X-QTIBA-Actor, dan URL bocor ke history/log/referrer.
      if (key === "apiKey" || key === "token") continue;
      target.searchParams.set(key, value);
    }
    target.searchParams.set("apiKey", apiKey);

    // Untuk tindakan bertier, beritahu Apps Script siapa yang sedang acting.
    // Apps Script Percaya header ini kerana request sudah disahkan dengan API
    // key - iaitu rahsia yang hanya proxy tahu. Ini menggantikan token dalam
    // query string (yang bocor ke history, log dan referrer).
    const upstreamHeaders = {};
    if ((tier === "staff" || tier === "admin") && session && session.email) {
      upstreamHeaders["X-QTIBA-Actor"] = session.email;
    }

    let body = null;
    if (method === "POST" || method === "PUT") {
      body = stripApiKey(await request.text());
    }

    // Retry hanya untuk GET: ulang POST boleh menulis rekod berganda.
    const result = await callUpstream(
      target.toString(),
      method,
      body,
      method === "GET" ? UPSTREAM_RETRIES : 0,
      upstreamHeaders
    );

    return new Response(result.text, {
      status: result.status,
      headers: {
        "Content-Type": result.contentType || "application/json",
        // Sama seperti jsonResponse: data kehadiran tidak boleh di-cache.
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache"
      }
    });
  } catch (err) {
    return jsonResponse(
      {
        status: "Error",
        message: "Proxy gagal hubungi backend: " + (err && err.message ? err.message : String(err))
      },
      502
    );
  }
}
