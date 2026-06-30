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
 * The `cnmh_staffprep` overlay value for preparing `staffId`, or null to clear.
 * Charges come from the highest rank the caster can cast.
 *
 * @param {Object|null} character
 * @param {string|null} staffId - itemUid of the staff to prepare, or falsy to clear
 * @returns {{ staffId: string, charges: number } | null}
 */
export const staffPrepValue = (character, staffId) =>
  staffId ? { staffId, charges: highestCastableRank(character) } : null;

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
