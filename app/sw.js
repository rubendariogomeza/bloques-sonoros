/**
 * Service worker: shell offline tras la primera carga.
 *
 * - Precachea la app completa (incluye el decodificador QR vendorizado).
 * - No toca `/api/*`: las licencias siempre hablan con el servidor cuando hay red.
 * - Estrategia cache-first con revalidación en segundo plano para el shell.
 */
// Súbelo en cada despliegue: la estrategia es cache-first con revalidación, así
// que la primera carga tras publicar sirve la versión anterior y la actualiza detrás.
const VERSION = 'v2';
const CACHE = `bloques-shell-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/app.css',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './vendor/jsqr.js',
  './src/main.js',
  './src/core/config.js',
  './src/core/util.js',
  './src/platform/storage.js',
  './src/auth/token.js',
  './src/auth/api.js',
  './src/auth/license.js',
  './src/auth/qr.js',
  './src/vision/color.js',
  './src/vision/background.js',
  './src/vision/mask.js',
  './src/vision/morphology.js',
  './src/vision/components.js',
  './src/vision/layers.js',
  './src/vision/columns.js',
  './src/vision/align.js',
  './src/vision/engine.js',
  './src/vision/camera.js',
  './src/vision/simulator.js',
  './src/sequencer/transport.js',
  './src/sequencer/scheduler.js',
  './src/sequencer/pattern.js',
  './src/audio/synth.js',
  './src/audio/kits.js',
  './src/audio/engine.js',
  './src/ui/dom.js',
  './src/ui/overlay.js',
  './src/ui/hud.js',
  './src/ui/dock.js',
  './src/ui/sheets.js',
  './src/ui/views.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html', { ignoreSearch: true })),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) {
        // Revalidación silenciosa para no quedar atrapados en una versión vieja.
        fetch(request)
          .then((response) => {
            if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          })
          .catch(() => {});
        return cached;
      }
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
