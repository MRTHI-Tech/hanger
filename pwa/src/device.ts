import {setAuthToken} from '@hanger/shared/api';

/**
 * This phone's proof that it's allowed in.
 *
 * Earned once by repeating a code off the laptop's screen, then kept. There is
 * nothing else to log in with and nothing to remember — losing this token means
 * pairing again, which takes about ten seconds.
 *
 * It lives in localStorage, which for a home-screen app is as durable as the
 * app itself: it survives reboots and outlives the browser being closed, and it
 * goes when the app does.
 */

const TOKEN_KEY = 'hanger.deviceToken';

export function savedToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private browsing can refuse storage. Pairing still works for this
    // session; it just won't be remembered next time.
    return null;
  }
}

export function rememberToken(token: string | null): void {
  try {
    if (token === null) window.localStorage.removeItem(TOKEN_KEY);
    else window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage refused; the token still applies for this session */
  }
  setAuthToken(token);
}

/** Hand whatever we already have to the API client. Run once at startup. */
export function applyToken(): void {
  setAuthToken(savedToken());
}

/**
 * A name for this phone, for the list on the laptop. Nobody wants to type one,
 * and the useful question that list answers is "which of these is the phone in
 * my hand" — so guess from the user agent and let it be wrong occasionally.
 */
export function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android phone' : 'Android tablet';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  return 'A phone';
}

/**
 * A code handed over in the URL, from scanning the QR on the laptop.
 *
 * Read once and stripped from the address bar straight away: leaving it there
 * survives into bookmarks and the home-screen shortcut, and a stale code in a
 * shortcut would try to pair again on every launch.
 */
export function takeCodeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('pair');
  if (!code) return null;

  params.delete('pair');
  const query = params.toString();
  window.history.replaceState(
    null,
    '',
    window.location.pathname + (query ? `?${query}` : ''),
  );
  return code;
}
