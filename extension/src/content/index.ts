import {fetchImageBytes} from './fetchImage';
import {isProductPage, scrapeProduct} from './scrape';

/**
 * Content script: spot a product page, offer to try it on, and act as the
 * page-side hands for the panel — scraping and fetching image bytes from
 * inside the page's own context (§2.2).
 */

const BADGE_ID = 'hanger-try-on-badge';
let badgeHost: HTMLElement | null = null;
let lastUrl = location.href;

function removeBadge() {
  badgeHost?.remove();
  badgeHost = null;
}

/** Shadow DOM, so no shop's stylesheet can reach in and break it (§9.1). */
function injectBadge() {
  if (document.getElementById(BADGE_ID)) return;

  const host = document.createElement('div');
  host.id = BADGE_ID;
  host.style.cssText = [
    'position:fixed',
    'right:20px',
    'bottom:20px',
    'z-index:2147483647',
    'width:auto',
    'height:auto',
    'margin:0',
    'padding:0',
  ].join(';');

  const shadow = host.attachShadow({mode: 'open'});
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 18px;
      border: none;
      border-radius: 9999px;
      background: #225BFF;
      color: #ffffff;
      font: 600 15px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 6px rgba(29,28,17,0.10), 0 12px 24px rgba(29,28,17,0.15);
      cursor: pointer;
      transition: transform 125ms ease, box-shadow 125ms ease;
    }
    .badge:hover { transform: translateY(-1px); }
    .badge:active { transform: translateY(0); }
    .badge[disabled] { opacity: 0.7; cursor: default; }
    svg { display: block; }
    .spin { animation: spin 900ms linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;

  const button = document.createElement('button');
  button.className = 'badge';
  button.type = 'button';
  button.innerHTML = `${hangerIcon()}<span>Try this on</span>`;

  button.addEventListener('click', async () => {
    if (button.hasAttribute('disabled')) return;
    button.setAttribute('disabled', 'true');
    const label = button.querySelector('span');
    const original = label?.textContent ?? 'Try this on';
    if (label) label.textContent = 'Reading this page';

    try {
      const product = await scrapeProduct();
      await chrome.runtime.sendMessage({type: 'HANGER_OPEN_PANEL', product});
      if (label) label.textContent = 'Open in Hanger';
    } catch (error) {
      // Reloading the extension orphans every content script already running
      // in an open tab: this one's chrome.* handles are now dead and no amount
      // of retrying will revive them. Only a page reload will.
      if (isContextInvalidated(error)) {
        button.innerHTML = `${hangerIcon()}<span>Reload the page to use Hanger</span>`;
        button.setAttribute('disabled', 'true');
        button.title = 'Hanger was updated. Refresh this tab.';
        stopWatching();
        return;
      }
      console.warn('[hanger] could not read this page', error);
      if (label) label.textContent = 'Try again';
    } finally {
      if (!button.title) {
        setTimeout(() => {
          button.removeAttribute('disabled');
          if (label) label.textContent = original;
        }, 2500);
      }
    }
  });

  shadow.append(style, button);
  document.body.appendChild(host);
  badgeHost = host;
}

function hangerIcon(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 8 L3 17 h18 z"/>
    <path d="M12 8 V6.5"/>
    <path d="M12 6.5 a2 2 0 1 1 2-2"/>
  </svg>`;
}

function evaluate() {
  if (!document.body) return;
  if (isProductPage()) injectBadge();
  else removeBadge();
}

/**
 * True when this content script has been orphaned by an extension reload.
 * Every chrome.* call from here on throws, so the only cure is a page reload.
 */
function isContextInvalidated(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Extension context invalidated') ||
    message.includes('context invalidated') ||
    !chrome.runtime?.id
  );
}

let navigationTimer: number | null = null;

function stopWatching() {
  if (navigationTimer !== null) {
    clearInterval(navigationTimer);
    navigationTimer = null;
  }
}

/** Shops are single-page apps; the badge has to follow navigation. */
function watchForNavigation() {
  const check = () => {
    // An orphaned script would otherwise keep polling forever in a dead tab.
    if (!chrome.runtime?.id) {
      stopWatching();
      return;
    }
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    removeBadge();
    setTimeout(evaluate, 600);
  };
  window.addEventListener('popstate', check);
  navigationTimer = window.setInterval(check, 1000);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'HANGER_FETCH_IMAGE') {
    fetchImageBytes(msg.url)
      .then((image) => sendResponse({ok: true, image}))
      .catch((error: Error) =>
        sendResponse({ok: false, error: error.message ?? 'fetch failed'}),
      );
    return true; // async
  }

  if (msg.type === 'HANGER_RESCRAPE') {
    scrapeProduct()
      .then((product) => sendResponse({ok: true, product}))
      .catch((error: Error) => sendResponse({ok: false, error: error.message}));
    return true;
  }

  return;
});

// Some shops render the gallery late; look again once things settle.
evaluate();
setTimeout(evaluate, 1500);
setTimeout(evaluate, 4000);
watchForNavigation();
