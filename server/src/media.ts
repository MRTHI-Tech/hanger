import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {db} from './db.js';

/**
 * Signed image links.
 *
 * Everything else a client asks for goes through auth.ts and carries a token.
 * Images can't: an `<img src>` sends no Authorization header, and neither does
 * a `<video>`. So instead of proving who you are when you fetch the picture,
 * you prove the server gave you the link — the server only ever puts a link in
 * a response it has already decided you're allowed to see.
 *
 * Until now these were unsigned, and the defence was that the filenames are
 * random UUIDs. That is genuinely fine on your own Wi-Fi and not fine on a
 * public URL, where an unguessable-but-permanent link is one screenshot away
 * from being a permanent one.
 *
 * Links expire. Not because a leaked one is a catastrophe — it exposes one
 * photograph — but because "forever" is a promise nothing here needs to make.
 */

/**
 * Long enough that a page left open all morning still shows its pictures, and
 * that a video which starts playing can finish. Short enough that a link
 * pasted into a chat is dead by the time anyone opens it.
 */
const LIFETIME_MS = 6 * 60 * 60 * 1000;

/** 128 bits of the digest, which is far more than a guessing attack can chew. */
const SIGNATURE_CHARS = 22;

const SECRET_KEY = 'media_secret';

let cached: string | null = null;

/**
 * The signing key, generated once and kept in the database.
 *
 * Deliberately not an environment variable. Nobody should have to set anything
 * to run this, and a key that lives with the data is a key that survives a
 * restart — which matters, because rotating it silently breaks every link the
 * clients are currently holding.
 */
function secret(): string {
  if (cached) return cached;

  const row = db
    .prepare('SELECT value FROM app_setting WHERE key = ?')
    .get(SECRET_KEY) as {value: string} | undefined;

  if (row) {
    cached = row.value;
    return cached;
  }

  const created = randomBytes(32).toString('hex');
  // INSERT OR IGNORE, then read back: two workers booting at once would
  // otherwise each write their own key and disagree about every signature.
  db.prepare('INSERT OR IGNORE INTO app_setting (key, value) VALUES (?, ?)').run(
    SECRET_KEY,
    created,
  );
  cached = (
    db.prepare('SELECT value FROM app_setting WHERE key = ?').get(SECRET_KEY) as {
      value: string;
    }
  ).value;
  return cached;
}

function sign(name: string, expiresAt: number): string {
  return createHmac('sha256', secret())
    .update(`${name}|${expiresAt}`)
    .digest('base64url')
    .slice(0, SIGNATURE_CHARS);
}

/** The path a client should be handed for a stored file. */
export function signedMediaPath(name: string): string {
  const expiresAt = Date.now() + LIFETIME_MS;
  return `/media/${name}?e=${expiresAt}&s=${sign(name, expiresAt)}`;
}

export type MediaCheck = 'ok' | 'expired' | 'bad';

export function checkMediaSignature(
  name: string,
  expiresAtRaw: string | undefined,
  signature: string | undefined,
): MediaCheck {
  if (!expiresAtRaw || !signature) return 'bad';

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt)) return 'bad';

  // The signature is checked before the clock. An expired link that was never
  // signed by us is a forgery, not a stale link, and shouldn't be told it can
  // simply ask for a fresh one.
  const expected = Buffer.from(sign(name, expiresAt));
  const given = Buffer.from(signature);
  if (expected.length !== given.length) return 'bad';
  if (!timingSafeEqual(expected, given)) return 'bad';

  return expiresAt < Date.now() ? 'expired' : 'ok';
}
