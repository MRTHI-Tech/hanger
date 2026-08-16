/**
 * Things other apps send into Hanger.
 *
 * The counterpart to `share.ts`, and the harder direction. Sharing *out* is one
 * API call; sharing *in* is a platform feature the app has to be registered for,
 * and only one of the two platforms allows it:
 *
 * **Android** honours `share_target` in the manifest. Screenshot something in
 * Instagram, tap Share, tap Hanger, and the browser posts the image to the
 * service worker, which parks it and reopens the app (`sw.js`). Nothing about
 * that is a hack — it is the platform's own mechanism, and it works whether or
 * not the app was running.
 *
 * **iOS** does not let web apps into the share sheet at all. There is no
 * workaround, no entitlement to ask for, nothing to build around: Apple's share
 * sheet lists native apps. So the iPhone route is the other way round — open
 * Hanger, pick the screenshot out of the photo roll — which is one extra tap
 * and is why "From your photos" exists on the Add sheet as its own way in
 * rather than only as a fallback for a failed share.
 *
 * Everything here is behind a capability check, because the whole mechanism
 * needs a service worker and the Cache API, and both need a secure context.
 * Over the LAN address this app is developed on, there is neither.
 */

/** Matches `INBOX` / `INBOX_PHOTO` in `public/sw.js`. */
const INBOX = 'hanger-shared-v1';
const INBOX_PHOTO = '/shared/photo';

export type SharedIn =
  | {kind: 'photo'; file: File}
  | {kind: 'link'; url: string}
  /** Something arrived that we can't make a garment out of. */
  | {kind: 'nothing'};

/**
 * What was shared into the app, if anything, taken once.
 *
 * "Taken" is the operative word: the query string is wiped and the picture is
 * dropped from the inbox before this returns. A shared screenshot that survived
 * a reload would reappear every time somebody pulled to refresh, and the second
 * one would be a mystery.
 */
export async function takeShared(): Promise<SharedIn | null> {
  const params = new URLSearchParams(window.location.search);
  const shared = params.get('shared');
  if (!shared) return null;

  const link = params.get('url');
  forget();

  if (shared === 'link' && link) return {kind: 'link', url: link};
  if (shared === 'photo') {
    const file = await takePhoto();
    return file ? {kind: 'photo', file} : {kind: 'nothing'};
  }
  return {kind: 'nothing'};
}

/**
 * Back to a plain address, without adding a history entry — the share is not a
 * place somebody should be able to press Back into.
 */
function forget(): void {
  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.hash,
  );
}

async function takePhoto(): Promise<File | null> {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(INBOX);
    const response = await cache.match(INBOX_PHOTO);
    if (!response) return null;

    const blob = await response.blob();
    await cache.delete(INBOX_PHOTO);
    if (blob.size === 0) return null;

    const type = blob.type || 'image/jpeg';
    return new File([blob], `shared.${type.split('/')[1] ?? 'jpg'}`, {type});
  } catch {
    // A worker that never installed, or storage that refused. Either way there
    // is nothing waiting, and the Add sheet is still there.
    return null;
  }
}
