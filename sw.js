const CACHE_NAME = 'qtiba-v13';

// Senarai fail penting untuk kedua-dua paparan (Guru & Ibu Bapa)
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './scan.html',
  './parent.html',
  './gate.html',
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

  // Fail kritikal (index/parent/scan/gate/sw): sentiasa Network First, JANGAN
  // layan dari cache melainkan network gagal — elak user nampak versi lama.
  const kritikal = ['/index.html', '/parent.html', '/scan.html', '/gate.html', '/sw.js']
    .some(p => e.request.url.includes(p));

  if (kritikal) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then((response) => {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, resClone);
          }).catch(() => {});
          return response;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
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
