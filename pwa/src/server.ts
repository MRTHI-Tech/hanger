import {setApiBase} from '@hanger/shared/api';

/**
 * Finding the Hanger server from a phone.
 *
 * The side panel can hardcode localhost because it runs on the same machine as
 * the server. The phone can't: localhost on a phone is the phone.
 *
 * What's true instead is that the phone loaded this app from somewhere — and
 * that somewhere is the laptop. So the server is almost certainly the same host
 * on the server's port. Open http://192.168.1.20:5174 on your phone and the API
 * is http://192.168.1.20:8787, with nothing to configure and nothing to type.
 *
 * The guess is only a default. It's overridable and remembered, because a
 * deployed server (Phase 8) won't sit on the same host as the app, and because
 * a guess that's wrong should be fixable from inside the app rather than by
 * editing a file.
 */

/** Where the server listens. Matches PORT in server/.env. */
const SERVER_PORT = 8787;

const STORAGE_KEY = 'hanger.serverUrl';

/** Set at build time for a deployed app; unset in development. */
const CONFIGURED = import.meta.env.VITE_API_BASE as string | undefined;

/** The same host this page came from, on the server's port. */
export function guessServerUrl(): string {
  const {protocol, hostname} = window.location;
  return `${protocol}//${hostname}:${SERVER_PORT}`;
}

/** What the person typed in Settings, if they typed anything. */
export function savedServerUrl(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing can refuse storage. The guess still works.
    return null;
  }
}

export function serverUrl(): string {
  return savedServerUrl() ?? CONFIGURED ?? guessServerUrl();
}

/** Pass null to forget the override and go back to the guess. */
export function rememberServerUrl(url: string | null): void {
  try {
    if (url === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ''));
  } catch {
    /* storage refused; the address still applies for this session */
  }
  applyServerUrl();
}

/** Tell the shared API client where to call. Run once before the first call. */
export function applyServerUrl(): void {
  setApiBase(serverUrl());
}
