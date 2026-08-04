/**
 * §2.2 — the reason this file exists.
 *
 * `ref_file_url` requires the image to be publicly downloadable by Perfect
 * Corp's servers, and plenty of retail CDNs answer an anonymous fetch with a
 * 403 (error_download_image). So we never hand a retailer URL to the API.
 * Instead the content script pulls the bytes from inside the page, where the
 * cookies and referrer are the ones the CDN expects, and those bytes go to our
 * backend, which uploads them through the File API and uses `ref_file_id`.
 *
 * This is the only approach that generalises across shops.
 */

export interface FetchedImage {
  dataUrl: string;
  contentType: string;
  byteLength: number;
}

/**
 * Caveat that cost an afternoon: under MV3 a content-script fetch follows the
 * *page's* CORS rules — it no longer inherits the extension's host permissions
 * the way it did under MV2. A CDN on a different origin that doesn't send
 * Access-Control-Allow-Origin therefore fails here with a bare "Failed to
 * fetch". That's why this can't be the only path: the panel falls back to the
 * service worker, which does have host permissions and is exempt from CORS.
 *
 * This one is still tried first because it's the only path that carries the
 * page's cookies and referrer, which is the whole point of §2.2.
 */
export async function fetchImageBytes(url: string): Promise<FetchedImage> {
  let response: Response;
  try {
    response = await fetch(url, {credentials: 'include', referrer: location.href});
  } catch (error) {
    console.warn(
      `[hanger] the page could not fetch ${url} (likely CORS); the service worker will try`,
      error,
    );
    throw new Error('page_fetch_blocked');
  }

  if (!response.ok) {
    throw new Error(`image fetch failed (${response.status})`);
  }

  const blob = await response.blob();
  if (blob.size === 0) throw new Error('image fetch returned nothing');

  return {
    dataUrl: await blobToDataUrl(blob),
    contentType: blob.type || 'image/jpeg',
    byteLength: blob.size,
  };
}

/**
 * Extension messaging can't carry a Blob or an ArrayBuffer, so the bytes travel
 * as a data URL and the panel turns them back into a Blob before upload.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('could not read the image'));
    reader.readAsDataURL(blob);
  });
}
