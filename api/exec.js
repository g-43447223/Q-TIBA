const UPSTREAM_URL = process.env.GAS_API_URL;
const API_KEY = process.env.QTIBA_API_KEY;
const MAX_RETRIES = 3;

function isJson(contentType) {
  return typeof contentType === "string" && contentType.indexOf("json") !== -1;
}

// Apps Script /exec kadang balas halaman "Page Not Found" Google bila sesi sejuk
// atau melebihi had masa. Cuba semula beberapa kali sebelum serah kepada browser.
async function callUpstream(url, method, body, retries) {
  const upstream = await fetch(url.toString(), {
    method: method,
    redirect: "follow",
    headers: {
      "Content-Type": "application/json"
    },
    body: body || undefined
  });

  const text = await upstream.text();
  const contentType = upstream.headers.get("content-type") || "";

  const isOk = upstream.ok && isJson(contentType);
  if (isOk) {
    return { status: upstream.status, contentType, text };
  }

  if (retries > 0 && !isOk) {
    await new Promise((r) => setTimeout(r, 1500));
    return callUpstream(url, method, body, retries - 1);
  }

  return { status: upstream.status, contentType, text };
}

module.exports = async function handler(req, res) {
  try {
    if (!UPSTREAM_URL || !API_KEY) {
      return res.status(500).json({
        status: "Error",
        message: "Environment belum diset: GAS_API_URL / QTIBA_API_KEY dalam Vercel."
      });
    }

    const url = new URL(UPSTREAM_URL);

    const incoming = new URL(req.url, "http://localhost");
    for (const [k, v] of incoming.searchParams) {
      url.searchParams.set(k, v);
    }
    url.searchParams.set("apiKey", API_KEY);

    let body = null;
    if (req.method === "POST" || req.method === "PUT") {
      body = await readBody(req);
    }

    const result = await callUpstream(url, req.method, body, MAX_RETRIES);

    res.status(result.status);
    res.setHeader("Content-Type", result.contentType || "application/json");
    res.send(result.text);
  } catch (err) {
    res.status(502).json({
      status: "Error",
      message: "Proxy gagal hubungi backend: " + (err && err.message ? err.message : String(err))
    });
  }
};

function readBody(req) {
  return new Promise(function (resolve) {
    const chunks = [];
    req.on("data", function (chunk) {
      chunks.push(chunk);
    });
    req.on("end", function () {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", function () {
      resolve("");
    });
  });
}