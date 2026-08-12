import {randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {db} from './db.js';

/**
 * Letting a phone in.
 *
 * The side panel never needed this. It runs on the same machine as the server,
 * so being able to reach localhost was itself the proof of who you were — the
 * only way to talk to loopback is to be the laptop. A phone is a different
 * machine on a shared network, and "you're on the Wi-Fi" is not the same claim
 * as "this is your hanger".
 *
 * So a phone proves it once, physically: the laptop puts a short code on screen
 * and the phone repeats it back. Nothing is emailed, nothing is typed twice,
 * and there is no password to lose. In exchange the phone gets a long-lived
 * token it keeps.
 *
 * This is deliberately not an account system. There is one hanger. All this
 * decides is which devices may see it.
 */

/**
 * The alphabet for a code someone reads off a screen and types on a phone.
 * No O/0, no I/1/L — the pairs people mistype, and mistyping this is the whole
 * failure mode the code has.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Six characters of that alphabet is about 2^29, spent within five minutes. */
const CODE_LENGTH = 6;

/** Long enough to walk to your phone; short enough that a code left on a screen dies. */
export const CODE_TTL_MS = 5 * 60 * 1000;

/**
 * Wrong guesses before a code is destroyed. A code is short by design, so the
 * thing that has to be small is how many times anyone gets to try it.
 */
const MAX_ATTEMPTS = 5;

export interface PairingCode {
  code: string;
  /** Whose hanger this code lets a phone into — whoever was looking at it. */
  userId: string;
  expiresAt: number;
  attempts: number;
  /** Set once claimed, so the laptop can say "that worked" and stop polling. */
  claimedBy: string | null;
}

export interface Device {
  id: string;
  /** Whose hanger this phone was let into. */
  userId: string;
  name: string;
  pairedAt: number;
  lastSeenAt: number | null;
}

interface DeviceRow {
  id: string;
  token: string;
  user_id: string;
  name: string;
  paired_at: number;
  last_seen_at: number | null;
}

function toDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    pairedAt: row.paired_at,
    lastSeenAt: row.last_seen_at,
  };
}

/**
 * Codes live in memory, not the database — the same reasoning as a photo
 * handoff. They last minutes, they're single use, and a restart should leave
 * no trace of one: the code on the laptop's screen belongs to a server that no
 * longer exists. Tokens, which are meant to outlive a restart, go in SQLite.
 */
const codes = new Map<string, PairingCode>();

function sweep(): void {
  const now = Date.now();
  for (const [code, entry] of codes) {
    if (entry.expiresAt <= now) codes.delete(code);
  }
}

function randomCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

export function createPairingCode(userId: string): PairingCode {
  sweep();
  let code = randomCode();
  while (codes.has(code)) code = randomCode();

  const entry: PairingCode = {
    code,
    userId,
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
    claimedBy: null,
  };
  codes.set(code, entry);
  return entry;
}

/** Null for both an unknown code and an expired one — a caller can't tell, and shouldn't. */
export function getPairingCode(code: string): PairingCode | null {
  const entry = codes.get(normalise(code));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    codes.delete(entry.code);
    return null;
  }
  return entry;
}

/** Typed on a phone: lower case happens, and so does a stray space. */
export function normalise(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type ClaimResult =
  | {ok: true; token: string; device: Device}
  | {ok: false; reason: 'expired' | 'already_used' | 'wrong'};

/**
 * The phone spending the code. Single use in both directions: a correct code is
 * destroyed because it worked, and a code guessed at too often is destroyed
 * because it didn't.
 */
export function claimPairingCode(rawCode: string, deviceName: string): ClaimResult {
  const code = normalise(rawCode);
  // Looked up before sweeping, so a code that has just run out is still here to
  // be told apart from one that never existed. The two need different advice:
  // a mistyped code should be retyped, an expired one needs a new code on the
  // laptop, and sending someone back to the laptop for a typo is a wasted trip.
  const entry = codes.get(code);
  sweep();

  if (!entry) return {ok: false, reason: 'wrong'};
  if (entry.expiresAt <= Date.now()) {
    codes.delete(code);
    return {ok: false, reason: 'expired'};
  }
  if (entry.claimedBy) return {ok: false, reason: 'already_used'};

  // Reached only on an exact match, so this counts near-misses on a *known*
  // code — someone hammering the same six characters — rather than typos.
  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    codes.delete(code);
    return {ok: false, reason: 'expired'};
  }

  const device = registerDevice(entry.userId, deviceName);
  entry.claimedBy = device.device.id;
  // Kept, not deleted: the laptop is still polling and deserves to be told it
  // worked. It expires on its own minutes from now, and is unusable meanwhile.
  return {ok: true, token: device.token, device: device.device};
}

function registerDevice(
  userId: string,
  name: string,
): {token: string; device: Device} {
  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  const pairedAt = Date.now();

  db.prepare(
    `INSERT INTO device (id, token, user_id, name, paired_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  ).run(id, token, userId, name.slice(0, 60) || 'A phone', pairedAt);

  return {token, device: {id, userId, name, pairedAt, lastSeenAt: null}};
}

/**
 * Who is calling, if anyone. Compared in constant time: a token lookup that
 * returns faster for a near-miss is a token lookup that leaks the token.
 */
export function deviceForToken(token: string): Device | null {
  if (!token) return null;
  const rows = db.prepare('SELECT * FROM device').all() as DeviceRow[];
  const given = Buffer.from(token);

  for (const row of rows) {
    const known = Buffer.from(row.token);
    if (known.length !== given.length) continue;
    if (!timingSafeEqual(known, given)) continue;
    return toDevice(row);
  }
  return null;
}

/**
 * Written on every authenticated call, so the panel's device list can say when
 * a phone was last around — which is how you tell which row is the phone you
 * still own and which is the one you sold.
 */
export function touchDevice(id: string): void {
  db.prepare('UPDATE device SET last_seen_at = ? WHERE id = ?').run(Date.now(), id);
}

export function listDevices(userId: string): Device[] {
  const rows = db
    .prepare('SELECT * FROM device WHERE user_id = ? ORDER BY paired_at DESC')
    .all(userId) as DeviceRow[];
  return rows.map(toDevice);
}

/**
 * Revoking a device. The next call it makes is refused and it pairs again or
 * doesn't. Scoped to the owner, so the worst a stolen id can do is nothing.
 */
export function removeDevice(userId: string, id: string): boolean {
  return (
    db.prepare('DELETE FROM device WHERE id = ? AND user_id = ?').run(id, userId)
      .changes > 0
  );
}
