/**
 * The service worker. Deliberately the smallest one that does two jobs.
 *
 * The first is to make the app installable and to open instantly — so it caches
 * the shell (the page, its script, its stylesheet, the fonts and the icons) and
 * nothing else.
 *
 * It must never cache a call to the server. Your hanger changes on the laptop
 * while the phone is in your pocket, and a stale garment list that can't be
 * refreshed is worse than a spinner. Anything that isn't a same-origin GET for
 * a static asset goes straight to the network, untouched.
 *
 * The second is to catch what other apps share into Hanger. Android posts a
 * share to `/share-target` as a form, and there is no server on this origin to
 * post it to — the whole point of the share target is that it lands in an app
 * that may well be offline. So the worker answers the POST itself: it takes the
 * picture out of the form, keeps it where the page can find it, and redirects
 * to the app. That redirect must be a 303, or the browser would repeat the POST
 * against the page it lands on.
 */

const CACHE = 'hanger-shell-v1';

/** Matches `share_target.action` in the manifest. */
const SHARE_TARGET = '/share-target';

/** Where a shared picture waits between the worker taking it and the app asking. */
const INBOX = 'hanger-shared-v1';
const INBOX_PHOTO = '/shared/photo';

self.addEventListener('install', (event) => {
  // The shell is fingerprinted by the build, so there's nothing useful to name
  // ahead of time. Fill the cache as things are actually asked for.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        // The inbox survives an update on purpose: a share can arrive in the
        // same second a new worker activates, and throwing away somebody's
        // screenshot to tidy up would be the worst possible moment for it.
        if (key !== CACHE && key !== INBOX) await caches.delete(key);
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

/**
 * Pull a shop link out of whatever the sharing app sent.
 *
 * Android is inconsistent about this by design: some apps fill `url`, most put
 * everything in `text` ("Look at this https://…"), and a few only set `title`.
 * So all three are searched for the first thing that looks like an address.
 */
function firstLink(...values) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const match = value.match(/https?:\/\/[^\s<>"']+/i);
    if (match) return match[0];
  }
  return null;
}

async function receiveShare(request) {
  try {
    const form = await request.formData();

    const image = form.get('image');
    if (image && typeof image !== 'string' && image.size > 0) {
      const cache = await caches.open(INBOX);
      await cache.put(
        INBOX_PHOTO,
        new Response(image, {
          headers: {'Content-Type': image.type || 'image/jpeg'},
        }),
      );
      return Response.redirect('/?shared=photo', 303);
    }

    const link = firstLink(form.get('url'), form.get('text'), form.get('title'));
    if (link) {
      return Response.redirect(`/?shared=link&url=${encodeURIComponent(link)}`, 303);
    }

    // Somebody shared something we can't do anything with — a contact card, a
    // note. Still open the app and say so, rather than appearing to crash.
    return Response.redirect('/?shared=nothing', 303);
  } catch (err) {
    return Response.redirect('/?shared=nothing', 303);
  }
}

self.addEventListener('fetch', (event) => {
  const {request} = event;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === SHARE_TARGET) {
    event.respondWith(receiveShare(request));
    return;
  }

  if (request.method !== 'GET') return;
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
