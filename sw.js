// =============================
// File: sw.js (Service Worker)
// Enhanced offline cache with network-first fallback for better iPhone offline support
// =============================
const VERSION = '0.0.6'; // App version - increment this to trigger updates
const CACHE = `gourmetapp-v${VERSION.replace(/\./g, '-')}`; // e.g., gourmetapp-v1-0-0
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './item-types-config.json',
  './version.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/barcode.png',
  // CSS files
  './css/variables.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/modals.css',
  './css/features/search.css',
  './css/features/items.css',
  './css/features/ratings.css',
  './css/features/photos.css',
  './css/features/pairings.css',
  './css/features/update-banner.css',
  './css/features/side-menu.css',
  // JS files
  './js/app.js',
  './js/config.js',
  './js/dataManager.js',
  './js/db.js',
  './js/updateManager.js',
  './js/utils.js',
  './js/components/modal.js',
  './js/components/photos.js',
  './js/components/rating.js',
  './js/external/openFoodFacts.js',
  './js/features/itemDetails.js',
  './js/features/itemEditor.js',
  './js/features/itemList.js',
  './js/features/pairingSelector.js',
  './js/features/scanner.js',
  './js/features/search.js',
  './js/features/sideMenu.js',
  './js/models/pairings.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    // For external APIs (like Open Food Facts), use network-first with cache fallback
    if (e.request.url.includes('openfoodfacts.org')) {
      e.respondWith(
        fetch(e.request)
          .then(response => {
            // Cache successful API responses
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE).then(cache => cache.put(e.request, clone));
            }
            return response;
          })
          .catch(() => caches.match(e.request)) // Fallback to cache if offline
      );
    }
    return; // Let browser handle other external requests normally
  }

  // For same-origin: cache-first strategy for better offline performance
  e.respondWith(
    caches.match(e.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(e.request).then(response => {
          // Cache successful responses for future offline use
          if (response.ok && e.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE).then(cache => cache.put(e.request, clone));
          }
          return response;
        });
      })
      .catch(() => {
        // If both cache and network fail, return offline page for navigation requests
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      })
  );
});

// Allow manual skipWaiting from page if needed
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING' || e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
