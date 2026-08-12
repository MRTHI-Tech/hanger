import {randomUUID} from 'node:crypto';
import {db} from './db.js';
import {env} from './env.js';
import {getUser} from './users.js';

/**
 * Unit spend guard (§12.3), in two layers.
 *
 * **The server's budget** is the original one: every live call is logged, at
 * 80% we warn loudly, and at 100% we refuse rather than quietly draining the
 * account. It is the backstop, and it is what protects the bill.
 *
 * **A person's allowance** is the new one, and it exists because the server
 * stopped being one person's laptop. One visitor could otherwise spend the
 * whole budget before the second one arrived. Past their allowance nobody is
 * refused — they get sample results instead, with the caption the mock path
 * already draws on them. A wall halfway through judging something is worse
 * than a watermark.
 */

let warned80 = false;

export function unitsSpent(): number {
  const row = db
    .prepare('SELECT COALESCE(SUM(units_est), 0) AS total FROM spend_log')
    .get() as {total: number};
  return row.total;
}

export function unitsSpentBy(userId: string): number {
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(units_est), 0) AS total FROM spend_log WHERE user_id = ?',
    )
    .get(userId) as {total: number};
  return row.total;
}

/** Their own cap if they have one, otherwise the server's default per person. */
export function allowanceFor(userId: string): number {
  return getUser(userId)?.unitCap ?? env.USER_UNIT_CAP;
}

export function budgetExhausted(): boolean {
  return unitsSpent() >= env.UNIT_BUDGET;
}

/**
 * Has this person used up their allowance?
 *
 * Answered before every paid call. The server's own budget counts here too: if
 * the account is dry, everybody is on samples, and finding that out as a
 * watermark beats finding it out as an error.
 */
export function onSamples(userId: string, units = 1): boolean {
  if (budgetExhausted()) return true;
  const cap = allowanceFor(userId);
  if (cap <= 0) return false; // 0 or less means "no personal limit"
  return unitsSpentBy(userId) + units > cap;
}

export function allowanceSnapshot(userId: string) {
  const cap = allowanceFor(userId);
  return {
    unitsSpent: unitsSpentBy(userId),
    unitAllowance: cap,
    onSamples: onSamples(userId),
  };
}

export class BudgetExceededError extends Error {
  code = 'budget_exhausted';
  constructor() {
    super('budget exhausted');
  }
}

/** Throws before a live call would push us past the cap. */
export function assertBudget(units = 1): void {
  const spent = unitsSpent();
  if (spent + units > env.UNIT_BUDGET) {
    console.error(
      `[hanger] BUDGET STOP — ${spent}/${env.UNIT_BUDGET} units used. Refusing new live calls.`,
    );
    throw new BudgetExceededError();
  }
}

export function recordSpend(userId: string, endpoint: string, units = 1): void {
  db.prepare(
    'INSERT INTO spend_log (id, user_id, endpoint, units_est, at) VALUES (?, ?, ?, ?, ?)',
  ).run(randomUUID(), userId, endpoint, units, Date.now());

  const mine = unitsSpentBy(userId);
  const spent = unitsSpent();
  const pct = spent / env.UNIT_BUDGET;
  console.log(
    `[hanger] SPEND ${endpoint} +${units} → ${mine}/${allowanceFor(userId)} for this person, ` +
      `${spent}/${env.UNIT_BUDGET} on this server`,
  );
  if (pct >= 0.8 && !warned80) {
    warned80 = true;
    console.warn(
      `[hanger] ⚠ BUDGET WARNING — ${spent}/${env.UNIT_BUDGET} units used (${Math.round(
        pct * 100,
      )}%).`,
    );
  }
}

export function budgetSnapshot() {
  const spent = unitsSpent();
  return {
    unitsSpent: spent,
    unitBudget: env.UNIT_BUDGET,
    budgetExhausted: spent >= env.UNIT_BUDGET,
  };
}
