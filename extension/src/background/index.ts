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

export {};
