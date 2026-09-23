// Q-TIBA Configuration (proxy serverless Cloudflare Pages)
// Browser hanya bersentuh dengan domain sendiri (sama origin). URL & key
// sebenar Apps Script disimpan dalam environment variable platform:
//   GAS_API_URL  -> https://script.google.com/macros/s/.../exec
//   QTIBA_API_KEY -> key yang sama dengan var API_KEY dalam code.gs

const API_URL = "/api/exec";

// Wajib KOSONG. functions/api/exec.js masukkan apiKey sebenar dari env var.
const QTIBA_API_KEY = "";
