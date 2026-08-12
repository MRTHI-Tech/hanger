/**
 * The service worker. Deliberately the smallest one that does its job.
 *
 * Its job is to make the app installable and to open instantly — so it caches
 * the shell (the page, its script, its stylesheet, the fonts and the icons) and
 * nothing else.
 *
 * It must never cache a call to the server. Your hanger changes on the laptop
 * while the phone is in your pocket, and a stale garment list that can't be
 * refreshed is worse than a spinner. Anything that isn't a same-origin GET for
 * a static asset goes straight to the network, untouched.
 */

const CACHE = 'hanger-shell-v1';

self.addEventListener('install', (event) => {
  // The shell is fingerprinted by the build, so there's nothing useful to name
  // ahead of time. Fill the cache as things are actually asked for.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** Does this look like part of the app shell rather than someone's data? */
function isShellAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname === '/' ||
    /\.(?:js|css|woff2|png|svg|webmanifest)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const {request} = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isShellAsset(url)) return; // the server's problem, not ours

  // Network first, so a rebuilt shell is picked up on the next load rather than
  // the load after that. The cache is the fallback for a phone with no signal.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
      }
    })(),
  );
});
