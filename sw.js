// =============================
// File: sw.js (Service Worker)
// Enhanced offline cache with network-first fallback for better iPhone offline support
// =============================
const VERSION = '0.0.7'; // App version - increment this to trigger updates
const CACHE = `gourmetapp-v${VERSION.replace(/\./g, '-')}`; // e.g., gourmetapp-v0-0-6

// Critical assets to cache on install (essential for offline startup)
const CRITICAL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Core CSS (layout and base styles)
  './css/variables.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/modals.css',
  // Core JS (app initialization)
  './js/app.js',
  './js/db.js',
  './js/utils.js'
];

// File patterns to cache dynamically (all other same-origin resources)
const CACHEABLE_PATTERNS = [
  /\.css$/,
  /\.js$/,
  /\.json$/,
  /\.png$/,
  /\.jpg$/,
  /\.jpeg$/,
  /\.svg$/,
  /\.webp$/,
  /\.woff2?$/,
  /\.ttf$/
];

function shouldCache(url) {
  const urlObj = new URL(url);

  // Only cache same-origin requests
  if (urlObj.origin !== location.origin) {
    return false;
  }

  // Check if URL matches any cacheable pattern
  return CACHEABLE_PATTERNS.some(pattern => pattern.test(urlObj.pathname));
}

self.addEventListener('install', e => {
  console.log('[SW] Installing service worker version:', VERSION);
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => {
        console.log('[SW] Caching critical assets');
        return cache.addAll(CRITICAL_ASSETS);
      })
      .then(() => {
        console.log('[SW] Critical assets cached, skipping waiting');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Failed to cache critical assets:', err);
      })
  );
});

self.addEventListener('activate', e => {
  console.log('[SW] Activating service worker version:', VERSION);
  e.waitUntil(
    caches.keys()
      .then(keys => {
        console.log('[SW] Cleaning old caches');
        return Promise.all(
          keys.filter(k => k !== CACHE).map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
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

  // For same-origin: cache-first strategy with dynamic caching
  e.respondWith(
    caches.match(e.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(e.request).then(response => {
          // Cache successful responses for future offline use
          if (response.ok && e.request.method === 'GET' && shouldCache(e.request.url)) {
            const clone = response.clone();
            caches.open(CACHE).then(cache => {
              cache.put(e.request, clone);
              console.log('[SW] Dynamically cached:', e.request.url);
            });
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
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
});
