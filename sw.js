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

// Réseau lent (métro, une barre) : passé ce délai, la copie locale s'affiche tout de suite
// et la réponse du réseau, quand elle arrive, met la copie à jour pour la fois suivante.
// offres.json (lourd) a droit à un peu plus de temps.
const NETWORK_TIMEOUT_MS = 4000;
const DATA_TIMEOUT_MS = 8000;

self.addEventListener('fetch', event => {
  const request = event.request;
  // Seulement les fichiers du site lui-même (pas GitHub, ntfy ni les polices).
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // « no-cache » : le navigateur revérifie auprès de GitHub au lieu de
  // reprendre sa copie en mémoire (gardée 10 min) ; une mise à jour du
  // site est donc visible dès le rechargement suivant.
  const network = fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
    .then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    });
  event.waitUntil(network.catch(() => {})); // la mise à jour de la copie va jusqu'au bout
  const delay = /\.json$/.test(new URL(request.url).pathname) ? DATA_TIMEOUT_MS : NETWORK_TIMEOUT_MS;
  event.respondWith(new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const fromCache = () => caches.match(request, { ignoreSearch: true });
    const timer = setTimeout(() => fromCache().then(finish), delay);
    network
      .then(r => { clearTimeout(timer); finish(r); })
      .catch(() => fromCache().then(cached => {
        clearTimeout(timer);
        // Ni réseau ni copie : on laisse l'erreur réseau habituelle se produire.
        if (cached) finish(cached); else if (!done) { done = true; resolve(Response.error()); }
      }));
    // Copie absente au délai : on continue d'attendre le réseau (finish ignore les doublons).
  }));
});
