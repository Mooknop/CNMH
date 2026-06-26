// src/utils/armorClass.js
// AC3 (#749) — derive a character's base AC from the equipped armor instead of
// the flat Foundry-synced scalar. The result feeds the same display pipeline as
// the old scalar: circumstance/status effect bonuses (Raise a Shield, Take
// Cover, the worn-gear magic layer #726) still layer on top via the effect
// engine's bestOfKind. Magic potency/resilient runes are NOT applied here —
// this is the base-armor spine only.

import { isArmor, normalizeArmor } from './InventoryUtils';
import { DEFAULT_ITEM_STATE } from './itemState';

// PF2e AC baseline before proficiency / Dex / armor.
export const BASE_AC = 10;

/**
 * The armor a character is wearing for AC purposes: the worn (not held/stowed/
 * dropped) inventory entry carrying an armor block. A character wears one suit,
 * but if more than one armor is worn the highest base AC bonus wins so the
 * result is deterministic. Investment is NOT required — an uninvested magic
 * armor still works as its base armor (the magic layer is gated elsewhere).
 *
 * @param {Array} inventory - effective (state-stamped) top-level inventory
 * @returns {Object|null} the worn armor entry, or null when unarmored
 */
export const findWornArmor = (inventory = []) => {
  // Worn = the default top-level placement (explicit 'worn' or unset). Held,
  // dropped and stowed armor doesn't contribute AC. NB stowed entries are nested
  // inside containers (not top-level), so they don't reach here in practice; the
  // explicit check guards against a stray flat 'stowed'/'dropped' too.
  const worn = (Array.isArray(inventory) ? inventory : []).filter(
    (e) => isArmor(e) && (e.state == null || e.state === DEFAULT_ITEM_STATE)
  );
  if (!worn.length) return null;
  return worn.reduce((best, e) =>
    (normalizeArmor(e.armor)?.acBonus || 0) > (normalizeArmor(best.armor)?.acBonus || 0)
      ? e
      : best
  );
};

/**
 * Derive base AC from the equipped armor:
 *   10 + proficiency bonus + min(Dex mod, armor Dex cap) + armor item bonus
 *
 * Returns `null` to signal the caller should fall back to the Foundry scalar —
 * this happens only when a worn armor exists but lacks the AC1 schema (its
 * `category` or `acBonus` is absent, i.e. not yet backfilled). Unarmored (no
 * armor block) is a real derivation: 10 + Dex + the unarmored proficiency, Dex
 * uncapped. The caller resolves the right `proficiencyBonus` for the category.
 *
 * @param {Object} args
 * @param {Object|null} args.armor - the worn armor block (or null for unarmored)
 * @param {number} args.dexMod - the character's Dexterity modifier
 * @param {number} args.proficiencyBonus - AC proficiency bonus for the category
 * @param {number} args.effectDexCap - an absolute Dex cap imposed by an effect
 *                  (#507, e.g. Drakeheart Mutagen's "Dexterity cap of +2"). When
 *                  several caps apply (this + the armor's) the lowest wins, per
 *                  PF2e. Defaults to Infinity (no effect cap).
 * @returns {number|null} derived base AC, or null to fall back to the scalar
 */
export const deriveArmorClass = ({ armor, dexMod = 0, proficiencyBonus = 0, effectDexCap = Infinity }) => {
  const a = normalizeArmor(armor);
  if (!a) {
    // Unarmored: no armor item bonus and no armor cap — but an effect Dex cap
    // (#507) still clamps the Dex contribution (Infinity = uncapped, a no-op).
    return BASE_AC + proficiencyBonus + Math.min(dexMod, effectDexCap);
  }
  // Worn armor that hasn't been backfilled with the AC1 schema — fall back.
  if (a.category === undefined || a.acBonus === undefined) return null;
  // Multiple Dex caps (the armor's own + any effect cap) → the lowest applies.
  const armorCap = a.dexCap !== undefined ? a.dexCap : Infinity;
  return BASE_AC + proficiencyBonus + Math.min(dexMod, armorCap, effectDexCap) + a.acBonus;
};
