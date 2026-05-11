const CACHE = 'daftardain-v2';
const SCOPE = '/DaftarEldayen/';

const PRECACHE = [
  SCOPE,
  SCOPE + 'index.html',
  SCOPE + 'manifest.json',
  'https://unpkg.com/dexie@3/dist/dexie.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  if (url.hostname === 'khaled-finance2026.github.io') {
    e.respondWith(
      caches.match(e.request)
        .then(cached => cached || fetch(e.request)
          .then(res => {
            if (res.ok) {
              caches.open(CACHE).then(c => c.put(e.request, res.clone()));
            }
            return res;
          })
        )
    );
    return;
  }

  if (url.hostname.includes('supabase.co')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
