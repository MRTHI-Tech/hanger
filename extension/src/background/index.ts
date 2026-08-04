/**
 * MV3 service worker.
 *
 * Owns three things:
 *  - opening the side panel (from the toolbar action or the in-page badge)
 *  - holding the most recently scraped product so the panel can pick it up
 *  - relaying messages between the content script and the panel
 */

/** Set when the content script hands us a product to try on. */
let pendingProduct: unknown = null;

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'HANGER_OPEN_PANEL': {
      pendingProduct = msg.product ?? null;
      const tabId = sender.tab?.id;
      const windowId = sender.tab?.windowId;
      if (windowId !== undefined) {
        void chrome.sidePanel.open({windowId});
      } else if (tabId !== undefined) {
        void chrome.sidePanel.open({tabId});
      }
      sendResponse({ok: true});
      return true;
    }

    case 'HANGER_TAKE_PRODUCT': {
      // The panel drains the handoff so a later reload doesn't replay it.
      sendResponse({product: pendingProduct});
      pendingProduct = null;
      return true;
    }

    case 'HANGER_SET_PRODUCT': {
      pendingProduct = msg.product ?? null;
      sendResponse({ok: true});
      return true;
    }

    default:
      return;
  }
});

export {};
