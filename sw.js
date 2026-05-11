const CACHE = 'dd-v3';
const SCOPE = '/DaftarEldayen/';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([
      SCOPE,
      SCOPE + 'index.html',
      SCOPE + 'manifest.json',
      'https://unpkg.com/dexie@3/dist/dexie.js'
    ]).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname === 'khaled-finance2026.github.io') {
    e.respondWith(
      caches.match(e.request).then(c => c || fetch(e.request).then(r => {
        if (r.ok) caches.open(CACHE).then(cache => cache.put(e.request, r.clone()));
        return r;
      }))
    );
  }
});
