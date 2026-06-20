// src/utils/weaponRunes.js
// Weapon-rune resolver spine (#548, Slice 1).
//
// Folds a declarative `runes` block over a base weapon definition into the
// effective strike metadata: attack item bonus (potency), scaled damage dice
// (striking), forwarded damage riders (property runes), plus a derived display
// name and price. Pure functions only — no UI, no catalog reads. The property-
// rune catalog and the Vitalizing rider schema arrive in Slice 3; this slice
// forwards whatever property-rune objects it is handed so the spine is complete.

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

  const riders = properties.map(p => p?.rider).filter(Boolean);

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
