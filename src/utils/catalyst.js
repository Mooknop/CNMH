// Catalysts (Magic+ arsenal M3, epic #1206 / #1209). Pure helpers — no React.
//
// A catalyst is a Consumable that is added to the casting of a spell, modifying
// it. Most target ONE specific spell; a few (Deathless Light, #1254) target any
// spell carrying a TRAIT. The block declares exactly one targeting form plus
// its rider:
//
//   item.catalyst = {
//     catalystFor: '<spellId>',       // the catalog spell this augments, OR
//     catalystForTrait: '<Trait>',    // any spell with this trait (e.g. 'Light')
//     addActions?: 1,                 // extra actions the augmented cast costs
//     effect: '<what it does>',       // surfaced at cast time + in the log
//   }
//
// The two targeting forms are mutually exclusive; trait matching is
// case-insensitive (seed traits are capitalized, e.g. 'Light').
//
// The cast surface (UseAbilityModal) offers every held catalyst whose target
// spell matches the spell being cast; adding one consumes it (the consumed
// overlay, keyed by name — same mechanism potions use) and folds its extra
// actions into the cast cost. The rider's mechanical nuance (persistent damage,
// temp HP) is surfaced as a log note for the GM, matching the app's posture for
// complex cross-target effects.

import { flattenInventory } from './InventoryUtils';
import { consumedCountFor } from './consumedLedger';

/** The item's catalyst block (with a target spell OR target trait), or null. */
export const catalystMeta = (item) => {
  const c = item?.catalyst;
  return c && typeof c === 'object' && (c.catalystFor || c.catalystForTrait) ? c : null;
};

/** Whether an item is a catalyst (carries the block or the Catalyst trait). */
export const isCatalyst = (item) =>
  !!catalystMeta(item) ||
  (Array.isArray(item?.traits) && item.traits.some((t) => String(t).toLowerCase() === 'catalyst'));

/** The spell id a catalyst augments, or null (trait-form catalysts have none). */
export const catalystTargetSpell = (item) => catalystMeta(item)?.catalystFor || null;

/** The spell trait a trait-form catalyst augments (e.g. 'Light'), or null. */
export const catalystTargetTrait = (item) => catalystMeta(item)?.catalystForTrait || null;

/** Extra actions a catalyst adds to the cast (0 when none). */
export const catalystAddActions = (item) => Number(catalystMeta(item)?.addActions) || 0;

/** Human-readable rider effect for the cast surface + log. */
export const catalystSummary = (item) => catalystMeta(item)?.effect || item?.description || '';

/** Remaining count of a consumable given the consumed overlay (uid-keyed, #1659). */
const remainingQty = (item, consumed) =>
  (item?.quantity ?? 1) - consumedCountFor(item, consumed);

/** The spell id from either accepted `spell` shape (id string or spell object). */
const spellIdOf = (spell) => (typeof spell === 'string' ? spell : spell?.id) || null;

/** The spell's traits when a resolved spell object was passed ([] otherwise). */
const spellTraitsOf = (spell) =>
  spell && typeof spell === 'object' && Array.isArray(spell.traits) ? spell.traits : [];

/**
 * Whether a catalyst augments the spell being cast: id match for `catalystFor`
 * catalysts, case-insensitive trait match for `catalystForTrait` ones (#1254).
 * Trait matching needs the resolved spell object; an id string can only ever
 * match id-targeted catalysts.
 */
export const catalystMatchesSpell = (item, spell) => {
  const trait = catalystTargetTrait(item);
  if (trait) {
    const want = String(trait).toLowerCase();
    return spellTraitsOf(spell).some((t) => String(t).toLowerCase() === want);
  }
  const spellId = spellIdOf(spell);
  return !!spellId && catalystTargetSpell(item) === spellId;
};

/**
 * Held catalysts eligible for a spell being cast: those matching the spell (by
 * `catalystFor` id, or by `catalystForTrait` when the spell carries the trait)
 * that still have an unused count. Reads the flat inventory (top-level +
 * container contents) so a stowed catalyst still qualifies.
 *
 * @param {Array}         inventory - resolved character inventory
 * @param {string|Object} spell     - the spell being cast: the resolved spell
 *   object (enables trait-form matching) or its id string (id matching only)
 * @param {Object}        consumed  - cnmh_consumed_<charId> overlay
 * @returns {Array} eligible catalyst items
 */
export const eligibleCatalystsFor = (inventory, spell, consumed) => {
  if (!spell) return [];
  return flattenInventory(inventory).filter(
    (it) => catalystMatchesSpell(it, spell) && remainingQty(it, consumed) > 0
  );
};

/** Total extra actions from a set of catalysts. */
export const sumCatalystActions = (catalysts) =>
  (catalysts || []).reduce((n, c) => n + catalystAddActions(c), 0);
