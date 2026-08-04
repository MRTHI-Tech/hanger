/**
 * MV3 service worker.
 *
 * Owns three things:
 *  - opening the side panel (from the toolbar action or the in-page badge)
 *  - holding the most recently scraped product so the panel can pick it up
 *  - telling the panel which tab to talk to when it needs image bytes (§2.2)
 */

interface Handoff {
  product: unknown;
  tabId: number | null;
}

let pending: Handoff | null = null;

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'HANGER_OPEN_PANEL': {
      pending = {product: msg.product ?? null, tabId: sender.tab?.id ?? null};
      const windowId = sender.tab?.windowId;
      const tabId = sender.tab?.id;
      if (windowId !== undefined) {
        void chrome.sidePanel.open({windowId});
      } else if (tabId !== undefined) {
        void chrome.sidePanel.open({tabId});
      }
      // Nudge an already-open panel, which won't re-run its startup drain.
      void chrome.runtime.sendMessage({type: 'HANGER_PRODUCT_READY'}).catch(() => {});
      sendResponse({ok: true});
      return true;
    }

    case 'HANGER_FETCH_IMAGE_FALLBACK': {
      // The content script's fetch is subject to the page's CORS policy under
      // MV3; this one runs with the extension's host permissions and isn't.
      // It loses the page's referrer, so it's the second attempt, not the first.
      fetchWithHostPermissions(msg.url)
        .then((image) => sendResponse({ok: true, image}))
        .catch((error: Error) =>
          sendResponse({ok: false, error: error.message ?? 'fetch failed'}),
        );
      return true;
    }

    case 'HANGER_TAKE_PRODUCT': {
      // The panel drains the handoff so a later reload doesn't replay it.
      sendResponse(pending ?? {product: null, tabId: null});
      pending = null;
      return true;
    }

    default:
      return;
  }
});

interface FetchedImage {
  dataUrl: string;
  contentType: string;
  byteLength: number;
}

async function fetchWithHostPermissions(url: string): Promise<FetchedImage> {
  const response = await fetch(url, {credentials: 'include'});
  if (!response.ok) throw new Error(`image fetch failed (${response.status})`);

  const blob = await response.blob();
  if (blob.size === 0) throw new Error('image fetch returned nothing');

  // FileReader isn't available in a service worker, so build the data URL by
  // hand from the bytes.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000; // btoa chokes on very long argument lists
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const contentType = blob.type || 'image/jpeg';

  return {
    dataUrl: `data:${contentType};base64,${btoa(binary)}`,
    contentType,
    byteLength: blob.size,
  };
}

export {};
