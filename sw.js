
const CACHE_NAME = 'spring-gala-v3';
const ASSETS = [
  '/',
  '/index.html',
  'https://storage.googleapis.com/example-eggy-addressable/DownloadFile/BG.jpg',
  'https://storage.googleapis.com/example-eggy-addressable/DownloadFile/2026Slogan.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
