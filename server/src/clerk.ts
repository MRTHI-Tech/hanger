import {createClerkClient, verifyToken} from '@clerk/backend';
import {env} from './env.js';
import {
  createUserForAuthId,
  updateUserDetails,
  userForAuthId,
  type User,
} from './users.js';

/**
 * Signing in.
 *
 * Clerk holds the accounts; we hold the wardrobes. The only thing crossing
 * between them is an id — `sub` out of a verified session token — which we look
 * up in our own user table. First sight of one is the sign-up: there is no
 * separate registration step, because there is nothing for us to register.
 *
 * Optional on purpose. With no secret key configured the server runs exactly as
 * it always has: one local user, no network, no accounts. That is what a fresh
 * clone should do, and what the test suite relies on.
 */

export const clerkConfigured = Boolean(env.CLERK_SECRET_KEY);

const clerk = env.CLERK_SECRET_KEY
  ? createClerkClient({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
    })
  : null;

/** Three dot-separated parts. Cheap way to tell a session token from ours. */
export function looksLikeSessionToken(token: string): boolean {
  return token.split('.').length === 3;
}

/**
 * Their profile, fetched once when we first meet them so the panel's device
 * list and any future email have something to say. A failure here is not fatal:
 * we know who they are from the token, and a missing display name is a cosmetic
 * problem rather than an authentication one.
 */
async function profileFor(
  authId: string,
): Promise<{email: string | null; name: string | null}> {
  if (!clerk) return {email: null, name: null};
  try {
    const person = await clerk.users.getUser(authId);
    const name =
      [person.firstName, person.lastName].filter(Boolean).join(' ') || null;
    return {
      email: person.primaryEmailAddress?.emailAddress ?? null,
      name,
    };
  } catch {
    return {email: null, name: null};
  }
}

/**
 * The user behind a session token, or null if the token isn't one of ours.
 *
 * Verification is local — the signature is checked against Clerk's published
 * keys, cached after the first fetch — so this is not a network round trip per
 * request.
 */
export async function userForSessionToken(token: string): Promise<User | null> {
  if (!env.CLERK_SECRET_KEY) return null;

  let authId: string;
  try {
    const claims = await verifyToken(token, {secretKey: env.CLERK_SECRET_KEY});
    if (!claims.sub) return null;
    authId = claims.sub;
  } catch {
    // Expired, forged, or simply not a Clerk token. All three mean the same
    // thing here — we don't know who this is — and the caller decides what to
    // say about it.
    return null;
  }

  const existing = userForAuthId(authId);
  if (existing) return existing;

  // First time we've seen them. Their wardrobe starts empty.
  const profile = await profileFor(authId);
  return createUserForAuthId(authId, profile);
}

/** Keep our copy of their details fresh without blocking the request on it. */
export function refreshProfileInBackground(user: User): void {
  if (!clerk || !user.authId || user.email) return;
  void profileFor(user.authId).then((profile) => {
    if (profile.email || profile.name) updateUserDetails(user.id, profile);
  });
}
