// =============================
// File: sw.js (Service Worker)
// Simple offline cache for core assets. Fine-tune as needed.
// =============================
const CACHE = 'gourmetapp-v2'; // bumped version to pick up latest index.html changes
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './item-types-config.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/barcode.png'
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
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request))
    );
  }
});
// Allow manual skipWaiting from page if needed
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
