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
export async function fetchImageViaTab(
  tabId: number,
  url: string,
): Promise<FetchedImage> {
  if (noChrome) throw new Error('Not running as an extension.');

  const response = (await chrome.tabs.sendMessage(tabId, {
    type: 'HANGER_FETCH_IMAGE',
    url,
  })) as {ok: boolean; image?: FetchedImage; error?: string} | undefined;

  if (!response?.ok || !response.image) {
    throw new Error(
      response?.error ??
        "We couldn't load that photo from the shop. Try picking a different one.",
    );
  }
  return response.image;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, encoded] = dataUrl.split(',');
  const type = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], {type});
}
