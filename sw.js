const V = 'dd-v7';
const APP_SHELL = [
  '/DaftarEldayen/',
  '/DaftarEldayen/index.html',
  '/DaftarEldayen/app.js',
  '/DaftarEldayen/manifest.json'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(V).then(c =>
      Promise.all(APP_SHELL.map(url => c.add(url).catch(() => {})))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== V).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      // بعد التفعيل مباشرة: أخبر كل الصفحات المفتوحة بإعادة التحميل
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(client => client.postMessage('RELOAD')))
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (url.hostname === 'khaled-finance2026.github.io') {
    e.respondWith(
      // الشبكة أولاً دائماً
      fetch(e.request)
        .then(r => {
          if (r.ok) {
            // احفظ في الكاش للاستخدام أوفلاين
            caches.open(V).then(c => c.put(e.request, r.clone()));
          }
          return r;
        })
        .catch(() =>
          // لا انترنت: استخدم الكاش
          caches.match(e.request)
            .then(cached => cached || caches.match('/DaftarEldayen/index.html'))
            .then(cached => cached || new Response('لا يوجد اتصال', { status: 503 }))
        )
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