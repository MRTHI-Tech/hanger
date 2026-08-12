import type {Context, MiddlewareHandler} from 'hono';
import {deviceForToken, touchDevice, type Device} from './pairing.js';
import {getUser, localUser, type User} from './users.js';
import {
  clerkConfigured,
  looksLikeSessionToken,
  refreshProfileInBackground,
  userForSessionToken,
} from './clerk.js';
import {env} from './env.js';
import {CodedError} from './youcam/errors.js';

/**
 * Who is asking, and whose wardrobe they get.
 *
 * Every request that touches somebody's clothes resolves to exactly one user
 * here, and every query underneath is scoped to that user's id. This file is
 * the only place that decides it — one seam, so there is one place to be sure
 * about rather than forty.
 *
 * Three ways to be somebody:
 *
 *   signed in   carries a Clerk session token. This is the one that matters
 *               once the server is on a public URL, and the only one that
 *               scales past a single person.
 *
 *   a phone     carries a device token it earned by pairing (pairing.ts). The
 *               token names a device, and the device names its owner.
 *
 *   the laptop  reaches the server on loopback, which nothing else on the
 *               network can. A convenience for development — see
 *               `trustsLoopback` below for exactly when it applies, because
 *               getting this wrong behind a proxy would hand every stranger
 *               the same wardrobe.
 *
 * Deliberately not covered:
 *
 *   /health     somebody has to be able to ask "are you there?" before they
 *               can sign in, and a reachability check that requires being let
 *               in first is no use to anyone.
 *   /media      an <img> tag cannot send an Authorization header, so those
 *               links carry a signature instead (media.ts).
 *   /handoff    already carries its own single-use token, and is reached by a
 *               phone that by definition hasn't been let in yet.
 */

/** Loopback, in the shapes Node reports it. */
function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address.startsWith('127.')
  );
}

/**
 * Is the socket genuinely this machine?
 *
 * The forwarded-header check is the part that matters. A hosting platform puts
 * a proxy in front of the container, and depending on how it is wired the
 * connection the app sees can *originate on loopback* — at which point "only
 * this machine can reach loopback" quietly becomes "everyone on the internet
 * can", and every visitor would be handed the local user's wardrobe.
 *
 * A real local request has never been forwarded, so it carries none of these
 * headers. One that has is not local, whatever its socket says.
 */
export function isLocalRequest(c: Context): boolean {
  const forwarded =
    c.req.header('x-forwarded-for') ??
    c.req.header('forwarded') ??
    c.req.header('x-real-ip');
  if (forwarded) return false;

  const incoming = (c.env as {incoming?: {socket?: {remoteAddress?: string}}})
    ?.incoming;
  return isLoopback(incoming?.socket?.remoteAddress);
}

/**
 * Does reaching us on loopback count as being signed in?
 *
 * Yes while there is no sign-in configured, which is how a fresh clone and the
 * whole of development have always worked: no keys, no accounts, one wardrobe.
 *
 * Once Clerk is configured the answer is no by default, because the shortcut
 * has stopped being true — the server isn't your laptop any more. `TRUST_LOOPBACK`
 * forces it back on for the window where the side panel has keys but hasn't
 * been taught to sign in yet.
 */
function trustsLoopback(): boolean {
  return env.TRUST_LOOPBACK ?? !clerkConfigured;
}

/** Exported so the boot log can say so out loud, which is the only real guard. */
export const trustsLoopbackNow = trustsLoopback;

function bearer(c: Context): string {
  const header = c.req.header('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? '';
}

/** Set by attachUser; read by everything else. */
const USER_KEY = 'user';
const DEVICE_KEY = 'device';

/**
 * Works out who is calling and remembers it on the request.
 *
 * Best effort and never throws: `/pair/claim` is reached by a phone with
 * nothing at all, and refusing it here would make pairing impossible. Deciding
 * whether "nobody" is acceptable belongs to each route, below.
 *
 * Runs before the routes because verifying a session token is asynchronous and
 * the handlers are not — this is what lets `currentUser()` stay a plain
 * function that either has an answer or throws.
 */
export const attachUser: MiddlewareHandler = async (c, next) => {
  const token = bearer(c);

  if (token && looksLikeSessionToken(token)) {
    const user = await userForSessionToken(token);
    if (user) {
      refreshProfileInBackground(user);
      c.set(USER_KEY, user);
      return next();
    }
    // A three-part token that Clerk won't vouch for is not then tried as a
    // device token: device tokens are hex and could never look like this.
  } else if (token) {
    const device = deviceForToken(token);
    if (device) {
      const user = getUser(device.userId);
      if (user) {
        touchDevice(device.id);
        c.set(DEVICE_KEY, device);
        c.set(USER_KEY, user);
      }
    }
  } else if (isLocalRequest(c) && trustsLoopback()) {
    c.set(USER_KEY, localUser());
  }

  return next();
};

/**
 * Whose wardrobe this request gets. Throws rather than returning null: there is
 * no such thing as a half-authenticated read here, and a function that could
 * return null is a function somebody will forget to check.
 */
export function currentUser(c: Context): User {
  const user = c.get(USER_KEY) as User | undefined;
  if (!user) throw new CodedError(clerkConfigured ? 'not_signed_in' : 'not_paired');
  return user;
}

/** The device this request came from, or null when it isn't a paired phone. */
export function callerDevice(c: Context): Device | null {
  currentUser(c);
  return (c.get(DEVICE_KEY) as Device | undefined) ?? null;
}

/** Guards everything that touches somebody's wardrobe. */
export const requireUser: MiddlewareHandler = async (c, next) => {
  currentUser(c);
  await next();
};

/**
 * Guards what only the account holder's own machine may do: minting a pairing
 * code, and revoking somebody else's device. A phone that could do either could
 * quietly let in a second phone, which would make the code on the screen
 * pointless.
 *
 * Once signing in exists, "the laptop" means a signed-in session rather than a
 * loopback socket — so this is really "prove you're the account holder, not
 * just one of their phones".
 */
export const requireLocal: MiddlewareHandler = async (c, next) => {
  const user = currentUser(c);
  const device = c.get(DEVICE_KEY) as Device | undefined;
  // A paired phone is never the account holder's own machine, however it got
  // here. Anything else that resolved to a user did so by signing in or by
  // being loopback, and both count.
  if (device) throw new CodedError('local_only');
  void user;
  await next();
};
