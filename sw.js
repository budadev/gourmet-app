<!-- =============================
File: sw.js (Service Worker)
Simple offline cache for core assets. Fine-tune as needed.
================================ -->
// sw.js
const CACHE = 'gourmetapp-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  // icons
  './icons/icon-192.png',
  './icons/icon-512.png'
];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if(url.origin === location.origin){
    e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
  }
});