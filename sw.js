// Service worker: permite abrir la app sin conexión.
// Estrategia "red primero": si hay internet carga la última versión; si no, usa la copia guardada.
const CACHE = 'nire-app-a-v2';
const FITXATEGIAK = [
  './', './index.html', './estiloa.css', './app.js', './manifest.webmanifest',
  './ikonoak/ikonoa-180.png', './ikonoak/ikonoa-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FITXATEGIAK)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const kopia = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, kopia));
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
