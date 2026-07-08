// Pure wealth-vs-benchmark math for the GM Loot Ledger (#1281). Compares held
// party wealth against Table 10-10 (Character Wealth) and produces the
// party-size-adjusted Table 10-9 (Party Treasure by Level) award budget.
import {
  PARTY_TREASURE_BY_LEVEL,
  CHARACTER_WEALTH,
  BASELINE_PARTY_SIZE,
} from '../data/wealthBenchmarks';
import { flattenInventory } from './InventoryUtils';
import { docGold } from './gold';

export const clampLevel = (level) => {
  const n = Math.round(Number(level));
  if (!Number.isFinite(n)) return 1;
  return Math.min(20, Math.max(1, n));
};

// Total gp value of a resolved inventory (top-level items + container
// contents), priced like PartyWealth: price × quantity, unpriced items count 0.
export const inventoryValue = (inventory) =>
  flattenInventory(inventory).reduce(
    (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
    0
  );

// A character's held wealth: live session gold (falling back to the committed
// doc gold when no overlay value is supplied) plus inventory value.
export const characterWealth = (character, liveGold) => {
  const gold =
    typeof liveGold === 'number' && Number.isFinite(liveGold)
      ? liveGold
      : docGold(character);
  const items = inventoryValue(character?.inventory);
  return { gold, items, total: gold + items };
};

export const lumpSumFor = (level) => CHARACTER_WEALTH[clampLevel(level)].lumpSum;

// Band thresholds vs the Table 10-10 lump sum. The lump sum is deliberately
// the LOW estimate of on-level wealth (it's what a brand-new character gets in
// currency alone), so holding less than it means genuinely underequipped.
export const FLUSH_RATIO = 1.4;
export const WEALTH_BANDS = { BEHIND: 'behind', HEALTHY: 'healthy', FLUSH: 'flush' };

export const wealthBand = (totalWealth, level) => {
  const target = lumpSumFor(level);
  if (totalWealth < target) return WEALTH_BANDS.BEHIND;
  if (totalWealth > target * FLUSH_RATIO) return WEALTH_BANDS.FLUSH;
  return WEALTH_BANDS.HEALTHY;
};

// Table 10-9 row for a level, adjusted for party size. Per GM Core, each PC
// beyond four adds one permanent item (party level or +1), two consumables
// (usually one at party level, one at +1), and the row's per-additional-PC
// currency. The row's currency column is exactly a quarter of the party
// currency, so the total-value target scales linearly per PC on the same
// basis. Parties smaller than four are left at the four-PC baseline (the
// rules suggest reducing treasure less than proportionally for them anyway).
export const levelBudget = (level, partySize = BASELINE_PARTY_SIZE) => {
  const lvl = clampLevel(level);
  const row = PARTY_TREASURE_BY_LEVEL[lvl];
  const extraPcs = Math.max(0, Math.floor(Number(partySize) || BASELINE_PARTY_SIZE) - BASELINE_PARTY_SIZE);
  return {
    level: lvl,
    totalValue: Math.round(row.totalValue * (1 + extraPcs / BASELINE_PARTY_SIZE)),
    permanentItems: row.permanentItems,
    consumables: row.consumables,
    extraPcs,
    extraPermanentItems: extraPcs,
    extraConsumables: extraPcs * 2,
    currency: row.partyCurrency + extraPcs * row.currencyPerAdditionalPc,
  };
};

// Sum of every character's expected lump-sum wealth.
export const partyExpected = (characters) =>
  (characters || []).reduce((sum, c) => sum + lumpSumFor(c?.level), 0);

// The party's effective level: the most common character level, ties broken
// upward (a mid-level-up party budgets against the level it's entering).
export const partyLevel = (characters) => {
  const counts = new Map();
  for (const c of characters || []) {
    const lvl = clampLevel(c?.level);
    counts.set(lvl, (counts.get(lvl) || 0) + 1);
  }
  if (!counts.size) return 1;
  let best = 1;
  let bestCount = 0;
  for (const [lvl, count] of counts) {
    if (count > bestCount || (count === bestCount && lvl > best)) {
      best = lvl;
      bestCount = count;
    }
  }
  return best;
};
