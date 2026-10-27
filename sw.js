// Keeps a copy of the app on the phone, so it opens and works without internet.
// Change VERSION when the app changes: the phone then fetches the new copy once.
const VERSION = 'gym-v4';
const FILES = ['./', 'index.html', 'data.js', 'app.js', 'manifest.webmanifest', 'fonts/urbanist-latin.woff2', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Newest version first when there is internet (so updates show up), the saved copy when there is none (or it is slow).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([fetch(e.request, { cache: 'no-cache' }), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 3000))]);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch { return (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match('index.html')) || Response.error(); }
  })());
});
