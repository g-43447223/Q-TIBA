const UPSTREAM_URL = process.env.GAS_API_URL;
const API_KEY = process.env.QTIBA_API_KEY;

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

    const upstream = await fetch(url.toString(), {
      method: req.method,
      redirect: "follow",
      headers: {
        "Content-Type": req.headers["content-type"] || "application/json"
      },
      body: body || undefined
    });

    const text = await upstream.text();

    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.send(text);
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