// src/utils/staffPrep.js
// Staff preparation (#957 S6a). Staves have NO charges by default. During daily
// preparations a caster prepares a SINGLE staff for the day, which then gains
// charges equal to the highest spell rank that caster can cast. (S6b will add
// the option to expend more spell slots for extra charges.) React-free.
import { itemUidOf } from './affix';

/**
 * Highest spell rank the caster can currently cast — the greatest rank that has
 * at least one spell slot. Cantrips (rank 0 / the 'cantrips' bucket) don't
 * count. Returns 0 for a non-caster or a cantrip-only caster.
 *
 * @param {Object|null} character - raw or computed character (reads spellcasting.spell_slots)
 * @returns {number}
 */
export const highestCastableRank = (character) => {
  const slots = character?.spellcasting?.spell_slots || {};
  const ranks = Object.keys(slots)
    .filter((k) => k !== 'cantrips' && Number(k) > 0 && Number(slots[k]) > 0)
    .map(Number);
  return ranks.length ? Math.max(...ranks) : 0;
};

/**
 * Extra charges gained from expending spell slots at preparation: each expended
 * slot adds charges equal to its rank. `slotAlloc` maps rank -> number of slots
 * expended (e.g. { '1': 2, '3': 1 } => 2·1 + 1·3 = 5). Non-numeric ranks and
 * rank 0 (cantrips) contribute nothing.
 *
 * @param {Object|null} slotAlloc
 * @returns {number}
 */
export const chargesFromSlots = (slotAlloc) =>
  Object.entries(slotAlloc || {}).reduce((sum, [rank, count]) => {
    const r = Number(rank);
    return Number.isFinite(r) && r > 0 ? sum + r * Number(count || 0) : sum;
  }, 0);

/**
 * The `cnmh_staffprep` overlay value for preparing `staffId`, or null to clear.
 * Charges = the highest rank the caster can cast plus any charges bought by
 * expending spell slots (`slotAlloc`).
 *
 * @param {Object|null} character
 * @param {string|null} staffId - itemUid of the staff to prepare, or falsy to clear
 * @param {Object} [slotAlloc] - rank -> slots expended for extra charges
 * @returns {{ staffId: string, charges: number } | null}
 */
export const staffPrepValue = (character, staffId, slotAlloc) =>
  staffId
    ? { staffId, charges: highestCastableRank(character) + chargesFromSlots(slotAlloc) }
    : null;

/**
 * Every staff in a resolved inventory, as `{ id, name }` options for the
 * daily-prep picker. `id` is the item's stable uid (matches the overlay).
 *
 * @param {Array} effectiveInventory
 * @returns {Array<{ id: string, name: string }>}
 */
export const listStaves = (effectiveInventory) =>
  (Array.isArray(effectiveInventory) ? effectiveInventory : [])
    .filter((e) => e && e.staff)
    .map((e) => ({ id: itemUidOf(e), name: e.name || e.staff?.name || 'Staff' }));
