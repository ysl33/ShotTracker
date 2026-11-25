const CACHE_PREFIX = 'fairway-shell:' + self.registration.scope + ':';
const CACHE = CACHE_PREFIX + 'v2';
const FILES = ['./index.html', './app.js', './model.js', './map.js', './styles.css',
  './manifest.webmanifest', './icon.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const responses = await Promise.all(FILES.map(file => fetch(file, { cache: 'reload' })));
    if (responses.some(response => !response.ok || response.redirected)) {
      throw new Error('Offline files could not be cached.');
    }
    await Promise.all(responses.map((response, index) => cache.put(FILES[index], response)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    const path = new URL(request.url).pathname;
    if (path !== new URL(self.registration.scope).pathname &&
        path !== new URL('./index.html', self.registration.scope).pathname) return;
    event.respondWith(fetch(request).catch(async () => (await caches.open(CACHE)).match('./index.html')));
  } else {
    const known = FILES.some(file => request.url === new URL(file, self.registration.scope).href);
    if (known) event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(request)) ?? fetch(request)));
  }
});
