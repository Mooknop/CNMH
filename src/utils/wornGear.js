// Non-React core of worn-gear contribution (#922). Shared by useWornGear (the
// reactive producer that synthesizes active-effect defs) and the imperative
// persistent-tick path (usePersistentReminders), which resolves worn resistance
// off SessionContext.getState without being able to call hooks.
import { DEFAULT_ITEM_STATE } from './itemState';
import { isInvestable } from './InventoryUtils';
import { hasArmorRuneBlock, resolveArmorItem } from './armorRunes';

// Damage resistance/weakness/immunity (#900/#918/#919) are special, non-bonus
// modifiers — `{ stat: 'resistance'|'weakness'|'immunity', vs, amount? }`. They
// never net through computeEffectBonuses (no bonus bucket — the `!buckets[stat]`
// guard drops them, like `dexCap`); the defense readers pick them off by stat.
// Immunity carries no `amount`, so the only well-formedness gate is `vs`.
export const SPECIAL_STATS = new Set(['resistance', 'weakness', 'immunity']);

// A worn (vs held/stowed/dropped) item: default/unset placement state.
export const isWornDefault = (e) => e?.state == null || e.state === DEFAULT_ITEM_STATE;

// The modifiers an item contributes. Armor with an etched `runes` block (#727)
// derives its magic delta (potency AC + resilient saves + property-rune
// modifiers) through the armor-rune resolver; everything else carries a flat
// authored `modifiers` array.
export const itemModifiers = (e) =>
  hasArmorRuneBlock(e) ? resolveArmorItem(e).modifiers : e.modifiers;

// The special damage modifiers in a mod array (well-formed = a truthy `vs`).
export const specialModifiers = (mods) =>
  (Array.isArray(mods) ? mods : []).filter((m) => m && SPECIAL_STATS.has(m.stat) && m.vs);

// Whether a worn item currently grants its magic: worn, and invested if it
// carries the Invested trait (non-investable worn gear contributes once worn).
const contributes = (e, isInvested) =>
  isWornDefault(e) && !(isInvestable(e) && !isInvested(e.uid));

/**
 * Highest worn-gear resistance to a damage descriptor across a character's
 * effective inventory (resistance doesn't stack — the single highest matching
 * amount wins). `vsType` is matched exactly against one of the comma-separated
 * tokens in each modifier's `vs` (e.g. 'fire', 'persistent-bleed').
 *
 * @param {Array}    inventory  - effective (state-stamped) inventory
 * @param {Function} isInvested - (uid) => boolean
 * @param {string}   vsType     - damage descriptor
 * @returns {number} highest matching resistance, or 0
 */
export const wornResistanceFor = (inventory, isInvested, vsType) => {
  if (!vsType) return 0;
  let best = 0;
  for (const e of Array.isArray(inventory) ? inventory : []) {
    if (!contributes(e, isInvested)) continue;
    for (const m of specialModifiers(itemModifiers(e))) {
      if (m.stat !== 'resistance') continue;
      const types = String(m.vs).split(',').map((t) => t.trim());
      if (types.includes(vsType) && typeof m.amount === 'number' && m.amount > best) {
        best = m.amount;
      }
    }
  }
  return best;
};
