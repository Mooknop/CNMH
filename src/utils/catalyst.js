// Catalysts (Magic+ arsenal M3, epic #1206 / #1209). Pure helpers — no React.
//
// A catalyst is a Consumable that is added to the casting of ONE specific spell,
// modifying it. It declares the spell it augments and its rider:
//
//   item.catalyst = {
//     catalystFor: '<spellId>',   // the catalog spell this augments
//     addActions?: 1,             // extra actions the augmented cast costs
//     effect: '<what it does>',   // surfaced at cast time + in the log
//   }
//
// The cast surface (UseAbilityModal) offers every held catalyst whose target
// spell matches the spell being cast; adding one consumes it (the consumed
// overlay, keyed by name — same mechanism potions use) and folds its extra
// actions into the cast cost. The rider's mechanical nuance (persistent damage,
// temp HP) is surfaced as a log note for the GM, matching the app's posture for
// complex cross-target effects.

import { flattenInventory } from './InventoryUtils';

/** The item's catalyst block (with a real target spell), or null. */
export const catalystMeta = (item) => {
  const c = item?.catalyst;
  return c && typeof c === 'object' && c.catalystFor ? c : null;
};

/** Whether an item is a catalyst (carries the block or the Catalyst trait). */
export const isCatalyst = (item) =>
  !!catalystMeta(item) ||
  (Array.isArray(item?.traits) && item.traits.some((t) => String(t).toLowerCase() === 'catalyst'));

/** The spell id a catalyst augments, or null. */
export const catalystTargetSpell = (item) => catalystMeta(item)?.catalystFor || null;

/** Extra actions a catalyst adds to the cast (0 when none). */
export const catalystAddActions = (item) => Number(catalystMeta(item)?.addActions) || 0;

/** Human-readable rider effect for the cast surface + log. */
export const catalystSummary = (item) => catalystMeta(item)?.effect || item?.description || '';

/** Remaining count of a consumable given the consumed overlay (by name). */
const remainingQty = (item, consumed) =>
  (item?.quantity ?? 1) - ((consumed || {})[item?.name] || 0);

/**
 * Held catalysts eligible for a spell being cast: those whose `catalystFor`
 * matches the spell id and still have an unused count. Reads the flat inventory
 * (top-level + container contents) so a stowed catalyst still qualifies.
 *
 * @param {Array}  inventory - resolved character inventory
 * @param {string} spellId   - the spell being cast (ability.id)
 * @param {Object} consumed  - cnmh_consumed_<charId> overlay
 * @returns {Array} eligible catalyst items
 */
export const eligibleCatalystsFor = (inventory, spellId, consumed) => {
  if (!spellId) return [];
  return flattenInventory(inventory).filter(
    (it) => catalystTargetSpell(it) === spellId && remainingQty(it, consumed) > 0
  );
};

/** Total extra actions from a set of catalysts. */
export const sumCatalystActions = (catalysts) =>
  (catalysts || []).reduce((n, c) => n + catalystAddActions(c), 0);
