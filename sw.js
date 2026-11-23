/* Service worker: cache-first app shell.
   Bump CACHE_VERSION on every deploy. Your data lives in IndexedDB, which this file
   never touches, so updates cannot wipe it. */
const CACHE_VERSION = 'gym-v1.0.0';
const SHELL = [
  './', './index.html', './app.css', './manifest.webmanifest',
  './js/core.js', './js/charts.js', './js/ui.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // only delete OUR old shell caches; never IndexedDB
    await Promise.all(keys.filter(k => k.startsWith('gym-') && k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
