// Earn Income resolution helpers (#231) — pure rules utilities, React-free.
// Mirrors the style of saveDegree.js / treatWounds.js: small pure functions a
// component or an apply-fn can compose. Degree of success comes from the shared
// computeSaveDegree (this is a flat check, so saves' nat-1/20 rules apply).
//
// All payouts are returned in **copper pieces (cp)**; convert to the app's
// decimal-gp gold via cpToGp() at credit time.

import {
  EARN_INCOME_TABLE,
  CRIT_SUCCESS_20,
  MIN_TASK_LEVEL,
  MAX_TASK_LEVEL,
} from '../data/earnIncomeTable';

// Proficiency rank (0–4) → the table's payout column. Untrained (0) has no
// column: a character can attempt Earn Income untrained but only ever earns the
// Failure amount, even on a success (handled in payoutCp).
const RANK_COLUMNS = {
  1: 'trained',
  2: 'expert',
  3: 'master',
  4: 'legendary',
};

const clampLevel = (level) =>
  Math.max(MIN_TASK_LEVEL, Math.min(MAX_TASK_LEVEL, level));

const rowFor = (level) => EARN_INCOME_TABLE[clampLevel(level)];

/** Flat check DC for a task of the given level. */
export function taskDc(taskLevel) {
  return rowFor(taskLevel).dc;
}

/** Proficiency rank (0–4) → 'trained'|'expert'|'master'|'legendary', or null if untrained. */
export function columnForRank(rank) {
  return RANK_COLUMNS[rank] ?? null;
}

/**
 * Earn Income payout in cp for a resolved task.
 *
 * @param {object} opts
 * @param {number} opts.taskLevel - the GM-assigned task level (0–20)
 * @param {number} opts.rank      - the character's proficiency rank in the skill (0–4)
 * @param {string} opts.degree    - computeSaveDegree result
 *   ('criticalSuccess'|'success'|'failure'|'criticalFailure')
 * @returns {number} copper pieces earned
 *
 * Rules:
 *   criticalSuccess — Success amount for a task one level higher (level 20 uses
 *                     the dedicated crit-success row). Untrained earns the
 *                     Failure amount.
 *   success         — the proficiency column for this level. Untrained earns the
 *                     Failure amount.
 *   failure         — the Failure column (proficiency-independent).
 *   criticalFailure — nothing (0); the GM may also end the task.
 */
export function payoutCp({ taskLevel, rank, degree }) {
  const column = columnForRank(rank);
  const row = rowFor(taskLevel);

  if (degree === 'criticalFailure') return 0;
  if (degree === 'failure') return row.failed;

  // success / criticalSuccess. Untrained never beats the Failure amount.
  if (!column) return row.failed;

  if (degree === 'criticalSuccess') {
    if (clampLevel(taskLevel) >= MAX_TASK_LEVEL) return CRIT_SUCCESS_20[column];
    return rowFor(taskLevel + 1)[column];
  }

  return row[column];
}

/** Copper pieces → decimal gold pieces (the unit `cnmh_gold_<id>` stores). */
export function cpToGp(cp) {
  return cp / 100;
}
