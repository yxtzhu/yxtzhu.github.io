// App Launcher Service Worker
// Caches the launcher shell for offline use.
// Individual apps manage their own service workers.

const CACHE_NAME = 'app-launcher-v1';

const LAUNCHER_ASSETS = [
  '/apps/',
  '/apps/index.html',
  '/apps/manifest.json',
  '/apps/icons/icon.svg',
  '/apps/icons/icon-maskable.svg',
];

// Install: cache the launcher shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(LAUNCHER_ASSETS).catch(err => {
        // Non-fatal: continue even if some assets fail to cache
        console.warn('[SW] Some assets failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: remove stale caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for launcher assets, network-first for everything else
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Cache-first strategy for the launcher shell
  const isLauncherAsset = url.pathname === '/apps/' ||
    url.pathname === '/apps/index.html' ||
    url.pathname.startsWith('/apps/icons/') ||
    url.pathname === '/apps/manifest.json' ||
    url.pathname === '/apps/sw.js';

  if (isLauncherAsset) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
  }
  // Network-first for app content
  else {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
