// Crafting completion money math (#577 Slice A) — pure, React-free.
//
// Our Craft loop charges the item's full Price in gold, split in two: half is
// paid up front when the project starts, and the other half is owed at the end.
// That remaining half can be paid outright ("complete now") or whittled down by
// spending extra downtime days — each day reduces it by the crafter's Earn
// Income for the item's level, which is exactly PF2e Table 4-2. That table IS
// our Earn Income table, so the per-day reduction reuses `payoutCp` verbatim.
//
// Everything is in copper (cp) to stay integer; convert with cpToGp at the edge.

import { payoutCp } from './earnIncome';

// Fraction of the materials cost ruined on a critical failure.
const CRIT_FAIL_LOSS = 0.1;

// Item Price (decimal gp) → total materials cost in copper.
export function craftCostCp(price) {
  return Math.round((Number(price) || 0) * 100);
}

// The half paid up front when the project starts.
export function halfCostCp(price) {
  return Math.round(craftCostCp(price) / 2);
}

// How much the remaining cost drops per extra downtime day spent crafting.
// Only a successful Craft check reduces cost; a (critical) failure reduces
// nothing. Critical success rolls up a level — `payoutCp` already does that.
export function dailyReductionCp({ itemLevel, craftingRank, degree }) {
  if (degree !== 'success' && degree !== 'criticalSuccess') return 0;
  return payoutCp({ taskLevel: itemLevel, rank: craftingRank, degree });
}

// Materials ruined on a critical failure (a fraction of the full cost).
export function critFailLossCp(price) {
  return Math.round(craftCostCp(price) * CRIT_FAIL_LOSS);
}
