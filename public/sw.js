// Service Worker — Myst Ki Warriors
// Estratégia: cache-first para estáticos, network-only para APIs do jogo.
const CACHE = 'mkw-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/jogar',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/manifest.webmanifest',
  '/images/banner-mystki.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // APIs do jogo: sempre rede (nunca cache — estado dinâmico)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({ success: false, error: { code: 'OFFLINE', message: 'Sem conexão.' } }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Imagens e ícones: cache-first
  if (url.pathname.startsWith('/images/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ??
          fetch(event.request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
            return res;
          })
      )
    );
    return;
  }

  // Páginas: network-first com fallback para cache (offline básico)
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match('/')))
  );
});
