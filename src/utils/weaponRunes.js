// src/utils/weaponRunes.js
// Weapon-rune resolver spine (#548, Slice 1).
//
// Folds a declarative `runes` block over a base weapon definition into the
// effective strike metadata: attack item bonus (potency), scaled damage dice
// (striking), forwarded damage riders (property runes), plus a derived display
// name and price. Pure functions only — no UI, no catalog reads. The property-
// rune catalog and the Vitalizing rider schema arrive in Slice 3; this slice
// forwards whatever property-rune objects it is handed so the spine is complete.

import { isDragonbreath, dragonbreathDisplayName } from './dragonbreath';

// Full (non-incremental) price + attack item bonus per potency tier.
export const POTENCY = {
  1: { bonus: 1, price: 35 },
  2: { bonus: 2, price: 935 },
  3: { bonus: 3, price: 8935 },
};

// Striking tiers add weapon damage dice (PF2e: +1 / +2 / +3 dice). Full prices.
export const STRIKING = {
  striking: { extraDice: 1, price: 65, label: 'Striking' },
  greater: { extraDice: 2, price: 1065, label: 'Greater Striking' },
  major: { extraDice: 3, price: 31065, label: 'Major Striking' },
};

/**
 * Scale a native damage-dice string by adding `extraDice` dice of the same size.
 * `1d6` + 1 → `2d6`. Any trailing modifier (`1d6+3`) is preserved. Strings that
 * are not leading `XdY` dice (e.g. flat damage) pass through unchanged.
 *
 * @param {string} damage    - Native dice string (e.g. "1d6", "1d8+2")
 * @param {number} extraDice - Dice to add (0 leaves the string untouched)
 * @returns {string}
 */
export const scaleDamageDice = (damage, extraDice = 0) => {
  if (!damage || !extraDice) return damage;
  return String(damage).replace(/^(\d+)d(\d+)/, (_, count, size) =>
    `${parseInt(count, 10) + extraDice}d${size}`);
};

/**
 * Build a derived weapon name in PF2e order:
 *   +{potency} {striking} {property…} {material} {base}
 * Empty segments are omitted.
 *
 * @param {Object} parts
 * @param {number} [parts.potency]      - Potency tier (0–3)
 * @param {string} [parts.striking]     - Striking tier key (striking|greater|major)
 * @param {string[]} [parts.properties] - Property-rune display names, in order
 * @param {string} [parts.material]     - Precious material (e.g. "Cold Iron")
 * @param {string} parts.base           - Base weapon name
 * @returns {string}
 */
export const buildWeaponName = ({ potency = 0, striking, properties = [], material, base } = {}) => {
  const segments = [];
  if (potency > 0) segments.push(`+${potency}`);
  if (striking && STRIKING[striking]) segments.push(STRIKING[striking].label);
  segments.push(...properties.filter(Boolean));
  if (material) segments.push(material);
  if (base) segments.push(base);
  return segments.join(' ');
};

// Human-readable duration suffix for a crit-triggered condition.
const DURATION_TEXT = {
  'end-of-next-turn': 'until the end of your next turn',
  'while-persistent': 'while the persistent damage continues',
};
const conditionPhrase = (c) => {
  const base = `${c.name}${c.value != null ? ` ${c.value}` : ''}`;
  const dur = DURATION_TEXT[c.duration] || c.duration;
  return dur ? `${base} (${dur})` : base;
};

/**
 * Translate one property rune's rich `rider` schema into flat #222 damage-step
 * riders. A rune yields up to: one immediate typed extra-dice rider (#1019 —
 * flaming's 1d6 fire on every hit, entered as its own damage instance), one
 * persistent-damage rider (any hit), one crit-only persistent rider
 * (`onCrit.persistent` — flaming's 1d10 persistent fire; crit-exclusive
 * riders keep their authored dice, never re-doubled), plus one rider per
 * crit-triggered condition (criticalSuccess only). A `vsTrait` gate is
 * carried as `appliesVsTrait` for the damage step to resolve against real target
 * traits. Property entries that already carry a flat #222 rider (an inline
 * `{ rider: { persistent: {dice,type} | condition | bonus } }`) pass through.
 *
 * @param {Object} rune - resolved property-rune doc ({ id, name, rider })
 * @returns {Array} flat #222 riders
 */
export const translatePropertyRider = (rune) => {
  const rider = rune?.rider;
  if (!rider) return [];

  // Already a flat #222 rider (Slice 1 inline shape / hand-authored): forward.
  if (typeof rider.persistent === 'object' || rider.condition || rider.bonus) {
    return [rider];
  }

  const baseId = `rune-${rune.id || (rune.name || 'property').toLowerCase()}`;
  const vsTrait = rider.vsTrait || null;
  const vsLabel = vsTrait ? ` (vs ${vsTrait})` : '';
  const gate = vsTrait ? { appliesVsTrait: vsTrait } : {};
  const out = [];

  if (rider.dice) {
    out.push({
      id: `${baseId}-dice`,
      label: `${rune.name}${vsLabel}`,
      dice: rider.dice,
      type: rider.damageType || '',
      ...gate,
    });
  }

  if (rider.persistent) {
    out.push({
      id: `${baseId}-persistent`,
      label: `${rune.name}${vsLabel}`,
      persistent: { dice: rider.persistent, type: rider.damageType || '' },
      ...gate,
    });
  }

  if (rider.onCrit?.persistent) {
    out.push({
      id: `${baseId}-crit-persistent`,
      label: `${rune.name} (crit)${vsLabel}`,
      persistent: {
        dice: rider.onCrit.persistent,
        type: rider.onCrit.damageType || rider.damageType || '',
      },
      on: ['criticalSuccess'],
      ...gate,
    });
  }

  (rider.onCrit?.conditions || []).forEach((c) => {
    out.push({
      id: `${baseId}-crit-${c.name}`,
      label: `${rune.name} — ${c.name}${c.value != null ? ` ${c.value}` : ''}${vsLabel}`,
      condition: conditionPhrase(c),
      on: ['criticalSuccess'],
      ...gate,
    });
  });

  return out;
};

/**
 * Resolve a base weapon plus a `runes` block into effective metadata.
 *
 * @param {Object} base  - Base weapon: { name, price, damage?, traits?, material? }
 * @param {Object} runes - { potency?: 0–3, striking?: key, property?: Array<{name, price, rider?}> }
 * @returns {{
 *   name: string,
 *   price: number,
 *   potencyBonus: number,   // attack item bonus
 *   extraDice: number,      // striking dice to add to each strike's native die
 *   damage: string|undefined, // scaled native die when base.damage is provided
 *   riders: Array,          // property-rune riders forwarded to the #222 damage step
 *   properties: Array       // raw property-rune objects, in order
 * }}
 */
export const resolveWeapon = (base = {}, runes = {}) => {
  const potencyTier = runes.potency || 0;
  const potencyDef = POTENCY[potencyTier];
  const strikingDef = runes.striking ? STRIKING[runes.striking] : null;
  const properties = Array.isArray(runes.property) ? runes.property : [];

  const potencyBonus = potencyDef ? potencyDef.bonus : 0;
  const extraDice = strikingDef ? strikingDef.extraDice : 0;

  const price = (base.price || 0)
    + (potencyDef ? potencyDef.price : 0)
    + (strikingDef ? strikingDef.price : 0)
    + properties.reduce((sum, p) => sum + (p?.price || 0), 0);

  const name = buildWeaponName({
    potency: potencyBonus,
    striking: runes.striking,
    properties: properties.map(p => p?.name).filter(Boolean),
    material: base.material,
    base: base.name,
  });

  const riders = properties.flatMap(translatePropertyRider);

  return {
    name,
    price,
    potencyBonus,
    extraDice,
    damage: base.damage != null ? scaleDamageDice(base.damage, extraDice) : undefined,
    riders,
    properties,
  };
};

// Whether an item carries a structured `runes` block (the base + runes model).
const hasRuneBlock = (item) =>
  !!(item && item.runes && typeof item.runes === 'object' && !Array.isArray(item.runes));

/**
 * The effective display name for an inventory weapon: the full derived runed
 * name (#548) for a base + runes weapon, else the item's own name (legacy baked
 * weapons and everything non-runed pass through unchanged). Display-only — the
 * base `name` is what strike resolution derives from, so this never feeds back
 * into the resolver.
 */
export const weaponDisplayName = (item) => {
  // Dragonbreath template (#1210 M4b): name is [property runes] [tier word]
  // [dragon type] Dragonbreath [base], not the standard +N Striking prefix. The
  // base weapon name (item.name) is the template's base segment.
  if (isDragonbreath(item)) return dragonbreathDisplayName(item, item?.name);
  if (!hasRuneBlock(item)) return item?.name;
  return resolveWeapon(
    { name: item.name, price: item.price, material: item.material, traits: item.traits },
    item.runes,
  ).name;
};

/**
 * Short potency/striking summary for a runed weapon ("+2 Greater Striking"),
 * or '' when neither is present. Property runes are listed separately.
 */
export const runeTierSummary = (runes) => {
  if (!runes || typeof runes !== 'object') return '';
  return buildWeaponName({ potency: POTENCY[runes.potency]?.bonus || 0, striking: runes.striking, base: '' });
};

/** Resolved property-rune docs on an item, in slot order ([] when none). */
export const weaponPropertyRunes = (item) =>
  hasRuneBlock(item) && Array.isArray(item.runes.property)
    ? item.runes.property.filter((p) => p && typeof p === 'object')
    : [];

// ── Property-rune slots (#607, #804) ──────────────────────────────────────────
// A weapon holds property runes up to its potency value: +1 potency = 1 slot,
// +2 = 2, +3 = 3; no potency = no slots. Striking is its own (potency-independent)
// slot and never competes with property runes. These pure helpers back the apply
// and move-rune pickers so a player can't over-slot a weapon.

/** Property-rune slot capacity for a weapon's `runes` block (= potency tier). */
export const propertySlotCapacity = (runes) =>
  (runes && typeof runes === 'object' && runes.potency) || 0;

/** Property-rune slots currently filled on an item (counts string + doc refs). */
export const usedPropertySlots = (item) =>
  hasRuneBlock(item) && Array.isArray(item.runes.property)
    ? item.runes.property.filter(Boolean).length
    : 0;

/** Free property-rune slots on an item (capacity − used, floored at 0). */
export const freePropertySlots = (item) =>
  Math.max(0, propertySlotCapacity(item && item.runes) - usedPropertySlots(item));

/** Whether a weapon can take another property rune without displacing one. */
export const hasFreePropertySlot = (item) => freePropertySlots(item) > 0;

/**
 * A source breakdown for a runed weapon's strike (#608): where the attack
 * bonus, extra damage dice, and riders come from. Returns null when the item
 * carries no rune contribution at all (so non-runed strikes stay untagged).
 *
 * @returns {null|{ potencyBonus, extraDice, strikingLabel, properties }}
 */
export const buildRuneBreakdown = (item) => {
  if (!hasRuneBlock(item)) return null;
  const r = resolveWeapon(
    { name: item.name, price: item.price, material: item.material, traits: item.traits },
    item.runes,
  );
  const properties = r.properties.map((p) => p?.name).filter(Boolean);
  if (!r.potencyBonus && !r.extraDice && !properties.length) return null;
  return {
    potencyBonus: r.potencyBonus,
    extraDice: r.extraDice,
    strikingLabel: item.runes.striking && STRIKING[item.runes.striking]
      ? STRIKING[item.runes.striking].label
      : null,
    properties,
  };
};

/** Human-readable one-line breakdown: "+1 potency · +1 die (Striking) · Vitalizing". */
export const formatRuneBreakdown = (breakdown) => {
  if (!breakdown) return '';
  const parts = [];
  if (breakdown.potencyBonus) parts.push(`+${breakdown.potencyBonus} potency`);
  if (breakdown.extraDice) {
    const diceWord = breakdown.extraDice === 1 ? 'die' : 'dice';
    parts.push(`+${breakdown.extraDice} ${diceWord}${breakdown.strikingLabel ? ` (${breakdown.strikingLabel})` : ''}`);
  }
  (breakdown.properties || []).forEach((p) => parts.push(p));
  return parts.join(' · ');
};
