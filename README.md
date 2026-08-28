# Q-TIBA

**QR-Code Tracking & Intervention Behaviometric Analytics**

Sistem disiplin sekolah untuk mengesan ketibaan murid menggunakan imbasan QR Code. Dibangunkan untuk Sekolah Kebangsaan Pulau Indah.

## Ciri-ciri

- Imbasan QR Code dengan kamera telefon
- Dashboard admin (KPI, carta, analitik)
- Portal Ibu Bapa (paparan ringkas tanpa login)
- PWA - boleh dipasang sebagai aplikasi
- Mod luar talian (offline)
- Eksport CSV & Surat Amaran PDF

## Struktur Fail

```
Q-TIBA/
├── index.html              # Dashboard Admin
├── scan.html               # Pemimbas QR Code
├── parent.html             # Portal Ibu Bapa
├── config.js               # Konfigurasi API URL (gitignore)
├── config.example.js       # Template config
├── sw.js                   # Service Worker (PWA)
├── manifest.json           # PWA Manifest (Pemimbas)
├── manifest-parent.json    # PWA Manifest (Ibu Bapa)
├── logo.png                # Logo Sekolah
├── q-tibalogo.png          # Logo Q-TIBA
└── assets/
    └── images/             # Gambar guru
```

## Teknologi

- HTML, CSS, JavaScript (Vanilla)
- Tailwind CSS (CDN)
- Chart.js (CDN)
- html5-qrcode (CDN)
- html2pdf.js (CDN)
- Google Apps Script + Google Sheets (Backend)

## Cara Deploy

### GitHub Pages
1. Fork atau push repo ini ke GitHub
2. Pergi ke **Settings > Pages**
3. Pilih branch `main` dan folder `/ (root)`
4. Klik **Save**

### Hosting Lain
Fail-fail ini adalah statik. Muat naik semua fail ke mana-mana pelayan web statik (Netlify, Firebase Hosting, dsb.).

## Backend

Aplikasi ini menggunakan **Google Apps Script** sebagai backend, disambungkan ke Google Sheets.

## Persediaan

1. Salin `config.example.js` kepada `config.js`
2. Masukkan URL Google Apps Script Web App anda dalam `config.js`
3. **Tetapkan API Key** — nilai `QTIBA_API_KEY` dalam `config.js` **MESTI sama** dengan `var API_KEY` dalam `code.gs`. Gunakan nilai yang panjang & sukar diteka sebelum deploy.
4. Buka fail HTML dalam pelayar

**Penting:** `config.js` tidak dikomit ke repo (dalam `.gitignore`). Hanya `config.example.js` yang akan ada dalam repo sebagai template.

## Keselamatan

- **PIN di-hash (SHA-256)** — PIN admin tidak disimpan dalam bentuk teks biasa dalam Google Sheet. PIN teks biasa lama akan di-naik taraf secara automatik pada log masuk pertama.
- **API Key** — Setiap permintaan ke back end mesti membawa `apiKey`; permintaan tanpa key yang sah akan ditolak.
- **Token sesi** — Tindakan sensitif (tukar PIN, daftar admin) memerlukan token sesi yang sah yang dikeluarkan semasa log masuk.
- **Sanitasi input** — Nama/kelas/punca murid di-escape sebelum dipaparkan (elak XSS) dan sanitized sebelum eksport CSV (elak CSV injection).
