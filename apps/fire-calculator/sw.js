const CACHE = 'fire-calculator-v4';
const ASSETS = [
  './', './index.html', './manifest.json', './app.js',
  './icons/icon.svg', './icons/icon-maskable.svg',
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
  './vendor/prop-types.min.js',
  './vendor/recharts.min.js',
];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()))
);

self.addEventListener('activate', e =>
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()))
);

// Cache-first, then fall back to network. Successful GET responses (including the
// CDN-hosted React / Recharts / Babel bundles and web fonts) are cached at runtime
// so the calculator keeps working offline after the first load.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
