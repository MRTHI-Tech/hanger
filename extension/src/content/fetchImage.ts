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

export async function fetchImageBytes(url: string): Promise<FetchedImage> {
  const response = await fetch(url, {
    credentials: 'include',
    referrer: location.href,
  });
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
