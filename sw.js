// =============================
// File: sw.js (Service Worker)
// Enhanced offline cache with network-first fallback for better iPhone offline support
// =============================
const VERSION = '0.0.27';
const CACHE = `gourmetapp-v${VERSION.replace(/\./g, '-')}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './version.json',
  './item-types-config.json',
  // Icons
  './icons/barcode.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // CSS files
  './css/base.css',
  './css/components.css',
  './css/layout.css',
  './css/modals.css',
  './css/variables.css',
  './css/features/items.css',
  './css/features/pairings.css',
  './css/features/photos.css',
  './css/features/ratings.css',
  './css/features/search.css',
  './css/features/side-menu.css',
  './css/features/update-banner.css',
  './css/features/places.css',
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
  './js/components/placeSelector.js',
  './js/features/itemDetails.js',
  './js/features/itemEditor.js',
  './js/features/itemList.js',
  './js/features/pairingSelector.js',
  './js/features/scanner.js',
  './js/features/search.js',
  './js/features/sideMenu.js',
  './js/models/pairings.js',
  './js/models/places.js',
  './js/external/openFoodFacts.js'
];

self.addEventListener('install', e => {
  console.log('[SW] Installing version:', VERSION);
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      console.log('[SW] Caching assets');
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  console.log('[SW] Activating version:', VERSION);
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network-first for external APIs
  if (e.request.url.includes('openfoodfacts.org')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for app assets
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(response => {
        // Cache new responses
        if (response.status === 200 && e.request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Fallback to index.html for navigation requests
      if (e.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING' || e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
