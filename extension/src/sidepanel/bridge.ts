import type {ScrapedProduct} from '../shared/types';

/**
 * The panel's side of the extension plumbing: picking up a scraped product
 * from the service worker, and asking the content script for image bytes.
 */

export interface Handoff {
  product: ScrapedProduct | null;
  tabId: number | null;
}

const noChrome = typeof chrome === 'undefined' || !chrome.runtime?.id;

export async function takePendingProduct(): Promise<Handoff> {
  if (noChrome) return {product: previewProduct(), tabId: null};
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'HANGER_TAKE_PRODUCT',
    })) as Handoff | undefined;
    return response ?? {product: null, tabId: null};
  } catch {
    return {product: null, tabId: null};
  }
}

/**
 * Only reachable when the panel is opened as a plain page rather than as an
 * extension — the way the side panel gets previewed during development. Put a
 * ScrapedProduct in sessionStorage under this key to see the try-on screen
 * without a shop. Inside the extension this branch never runs.
 */
function previewProduct(): ScrapedProduct | null {
  try {
    const raw = sessionStorage.getItem('hanger.previewProduct');
    return raw ? (JSON.parse(raw) as ScrapedProduct) : null;
  } catch {
    return null;
  }
}

/** Fires when the badge is clicked while the panel is already open. */
export function onProductReady(handler: () => void): () => void {
  if (noChrome) return () => {};
  const listener = (msg: unknown) => {
    if ((msg as {type?: string})?.type === 'HANGER_PRODUCT_READY') handler();
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

export interface FetchedImage {
  dataUrl: string;
  contentType: string;
  byteLength: number;
}

/**
 * §2.2 — the bytes have to be pulled from inside the page, so the panel asks
 * the content script rather than fetching the CDN URL itself.
 */
type FetchReply = {ok: boolean; image?: FetchedImage; error?: string} | undefined;

export async function fetchImageViaTab(
  tabId: number,
  url: string,
): Promise<FetchedImage> {
  if (noChrome) {
    throw new HangerFetchError(
      'Open the product page and use the Try this on button there.',
    );
  }

  // First choice: the page itself, which carries the cookies and referrer the
  // CDN expects (§2.2).
  let pageError: string | undefined;
  try {
    const reply = (await chrome.tabs.sendMessage(tabId, {
      type: 'HANGER_FETCH_IMAGE',
      url,
    })) as FetchReply;
    if (reply?.ok && reply.image) return reply.image;
    pageError = reply?.error;
  } catch (error) {
    pageError = error instanceof Error ? error.message : String(error);
  }

  // Second choice: the service worker. Under MV3 the page's fetch obeys the
  // page's CORS policy, so a CDN on another origin without permissive headers
  // blocks it there but not here.
  console.warn(`[hanger] page fetch failed (${pageError}); trying the worker`);
  try {
    const reply = (await chrome.runtime.sendMessage({
      type: 'HANGER_FETCH_IMAGE_FALLBACK',
      url,
    })) as FetchReply;
    if (reply?.ok && reply.image) return reply.image;
    console.warn(`[hanger] worker fetch failed too: ${reply?.error}`);
  } catch (error) {
    console.warn('[hanger] worker fetch threw', error);
  }

  // §13: a sentence and a way forward, never a raw "Failed to fetch".
  throw new HangerFetchError(
    "This shop won't let us read that photo. Try picking a different one from the strip.",
  );
}

/** Carries a message that's already fit to show someone. */
export class HangerFetchError extends Error {
  hint = 'Pick another photo';
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, encoded] = dataUrl.split(',');
  const type = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], {type});
}
