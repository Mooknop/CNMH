// src/utils/slotSacrifice.js
// Reusable spell-slot sacrifice (#957 S3). Several features expend "a spell slot
// of a rank within [minRank, maxRank]" as a cost *outside* of casting a spell:
// scepter actuated abilities (#965) and staff preparation (#957 S6). These pure
// helpers own the pick-a-rank / clamp-to-available math; `useSlotSacrifice`
// wraps them onto a live character's `cnmh_slots` pool.
//
// Prepared vs spontaneous is flavor only — the app tracks slots uniformly, so
// mechanically a sacrifice is "decrement rank R." Callers own the display text.

/**
 * Ranks (as numbers, ascending) that have at least one slot remaining and fall
 * within [minRank, maxRank]. Cantrips / rank 0 never qualify.
 *
 * @param {Object} totals - rank(string) -> total slots (e.g. spell_slots)
 * @param {(rank:number)=>number} remainingFor - remaining slots for a rank
 * @param {{minRank?:number, maxRank?:number}} [bounds]
 * @returns {number[]}
 */
export function eligibleSacrificeRanks(totals, remainingFor, { minRank = 1, maxRank = Infinity } = {}) {
  return Object.keys(totals || {})
    .filter((k) => k !== 'cantrips')
    .map(Number)
    .filter((r) => Number.isFinite(r) && r > 0 && r >= minRank && r <= maxRank && remainingFor(r) > 0)
    .sort((a, b) => a - b);
}

/** Human log fragment for a sacrificed slot, e.g. "rank 3 slot". */
export const slotSacrificeLabel = (rank) => `rank ${rank} slot`;

/**
 * A short "no eligible slot" reason for a disabled sacrifice control, phrased
 * from the min/max bounds (e.g. "No rank 4+ spell slot available").
 *
 * @param {number} minRank
 * @param {number} maxRank
 * @returns {string}
 */
export function noEligibleSlotReason(minRank = 1, maxRank = Infinity) {
  const range = !Number.isFinite(maxRank)
    ? `${minRank}+`
    : maxRank === minRank
      ? `${minRank}`
      : `${minRank}–${maxRank}`;
  return `No rank ${range} spell slot available`;
}

/**
 * Clamp a requested `{ rank -> count }` slot allocation to the slots actually
 * available per rank. Cantrips / rank 0 never count. Shared by staff prep
 * (#957 S6), where slots are reset before allocation so `maxes` == remaining.
 *
 * @param {Object} maxes - rank(string) -> total slots available
 * @param {Object} alloc - rank(string) -> requested count
 * @returns {Object} clamped rank(string) -> count
 */
export function clampSlotAllocation(maxes, alloc) {
  const out = {};
  Object.keys(maxes || {}).forEach((k) => {
    const rn = Number(k);
    out[k] = Number.isFinite(rn) && rn > 0
      ? Math.max(0, Math.min(Number((alloc || {})[k] || 0), Number(maxes[k] || 0)))
      : 0;
  });
  return out;
}
