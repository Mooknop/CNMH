// Non-React core of worn-gear contribution (#922). Shared by useWornGear (the
// reactive producer that synthesizes active-effect defs) and the imperative
// persistent-tick path (usePersistentReminders), which resolves worn resistance
// off SessionContext.getState without being able to call hooks.
import { DEFAULT_ITEM_STATE } from './itemState';
import { isInvestable } from './InventoryUtils';
import { hasArmorRuneBlock, resolveArmorItem } from './armorRunes';
import { accessoryRuneOf } from './accessoryRunes';

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
//
// A structured `resistance: { amount, type }` field (#911) — authored on the
// item or merged from a variant override (Energy Robe's per-energy tiers) — is
// bridged into a `{ stat: 'resistance', vs }` modifier here, so every worn-gear
// reader (useWornGear synthetic def + the imperative wornResistanceFor) sees it
// uniformly without authors hand-writing the modifier shape. `type` is the `vs`
// descriptor (e.g. 'fire', 'persistent-bleed,persistent-poison').
export const itemModifiers = (e) => {
  // Only route through the armor-rune resolver when the block actually carries
  // armor runes — an accessory-only `runes` block (#1033: a Menacing cloak is
  // `runes: { accessory }`) must not swallow the item's own authored modifiers.
  const armorRuned =
    hasArmorRuneBlock(e) &&
    !!(e.runes.potency || e.runes.resilient || (Array.isArray(e.runes.property) && e.runes.property.length));
  const base = armorRuned ? resolveArmorItem(e).modifiers : e?.modifiers;
  const mods = Array.isArray(base) ? [...base] : [];
  // An inscribed accessory rune's modifiers ride on top — additive with the
  // armor delta on a dual-host (armor runes + accessory on Explorer's Clothing).
  const accessory = accessoryRuneOf(e);
  if (accessory && Array.isArray(accessory.modifiers)) mods.push(...accessory.modifiers);
  const r = e?.resistance;
  if (r && typeof r.amount === 'number' && r.type) {
    mods.push({ stat: 'resistance', amount: r.amount, vs: String(r.type) });
  }
  return mods;
};

// The special damage modifiers in a mod array (well-formed = a truthy `vs`).
export const specialModifiers = (mods) =>
  (Array.isArray(mods) ? mods : []).filter((m) => m && SPECIAL_STATS.has(m.stat) && m.vs);

// Whether a worn item currently grants its magic: worn, and invested if it
// carries the Invested trait (non-investable worn gear contributes once worn).
const contributes = (e, isInvested) =>
  isWornDefault(e) && !(isInvestable(e) && !isInvested(e.uid));

// Highest worn-gear amount of a special stat (`resistance` / `weakness`) to a
// damage descriptor across a character's effective inventory — doesn't stack, so
// the single highest matching amount wins. `vsType` is matched exactly against
// one of the comma-separated tokens in each modifier's `vs`.
const highestWornSpecial = (inventory, isInvested, stat, vsType) => {
  if (!vsType) return 0;
  let best = 0;
  for (const e of Array.isArray(inventory) ? inventory : []) {
    if (!contributes(e, isInvested)) continue;
    for (const m of specialModifiers(itemModifiers(e))) {
      if (m.stat !== stat) continue;
      const types = String(m.vs).split(',').map((t) => t.trim());
      if (types.includes(vsType) && typeof m.amount === 'number' && m.amount > best) {
        best = m.amount;
      }
    }
  }
  return best;
};

/**
 * Highest worn-gear resistance to a damage descriptor (#900/#922). Reduces
 * matching incoming/persistent damage.
 *
 * @param {Array}    inventory  - effective (state-stamped) inventory
 * @param {Function} isInvested - (uid) => boolean
 * @param {string}   vsType     - damage descriptor (e.g. 'fire', 'persistent-bleed')
 * @returns {number} highest matching resistance, or 0
 */
export const wornResistanceFor = (inventory, isInvested, vsType) =>
  highestWornSpecial(inventory, isInvested, 'resistance', vsType);

/**
 * Highest worn-gear weakness to a damage descriptor (#918) — the inverse of
 * wornResistanceFor; adds to matching incoming/persistent damage.
 *
 * @param {Array}    inventory  - effective (state-stamped) inventory
 * @param {Function} isInvested - (uid) => boolean
 * @param {string}   vsType     - damage descriptor
 * @returns {number} highest matching weakness, or 0
 */
export const wornWeaknessFor = (inventory, isInvested, vsType) =>
  highestWornSpecial(inventory, isInvested, 'weakness', vsType);

/**
 * True when a contributing worn item grants immunity to a damage descriptor
 * (#919). Immunity modifiers carry no `amount` — the mere presence of a
 * matching `{ stat: 'immunity', vs }` on worn (and invested, where applicable)
 * gear zeroes matching damage, so this is a boolean, not a highest-of.
 *
 * @param {Array}    inventory  - effective (state-stamped) inventory
 * @param {Function} isInvested - (uid) => boolean
 * @param {string}   vsType     - damage descriptor
 * @returns {boolean}
 */
export const wornImmuneTo = (inventory, isInvested, vsType) => {
  if (!vsType) return false;
  for (const e of Array.isArray(inventory) ? inventory : []) {
    if (!contributes(e, isInvested)) continue;
    for (const m of specialModifiers(itemModifiers(e))) {
      if (m.stat !== 'immunity') continue;
      const types = String(m.vs).split(',').map((t) => t.trim());
      if (types.includes(vsType)) return true;
    }
  }
  return false;
};
