# Q-TIBA

**QR-Code Tracking & Intervention Behaviometric Analytics**

Sistem disiplin sekolah untuk mengesan ketibaan murid menggunakan imbasan QR Code. Dibangunkan untuk Sekolah Kebangsaan Pulau Indah.

## Ciri-ciri

- Imbasan QR Code dengan kamera telefon
- Dashboard admin (KPI, carta, analitik)
- Portal Ibu Bapa (paparan ringkas tanpa login)
- PWA - boleh dipasang sebagai aplikasi
- Mod luar talian (offline) dengan antrian auto-sync
- **Cache senarai murid offline** — senarai murid disimpan dalam peranti; imbasan tetap berfungsi walaupun tanpa internet (data dihantar semula bila kembali dalam talian)
- Eksport CSV & Surat Amaran PDF
- Cegah rekod imbasan duplikat di sisi server (satu imbasan setiap murid sehari)
- Konfigurasi pusat (masa cutoff & senarai cuti) boleh diubah dalam Google Sheet tanpa sentuh kod
- Panel pentadbir dalam Google Sheets (ubah tetapan & senarai murid)
- **Tracking intervensi** — jadual murid berisiko dengan status tindakan (Surat 1/2/3, Kaunseling, Rujuk), tarikh & nota, disimpan dalam Google Sheet
- **Auto-cadang tindakan intervensi** — sistem mencadangkan status (Surat 1 → Rujuk Pengetua) berdasarkan jumlah kes murid, ditanda "(disyorkan)" dalam dropdown
- **Kronologi murid** — profil murid memaparkan timeline penuh semua imbasan + tindakan intervensi, dan boleh dimuat turun sebagai PDF
- **Ranking kelas** — jadual & bar disiplin per kelas (kadar hadir hari ini, jumlah kes) dalam tab Analitik
- **KPI Hadir Hari Ini** — kad dashboard menunjukkan bilangan murid hadir berbanding sasaran
- **Mode Paparan Pintu (Gate Display)** — skrin besar khas (`gate.html`): jam digital masa sebenar, KPI raksasa (Sasaran/Hadir/Lewat/Tak Hadir), senarai lewat yang bergerak automatik, sesuai diletakkan di TV/papan paparan pintu pagar sekolah
- Tren naik/turun & punca utama per murid untuk ukur keberkesanan intervensi
- **UI yang hidup** — latar aurora beranimasi, kad glass lift + glow, nombor KPI count-up, skeleton loading, konfeti apabila imbasan berjaya, kontrast peralihan tab & entrance reveal (hormati `prefers-reduced-motion`)
- **Reka bentuk gaya iOS 26 (Liquid Glass)** — tab navigasi floating kekal di bawah (safe-area iPhone), item tab besar untuk jari (min 48px), font asli sistem iOS, sesuaian fon untuk telefon

## Struktur Fail

```
Q-TIBA/
├── index.html              # Dashboard Admin
├── gate.html               # Mode Paparan Pintu (skrin besar / TV)
├── scan.html               # Pemimbas QR Code
├── parent.html             # Portal Ibu Bapa
├── Panel.html              # UI Panel Pentadbir (HTML Service Apps Script)
├── theme.css               # Gaya dikongsi (glass-card, tab, sorot)
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

## Konfigurasi Pusat (Masa Cutoff & Senarai Cuti)

Backend membaca **satu sumber kebenaran** untuk masa cutoff kelewatan dan senarai hari cuti, daripada **tab "Tetapan"** dalam Google Sheet. Ini bermakna anda boleh menukar cutoff atau cuti **tanpa mengedit kod**, dan perubahan itu digunakan secara seragam oleh ketiga-tiga skrin (scan, dashboard admin, portal ibu bapa).

### Cara Sediakan Tab "Tetapan"

Wujudkan tab baharu bernama **`Tetapan`** dalam Google Sheet, dengan **kolum A = kunci** dan **kolum B = nilai**:

| A (kunci) | B (nilai) | Penerangan |
|-----------|-----------|------------|
| `cutoff` | `07:21` | Masa cutoff kelewatan (format `HH:MM`). Selepas masa ini = LEWAT. |
| `hujung` | `0,6` | Nombor hari minggu yang dianggap cuti (0=Ahad, 1=Isnin, ... 6=Sabtu). |
| `cuti` | *(lihat format di bawah)* | Senarai cuti umum & cuti penggal. |

> **Nota:** Jika tab `Tetapan` tiada atau kosong, sistem **automatik guna nilai lalai** (cutoff `07:21`, Sabtu/Ahad cuti, senarai cuti 2026 Kumpulan B). Jadi sistem tetap berfungsi walaupun tab ini tidak disediakan.

### Format Nilai `cuti`

Gunakan `;` untuk memisahkan setiap cuti, dan `|` untuk memisahkan tarikh dengan nama cuti:

- **Tarikh tunggal:** `YYYY-MM-DD|Nama Cuti`
- **Julat tarikh:** `YYYY-MM-DD:YYYY-MM-DD|Nama Cuti`

Contoh:

```
2026-01-01|Tahun Baru;2026-02-17|Tahun Baru Cina;2026-03-21:2026-03-29|Cuti Penggal 1;2026-05-23:2026-06-07|Cuti Pertengahan Tahun;2026-08-29:2026-09-06|Cuti Penggal 2;2026-12-05:2026-12-31|Cuti Akhir Tahun
```

> **Penting:** Cuti Islam (Hari Raya, dll.) bertukar setiap tahun mengikut kalendar Hijrah, dan takwim penggal bertukar setiap tahun. Pastikan senarai `cuti` dikemas kini pada awal tahun persekolahan.

## Panel Pentadbir (Sidebar Google Sheets)

Panel pentadbir menyediakan **UI dalam Google Sheets** untuk mengurus tetapan dan murid tanpa menulis kod:

| Tab | Fungsi |
|-----|--------|
| **Tetapan** | Ubah masa cutoff, hari minggu cuti, dan senarai cuti (senarai lalai 2026 disediakan). |
| **Murid** | Tambah, kemas kini, dan padam murid sasaran (ID, Nama, Kelas, URL gambar). |

### Cara Menggunakan

1. Buka Google Sheet yang dipautkan kepada Apps Script ini.
2. Menu baru **`Q-TIBA`** akan muncul di atas (selepas `onOpen` dijalankan).
3. Klik **Q-TIBA → Panel Pentadbir** untuk membuka sidebar di sebelah kanan.
4. Gunakan tab **Tetapan** atau **Murid** dan klik butang **Simpan**.
5. Perubahan disimpan terus ke tab `Tetapan` / `MuridSasaran`, dan digunakan serta-merta oleh sistem.

> **Nota deploy:** Fail **`Panel.html`** perlu ditambahkan sebagai satu fail *HTML* (bukan `.gs`) dalam editor Apps Script, selain `code.gs`. Tanpa fail itu, butang menu "Panel Pentadbir" tidak akan dapat membuka sidebar.


## Persediaan

1. Salin `config.example.js` kepada `config.js`
2. Masukkan URL Google Apps Script Web App anda dalam `config.js`
3. **Tetapkan API Key** — nilai `QTIBA_API_KEY` dalam `config.js` **MESTI sama** dengan `var API_KEY` dalam `code.gs`. Gunakan nilai yang panjang & sukar diteka sebelum deploy.
4. Buka fail HTML dalam pelayar

**Penting:** `config.js` tidak dikomit ke repo (dalam `.gitignore`). Hanya `config.example.js` yang akan ada dalam repo sebagai template.

### Nota Deploy Backend (Apps Script)

1. **Akses "Anyone"** — Semasa deploy Web App, pilih **"Anyone"** (akaun Google boleh akses / sahaja). Ini perlu supaya `fetch` dengan `mode: 'cors'` dapat **membaca respons** daripada backend (untuk mengesahkan status hantar & menyingkirkan antrian offline). Jika dideploy secara private, frontend tidak boleh membaca respons dan semua rekod akan masuk ke antrian offline.
2. **Redeploy setiap kali `code.gs` diubah** — Tidak lupa klik **Deploy > Manage deployments** untuk mengemas kini versi Web App selepas sebarang perubahan.
3. **API Key** — Pastikan nilai `var API_KEY` dalam `code.gs` **sama** dengan `QTIBA_API_KEY` dalam `config.js`. Jika tidak, semua permintaan ditolak.

### Cegah Rekod Duplikat

Backend **menolak imbasan duplikat** — jika ID murid sudah wujud dalam tab **Rekod** pada tarikh yang sama, rekod kedua tidak disimpan (dipulangkan sebagai `duplicate`). Ini menghalang rekod berganda yang berpunca daripada lebih satu peranti, antrian offline yang dihantar semula, atau imbasan tidak sengaja berulang.

### Tracking Intervensi (Surat / Kaunseling / Rujuk)

Jadual **Senarai Murid Berisiko** dalam tab Analitik (dashboard admin) kini membolehkan guru merekod **tindakan intervensi** bagi setiap murid:

- **Status tindakan** (dropdown): `Belum`, `Surat 1`, `Surat 2`, `Surat 3`, `Kaunseling`, `Rujuk Pengetua`.
- **Tarikh** tindakan diambil.
- **Nota** ringkas untuk rekod follow-up.
- **Tren** (▲ naik / ▼ turun) — perbandingan kes minggu ini berbanding minggu lepas, untuk melihat sama ada intervensi berkesan (merosot → membaik).
- **Punca utama** per murid — sebab paling kerap bagi murid itu.

Perubahan disimpan **automatik** ke Google Sheet melalui backend (`action=saveIntervensi`). Semua rekod tindakan disimpan dalam tab **`Intervensi`** dengan lajur: `ID, Status, Tarikh, Nota`. Kerana ia disimpan di server, rekod tindakan **dikongsi** antara semua guru/peranti.

> Nota: Tab `Intervensi` dicipta secara automatik pada kali pertama rekod disimpan. Ia membaca akaun yang sama yang menguruskan `Rekod`/`MuridSasaran` (Web App dikaitkan dengan spreadsheet aktif).

### Auto-Cadang Tindakan Intervensi

Dalam jadual **Senarai Murid Berisiko**, sistem secara automatik mencadangkan status tindakan berdasarkan jumlah kes murid:

| Jumlah Kes | Cadangan Tindakan |
|-----------|-------------------|
| 1–2 | Surat 1 |
| 3–4 | Surat 2 |
| 5–6 | Surat 3 |
| 7–9 | Kaunseling |
| ≥10 | Rujuk Pengetua |

Pilihan yang disyorkan ditanda **"(disyorkan)"** dalam dropdown — guru boleh klik untuk menetapkannya atau pilih status lain secara manual.

### Kronologi Murid (PDF)

Klik nama murid di mana-mana senarai untuk membuka profil. Bahagian **Kronologi Murid** memaparkan:
- Timeline penuh **semua** ciri-scan kehadiran murid (bukan hanya yang terkini) dengan tarikh, hari, masa & lencana HADIR/LEWAT.
- Blok **Tindakan Intervensi semasa** (status, tarikh, nota).
- Butang **Muat Turun PDF** — menjana dokumen `Kronologi_<Nama>.pdf` (A4) yang sedia untuk fail murid.

### Ranking Kelas

Dalam tab **Analitik**, kad **Ranking Disiplin Kelas** menyusun kelas mengikut:
- Kadar hadir hari ini (peratusan & bar visual).
- Jumlah kes kelewatan (pangkat) sebagai pemutus seri.
Kelas terbaik ditanda 🏆, kelas paling perlu perhatian ditanda **PERLU TINDAKAN**.

### KPI Hadir Hari Ini

Kad baharu **Hadir Hari Ini** pada dashboard menunjukkan bilangan murid yang telah mengimbas (HADIR atau LEWAT) berbanding sasaran ("dari X") untuk tarikh aktif. Ia turut terkini apabila anda bersiar-siar antara tarikh.

### Mode Paparan Pintu (Gate Display)

Halaman **`gate.html`** ialah skrin paparan besar yang boleh dibuka pada **TV / papan paparan** di pintu pagar sekolah:

- **Jam digital** masa sebenar + tarikh & hari, dikemas kini setiap saat.
- **KPI raksaksa** — Murid Sasaran, Hadir Hari Ini, Lewat Hari Ini, Tak Hadir.
- **Senarai "Lewat Hari Ini"** berputar automatik (auto-scroll) dengan masa imbas & punca.
- **Auto-refresh** data setiap **60 saat** — nombor hidup tanpa perlu sentuh.
- **Fallback offline** — jika rangkaian terputus, paparan terus berfungsi menggunakan data terakhir yang tersimpan di peranti (amaran berstatus ditunjukkan).
- **Butang Muat Semula** manual & sokongan **Esc** untuk kembali ke dashboard.
- Hari cuti dikesan automatik (paparan "🎉 Cuti Sekolah").

> **Cara guna:** Buka `gate.html` pada pelayar, tekan **F11** (full-screen) apabila skrin sudah memasuki mod paparan. Pautan "Paparan Pintu" juga terdapat dalam header dashboard admin.

### Cache Senarai Murid (Offline Penuh)

Pemimbas QR kini menyimpan senarai murid sebagai cache dalam peranti (`qtiba_murid_cache_v1`):
- **Bila berjaya** — cache dikemas kini setiap kali `preloadStudentData` dimuatkan.
- **Bila offline** — senarai murid dibaca daripada cache supaya imbas-scan tetap dapat dipadankan dengan nama murid, walaupun tanpa internet.
- Amaran **violet** ("Menggunakan cache murid...") dipaparkan semasa mod offline, dan ia hilang secara automatik bila kembali dalam talian.
- Data imbasan tetap masuk ke antrian offline dan disegerakkan kemudian (gabungan ciri sedia ada).

## Keselamatan

- **PIN di-hash (SHA-256)** — PIN admin tidak disimpan dalam bentuk teks biasa dalam Google Sheet. PIN teks biasa lama akan di-naik taraf secara automatik pada log masuk pertama.
- **API Key** — Setiap permintaan ke back end mesti membawa `apiKey`; permintaan tanpa key yang sah akan ditolak.
- **Token sesi** — Tindakan sensitif (tukar PIN, daftar admin) memerlukan token sesi yang sah yang dikeluarkan semasa log masuk.
- **Sanitasi input** — Nama/kelas/punca murid di-escape sebelum dipaparkan (elak XSS) dan sanitized sebelum eksport CSV (elak CSV injection).
