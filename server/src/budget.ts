import {randomUUID} from 'node:crypto';
import {db} from './db.js';
import {env} from './env.js';

/**
 * Unit spend guard (§12.3). Every live call is logged. At 80% of the budget we
 * warn loudly; at 100% we refuse new live calls rather than quietly draining
 * the account.
 */

let warned80 = false;

export function unitsSpent(): number {
  const row = db
    .prepare('SELECT COALESCE(SUM(units_est), 0) AS total FROM spend_log')
    .get() as {total: number};
  return row.total;
}

export function budgetExhausted(): boolean {
  return unitsSpent() >= env.UNIT_BUDGET;
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

export function recordSpend(endpoint: string, units = 1): void {
  db.prepare(
    'INSERT INTO spend_log (id, endpoint, units_est, at) VALUES (?, ?, ?, ?)',
  ).run(randomUUID(), endpoint, units, Date.now());

  const spent = unitsSpent();
  const pct = spent / env.UNIT_BUDGET;
  console.log(
    `[hanger] SPEND ${endpoint} +${units} → ${spent}/${env.UNIT_BUDGET} units`,
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
