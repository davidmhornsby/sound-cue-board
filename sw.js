// Bumping this also requires updating the matching ?v= query on every <link>/<script>/import
// in index.html and js/*.js — that's what actually forces browsers to fetch fresh files
// instead of quietly reusing an old cached copy of one file alongside new ones.
const CACHE_NAME = 'cue-board-shell-v15';
const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css?v=15',
  './js/app.js?v=15',
  './js/db.js?v=15',
  './js/audio.js?v=15',
  './js/emoji-data.js?v=15',
  './js/waveform.js?v=15',
  './default-show.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
