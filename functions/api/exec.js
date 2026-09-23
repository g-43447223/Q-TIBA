const MAX_RETRIES = 3;

function isJson(contentType) {
  return typeof contentType === "string" && contentType.indexOf("json") !== -1;
}

// Apps Script /exec kadang balas halaman "Page Not Found" Google bila sesi sejuk
// atau melebihi had masa. Cuba semula beberapa kali sebelum serah kepada browser.
async function callUpstream(url, method, body, retries) {
  const resp = await fetch(url, {
    method: method,
    redirect: "follow",
    headers: { "Content-Type": "application/json" },
    body: body || undefined
  });

  const text = await resp.text();
  const contentType = resp.headers.get("content-type") || "";

  const isOk = resp.ok && isJson(contentType);
  if (isOk) {
    return { status: resp.status, contentType, text };
  }

  if (retries > 0 && !isOk) {
    await new Promise((r) => setTimeout(r, 1500));
    return callUpstream(url, method, body, retries - 1);
  }

  return { status: resp.status, contentType, text };
}

export async function onRequest(context) {
  const { request, env } = context;
  const UPSTREAM_URL = env.GAS_API_URL;
  const API_KEY = env.QTIBA_API_KEY;

  const jsonHeaders = { "Content-Type": "application/json" };

  try {
    if (!UPSTREAM_URL || !API_KEY) {
      return new Response(
        JSON.stringify({
          status: "Error",
          message: "Environment belum diset: GAS_API_URL / QTIBA_API_KEY dalam Cloudflare Pages."
        }),
        { status: 500, headers: jsonHeaders }
      );
    }

    const url = new URL(UPSTREAM_URL);

    const incoming = new URL(request.url);
    for (const [k, v] of incoming.searchParams) {
      url.searchParams.set(k, v);
    }
    url.searchParams.set("apiKey", API_KEY);

    let body = null;
    if (request.method === "POST" || request.method === "PUT") {
      body = await request.text();
    }

    const result = await callUpstream(url, request.method, body, MAX_RETRIES);

    return new Response(result.text, {
      status: result.status,
      headers: { "Content-Type": result.contentType || "application/json" }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        status: "Error",
        message: "Proxy gagal hubungi backend: " + (err && err.message ? err.message : String(err))
      }),
      { status: 502, headers: jsonHeaders }
    );
  }
}