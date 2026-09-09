// Q-TIBA Configuration (Vercel / api/exec.js proxy)
// Browser hanya bersentuh dengan Vercel (sama origin). URL & key sebenar
// Apps Script disimpan dalam environment variable Vercel:
//   GAS_API_URL  -> https://script.google.com/macros/s/.../exec
//   QTIBA_API_KEY -> key yang sama dengan var API_KEY dalam code.gs

const API_URL = "/api/exec";

// Wajib KOSONG. api/exec.js masukkan apiKey sebenar dari env var.
const QTIBA_API_KEY = "";
