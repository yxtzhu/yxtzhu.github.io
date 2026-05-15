const CACHE = 'diet-tracker-v15';
const ASSETS = ['./', './index.html', './app.js', './manifest.json', './icons/icon.svg', './icons/icon-maskable.svg'];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()))
);

self.addEventListener('activate', e =>
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()))
);

// Network-first for same-origin app shell so home-screen installs pick up
// new deploys; fall back to cache only when offline. Cross-origin requests
// (Gemini API, fonts) are handled by the browser directly.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(response => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return response;
    }).catch(() => caches.match(e.request))
  );
});
