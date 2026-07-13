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
// Exported so the wayfinder rail (#928) reuses the exact worn+invested gate for
// a host wayfinder instead of re-deriving it.
export const contributes = (e, isInvested) =>
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
 * The senses line a `sense` block reads as (#1210 M4h — the Bloodstained
 * Bandana's bloodsense). PF2e phrasing: `<precision> <name> <range> feet`
 * (e.g. "imprecise bloodsense 30 feet"); the range is dropped when unset, the
 * precision when unset. Empty string for a block with no `name`.
 *
 * @param {Object} s - { name, precision?, rangeFt? }
 * @returns {string}
 */
export const senseLabel = (s) => {
  if (!s || typeof s !== 'object' || !s.name) return '';
  const parts = [];
  if (s.precision) parts.push(String(s.precision));
  parts.push(String(s.name));
  if (s.rangeFt != null && s.rangeFt !== '') parts.push(`${s.rangeFt} feet`);
  return parts.join(' ');
};

/**
 * Senses granted by worn gear (#1210 M4h). Any contributing worn item (worn,
 * and invested where investable — same gate as the modifier readers) that
 * carries a `sense: { name, precision?, rangeFt? }` block adds its senses line.
 * Deduped case-insensitively so two copies of the same sense collapse; returned
 * in inventory order.
 *
 * @param {Array}    inventory  - effective (state-stamped) inventory
 * @param {Function} isInvested - (uid) => boolean
 * @returns {string[]} the granted senses lines, e.g. ['imprecise bloodsense 30 feet']
 */
export const wornSenses = (inventory, isInvested) => {
  const out = [];
  const seen = new Set();
  for (const e of Array.isArray(inventory) ? inventory : []) {
    if (!e || !e.sense || typeof e.sense !== 'object') continue;
    if (!contributes(e, isInvested)) continue;
    const label = senseLabel(e.sense);
    const key = label.toLowerCase();
    if (label && !seen.has(key)) { seen.add(key); out.push(label); }
  }
  return out;
};

/**
 * Extra daily spell slots granted by worn gear (#1093 — Ring of Wizardry).
 * An item authors `bonusSlots: { tradition?, ranks: { <rank>: n } }`; it
 * contributes while worn (and invested, when investable), and only to a
 * caster — when the block names a tradition, the character's must match
 * (the Ring of Wizardry does nothing for a divine caster). Sums across
 * contributing items into a { rank: n } map ({} when none apply).
 *
 * @param {Array}    inventory  - effective (state-stamped) inventory
 * @param {Function} isInvested - (uid) => boolean
 * @param {string}   tradition  - the character's spellcasting tradition
 * @returns {Object} summed bonus slots per rank
 */
export const wornBonusSlots = (inventory, isInvested, tradition) => {
  const out = {};
  if (!tradition) return out;
  for (const e of Array.isArray(inventory) ? inventory : []) {
    const block = e?.bonusSlots;
    if (!block || typeof block !== 'object') continue;
    if (!contributes(e, isInvested)) continue;
    if (block.tradition && String(block.tradition) !== String(tradition)) continue;
    for (const [rank, n] of Object.entries(block.ranks || {})) {
      if (typeof n === 'number' && n > 0) out[rank] = (out[rank] || 0) + n;
    }
  }
  return out;
};

/**
 * Synthetic active-effect pairs for worn gear granting a Speed modifier
 * (SP3, #1222 — Boots of Bounding's +5 item bonus). Same `{ entry, def }`
 * shape as useWornGear's rail, but consumed by the Speed spine in useCharacter
 * (via computeEffectBonuses, so PF2e item-bonus stacking applies — highest
 * item wins vs other item speed bonuses, stacks with status/circumstance).
 * Deliberately NOT part of useWornGear's SUPPORTED_STATS universe: the spine
 * is the only speed apply-site, and routing these through the resolved-effects
 * list too would leave a stray always-on chip with no netting consumer.
 *
 * Same contribution gate as every worn-gear reader: worn, and invested when
 * the item carries the Invested trait.
 *
 * @param {Array}    inventory  - effective (state-stamped) inventory
 * @param {Function} isInvested - (uid) => boolean
 * @returns {Array<{ entry: object, def: object }>}
 */
export const wornSpeedEffects = (inventory, isInvested) => {
  const out = [];
  for (const e of Array.isArray(inventory) ? inventory : []) {
    if (!e || !contributes(e, isInvested)) continue;
    const speedMods = itemModifiers(e).filter(
      (m) => m && m.stat === 'speed' && typeof m.amount === 'number'
    );
    if (!speedMods.length) continue;
    const id = `wornspeed-${e.uid}`;
    out.push({
      entry: { id, effectId: id },
      def: { id, name: e.name, modifiers: speedMods },
    });
  }
  return out;
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
