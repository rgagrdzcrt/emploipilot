/* ZCRT — service worker : réseau d'abord, copie locale en secours.
 * Le site reste toujours à jour quand le réseau est là ; sans réseau (métro),
 * la dernière version chargée s'ouvre quand même. */

const CACHE = 'zcrt-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  // Seulement les fichiers du site lui-même (pas GitHub, ntfy ni les polices).
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    // « no-cache » : le navigateur revérifie auprès de GitHub au lieu de
    // reprendre sa copie en mémoire (gardée 10 min) ; une mise à jour du
    // site est donc visible dès le rechargement suivant.
    fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
