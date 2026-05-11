const V = 'dd-v5';
const APP_SHELL = [
  '/DaftarEldayen/',
  '/DaftarEldayen/index.html',
  '/DaftarEldayen/app.js',
  '/DaftarEldayen/manifest.json'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(V).then(c => c.addAll(APP_SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (url.hostname === 'khaled-finance2026.github.io') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) {
          fetch(e.request).then(r => {
            if (r.ok) caches.open(V).then(c => c.put(e.request, r));
          }).catch(() => {});
          return cached;
        }
        return fetch(e.request).then(r => {
          if (r.ok) caches.open(V).then(c => c.put(e.request, r.clone()));
          return r;
        });
      })
    );
    return;
  }

  if (url.hostname.includes('supabase.co')) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r.ok) caches.open(V).then(c => c.put(e.request, r.clone()));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
  }
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
