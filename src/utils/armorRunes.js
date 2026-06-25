// src/utils/armorRunes.js
// Armor-rune resolver spine (#727, R1) — the armor mirror of weaponRunes.js.
//
// Folds a declarative `runes` block over a base armor definition into effective
// metadata: a potency item bonus to AC, a resilient item bonus to all saves,
// forwarded property runes, plus a derived display name and summed price. Pure
// functions only — no UI, no catalog reads. The property-rune catalog (Slick,
// Shadow, Fortification, …) and its schema arrive in R2 (#733); this slice
// forwards whatever property-rune objects it is handed so the spine is complete.
//
// CONVENTION (from W1, #730): the emitted `modifiers` carry only the *magic
// delta* — the potency AC bonus and resilient save bonus. The base armor's own
// acBonus is NOT included; it is baked into the derived AC (utils/armorClass.js)
// OUTSIDE the effect engine, so bestOfKind sums base + potency rather than
// collapsing two `item` AC bonuses into one. These modifiers feed the #726
// worn-gear spine.

// Fundamental armor potency: full (non-incremental) price + AC item bonus.
export const ARMOR_POTENCY = {
  1: { bonus: 1, price: 160 },
  2: { bonus: 2, price: 1060 },
  3: { bonus: 3, price: 20560 },
};

// Resilient is the second fundamental rune: a full-price item bonus to all
// saving throws. Tiers mirror potency (resilient / greater / major).
export const RESILIENT = {
  resilient: { bonus: 1, price: 340, label: 'Resilient' },
  greater: { bonus: 2, price: 3440, label: 'Greater Resilient' },
  major: { bonus: 3, price: 49440, label: 'Major Resilient' },
};

// The three saving throws a resilient rune buffs (effect-engine stat keys).
export const SAVE_STATS = ['fort', 'reflex', 'will'];

/**
 * Build a derived armor name in PF2e order:
 *   +{potency} {resilient} {property…} {material} {base}
 * Empty segments are omitted.
 *
 * @param {Object} parts
 * @param {number} [parts.potency]      - Potency tier bonus (0–3)
 * @param {string} [parts.resilient]    - Resilient tier key (resilient|greater|major)
 * @param {string[]} [parts.properties] - Property-rune display names, in order
 * @param {string} [parts.material]     - Precious material (e.g. "Silver")
 * @param {string} parts.base           - Base armor name
 * @returns {string}
 */
export const buildArmorName = ({ potency = 0, resilient, properties = [], material, base } = {}) => {
  const segments = [];
  if (potency > 0) segments.push(`+${potency}`);
  if (resilient && RESILIENT[resilient]) segments.push(RESILIENT[resilient].label);
  segments.push(...properties.filter(Boolean));
  if (material) segments.push(material);
  if (base) segments.push(base);
  return segments.join(' ');
};

/**
 * Resolve a base armor plus a `runes` block into effective metadata.
 *
 * @param {Object} base  - Base armor: { name, price?, material?, traits? }
 * @param {Object} runes - { potency?: 0–3, resilient?: key, property?: Array<{name, price?, modifiers?, riders?}> }
 * @returns {{
 *   name: string,
 *   price: number,
 *   acBonus: number,     // potency item bonus to AC (the magic delta)
 *   saveBonus: number,   // resilient item bonus to every save
 *   modifiers: Array,    // flat {stat,kind,amount} blocks for the #726 worn-gear spine
 *   riders: Array,       // non-modifier passive descriptors forwarded from property runes
 *   properties: Array,   // raw property-rune objects, in order
 * }}
 */
export const resolveArmor = (base = {}, runes = {}) => {
  const potencyTier = runes.potency || 0;
  const potencyDef = ARMOR_POTENCY[potencyTier];
  const resilientDef = runes.resilient ? RESILIENT[runes.resilient] : null;
  const properties = Array.isArray(runes.property) ? runes.property : [];

  const acBonus = potencyDef ? potencyDef.bonus : 0;
  const saveBonus = resilientDef ? resilientDef.bonus : 0;

  const price = (base.price || 0)
    + (potencyDef ? potencyDef.price : 0)
    + (resilientDef ? resilientDef.price : 0)
    + properties.reduce((sum, p) => sum + (p?.price || 0), 0);

  const name = buildArmorName({
    potency: acBonus,
    resilient: runes.resilient,
    properties: properties.map((p) => p?.name).filter(Boolean),
    material: base.material,
    base: base.name,
  });

  // Fundamental-rune modifiers (the magic delta), then each property rune's own
  // forwarded modifiers. The worn-gear spine drops stats it can't yet model.
  const modifiers = [];
  if (acBonus > 0) modifiers.push({ stat: 'ac', kind: 'item', amount: acBonus });
  if (saveBonus > 0) {
    SAVE_STATS.forEach((stat) => modifiers.push({ stat, kind: 'item', amount: saveBonus }));
  }
  properties.forEach((p) => {
    if (Array.isArray(p?.modifiers)) modifiers.push(...p.modifiers);
  });

  // Non-modifier passive descriptors (reminders) ride along for display; active
  // ability/reaction runes are wired by #728.
  const riders = properties.flatMap((p) =>
    Array.isArray(p?.riders) ? p.riders : p?.rider ? [p.rider] : []
  );

  return { name, price, acBonus, saveBonus, modifiers, riders, properties };
};

// Whether an item carries a structured `runes` block (the base + runes model).
const hasRuneBlock = (item) =>
  !!(item && item.runes && typeof item.runes === 'object' && !Array.isArray(item.runes));

export const hasArmorRuneBlock = hasRuneBlock;

/** Resolve an inventory armor's base fields + its runes block in one call. */
export const resolveArmorItem = (item) =>
  resolveArmor(
    { name: item?.name, price: item?.price, material: item?.material, traits: item?.traits },
    hasRuneBlock(item) ? item.runes : {}
  );

/**
 * Effective display name for an inventory armor: the full derived runed name
 * for a base + runes armor, else the item's own name (non-runed armor passes
 * through unchanged). Display-only — never feeds back into the resolver.
 */
export const armorDisplayName = (item) => {
  if (!hasRuneBlock(item)) return item?.name;
  return resolveArmorItem(item).name;
};

/** Resolved property-rune docs on an armor, in slot order ([] when none). */
export const armorPropertyRunes = (item) =>
  hasRuneBlock(item) && Array.isArray(item.runes.property)
    ? item.runes.property.filter((p) => p && typeof p === 'object')
    : [];

/**
 * Short fundamental-rune summary for a runed armor ("+1 Resilient"), or '' when
 * neither fundamental is present. Property runes are listed separately.
 */
export const armorRuneTierSummary = (runes) => {
  if (!runes || typeof runes !== 'object') return '';
  return buildArmorName({ potency: ARMOR_POTENCY[runes.potency]?.bonus || 0, resilient: runes.resilient, base: '' });
};
