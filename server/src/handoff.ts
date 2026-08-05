import {randomBytes} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import {env} from './env.js';

/**
 * Phone handoff: the laptop shows a QR code, the phone takes the photo.
 *
 * The photo you want to hang is on your phone, not in your Downloads folder.
 * The server is already reachable from the phone — it binds every interface —
 * so all that's missing is a URL the phone can open and a way to hand the
 * bytes back.
 *
 * Sessions live in memory, not the database. They last minutes, they're single
 * use, and an abandoned one should evaporate rather than leave a row and an
 * orphaned file behind. A restart cancelling an in-flight handoff is the right
 * behaviour anyway: the QR on screen belongs to a server that no longer exists.
 */

/** Long enough that a code can't be guessed while it's alive. */
const TOKEN_BYTES = 16;

/** Enough to walk to your phone and take a photo; short enough to matter. */
export const HANDOFF_TTL_MS = 5 * 60 * 1000;

/** A phone photo is a few MB. Anything past this isn't one. */
export const MAX_HANDOFF_BYTES = 15 * 1024 * 1024;

export type HandoffPurpose = 'garment' | 'person';

export interface HandoffPhoto {
  bytes: Buffer;
  contentType: string;
}

interface Session {
  token: string;
  purpose: HandoffPurpose;
  expiresAt: number;
  photo: HandoffPhoto | null;
}

const sessions = new Map<string, Session>();

function sweep(): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

export function createHandoff(purpose: HandoffPurpose): Session {
  sweep();
  const session: Session = {
    token: randomBytes(TOKEN_BYTES).toString('hex'),
    purpose,
    expiresAt: Date.now() + HANDOFF_TTL_MS,
    photo: null,
  };
  sessions.set(session.token, session);
  return session;
}

/** Null for both an unknown token and an expired one — the phone can't tell them apart, and shouldn't. */
export function getHandoff(token: string): Session | null {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function putHandoffPhoto(token: string, photo: HandoffPhoto): boolean {
  const session = getHandoff(token);
  if (!session) return false;
  session.photo = photo;
  return true;
}

/**
 * Hand the photo to the panel and close the session. Single use: the token is
 * spent the moment the laptop has the bytes, so a QR photographed off someone's
 * screen is worth nothing after the fact.
 */
export function takeHandoffPhoto(token: string): HandoffPhoto | null {
  const session = getHandoff(token);
  if (!session?.photo) return null;
  sessions.delete(token);
  return session.photo;
}

/**
 * Addresses a phone on the same network could reach us on, best guess first.
 * A laptop can have several — Wi-Fi, a VPN, a container bridge — and only the
 * person looking at the screen knows which network their phone is on, so the
 * panel shows the URL as text alongside the QR.
 */
export function lanAddresses(): string[] {
  const found: string[] = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      // Node 18+ reports family as the string 'IPv4'; older ones used 4.
      const isV4 = address.family === 'IPv4' || (address.family as unknown) === 4;
      if (!isV4 || address.internal) continue;
      found.push(address.address);
    }
  }
  return found.sort((a, b) => rank(a) - rank(b));
}

/** Home Wi-Fi first, then other private ranges, then anything else. */
function rank(address: string): number {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  return 3;
}

/** The URL to put in the QR code, or null when there's no network to reach us on. */
export function handoffUrl(token: string): string | null {
  const host = lanAddresses()[0];
  if (!host) return null;
  return `http://${host}:${env.PORT}/handoff/${token}`;
}
