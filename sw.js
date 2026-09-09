const CACHE_NAME = 'qtiba-v12';

// Senarai fail penting untuk kedua-dua paparan (Guru & Ibu Bapa)
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './scan.html',
  './parent.html',
  './splash.js',
  './manifest.json',
  './manifest-parent.json',
  './q-tibalogo.png',
  './logo.png'
];

// 1. Install: Simpan fail asas ke dalam cache
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Activate: Kemaskini cache & bersihkan versi lama
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch: Ambil data live, guna cache jika offline
self.addEventListener('fetch', (e) => {
  // Abaikan simpanan cache untuk Google Sheets API & proxy API supaya data sentiasa LIVE
  if (e.request.url.includes('script.google.com') || e.request.url.includes('/api/')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, resClone);
        });
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
