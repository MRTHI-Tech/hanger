import {randomUUID} from 'node:crypto';
import {db} from './db.js';

/**
 * Whose wardrobe this is.
 *
 * There used to be one hanger and no notion of an owner, because the only
 * person who could reach the server was the person it was running on. Once it
 * is on a public URL that stops being true, and every row that describes
 * somebody's clothes has to say whose they are.
 *
 * This file owns the user table and nothing else. Where a user *comes from* —
 * a signed-in session, or the local machine — is auth.ts's problem.
 */

export interface User {
  id: string;
  /** The id our sign-in provider knows them by; null for the local user. */
  authId: string | null;
  email: string | null;
  name: string | null;
  unitsSpent: number;
  /** Null means "whatever the server's default per-person cap is". */
  unitCap: number | null;
  createdAt: number;
}

interface UserRow {
  id: string;
  auth_id: string | null;
  email: string | null;
  name: string | null;
  units_spent: number;
  unit_cap: number | null;
  created_at: number;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    authId: row.auth_id,
    email: row.email,
    name: row.name,
    unitsSpent: row.units_spent,
    unitCap: row.unit_cap,
    createdAt: row.created_at,
  };
}

/**
 * The user a development machine runs as.
 *
 * Created by the migration and never signs in to anything. It exists so that
 * running the server on your own laptop needs no accounts, no keys and no
 * network — which is how a fresh clone has always worked and should stay.
 */
export const LOCAL_USER_ID = 'local';

export function getUser(id: string): User | null {
  const row = db.prepare('SELECT * FROM user WHERE id = ?').get(id) as
    | UserRow
    | undefined;
  return row ? toUser(row) : null;
}

export function localUser(): User {
  const user = getUser(LOCAL_USER_ID);
  // The migration creates it. If it's gone, something removed it by hand and
  // the honest thing is to put it back rather than fail every local request.
  if (user) return user;
  // unit_cap 0 — no personal allowance. Allowances hold visitors back from
  // somebody else's account, and this is that somebody: their limit is the
  // server's own UNIT_BUDGET, which they set.
  db.prepare(
    `INSERT INTO user (id, auth_id, email, name, unit_cap, created_at)
     VALUES (?, NULL, NULL, ?, 0, ?)`,
  ).run(LOCAL_USER_ID, 'This computer', Date.now());
  return getUser(LOCAL_USER_ID)!;
}

export function userForAuthId(authId: string): User | null {
  const row = db.prepare('SELECT * FROM user WHERE auth_id = ?').get(authId) as
    | UserRow
    | undefined;
  return row ? toUser(row) : null;
}

/**
 * First sight of somebody who has signed in. There is no sign-up step in this
 * product — the first request carrying a valid session is the sign-up.
 *
 * Which means the sign-up races itself. A client opening cold fires several
 * requests at once — the phone asks who it is, then for health and the person
 * photo together — and each one resolves the same brand-new session. They all
 * look for the user, all miss, and all try to create them. The window is real
 * rather than theoretical because clerk.ts awaits Clerk's profile API between
 * the miss and the insert, which is ample time for the others to catch up.
 *
 * Losing that race is not an error, so it no longer reads as one: whoever gets
 * there first writes the row and the rest find it. Enforced by the unique index
 * on auth_id, because it is the only thing here that can actually promise it —
 * checking first is what every one of those requests already did.
 */
export function createUserForAuthId(
  authId: string,
  details: {email?: string | null; name?: string | null} = {},
): User {
  const id = randomUUID();
  const result = db
    .prepare(
      `INSERT INTO user (id, auth_id, email, name, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(auth_id) DO NOTHING`,
    )
    .run(id, authId, details.email ?? null, details.name ?? null, Date.now());

  // Only the request that actually wrote the row announces the person, so a
  // cold open doesn't log the same new user four times.
  if (result.changes > 0) {
    console.log(`[hanger] new user: ${details.email ?? authId}`);
  }

  // Read back by auth_id, not by the id generated above: on a conflict the row
  // that exists belongs to whichever request won, and carries *its* id.
  const user = userForAuthId(authId);
  if (!user) {
    throw new Error(`user ${authId} missing immediately after insert`);
  }
  return user;
}

/** Sign-in details drift — a changed email should follow the person here. */
export function updateUserDetails(
  id: string,
  details: {email?: string | null; name?: string | null},
): void {
  db.prepare('UPDATE user SET email = COALESCE(?, email), name = COALESCE(?, name) WHERE id = ?').run(
    details.email ?? null,
    details.name ?? null,
    id,
  );
}
