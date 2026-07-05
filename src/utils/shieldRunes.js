// src/utils/shieldRunes.js
// Shield-rune resolver spine (#1165, S1) — the shield mirror of weaponRunes.js /
// armorRunes.js, but deliberately SIMPLER. PF2e Remaster confirms a shield can be
// etched with EXACTLY ONE fundamental rune — the Reinforcing rune — and no
// potency or property runes (AoN "Shield Runes"). The reinforcing rune raises the
// shield's Hardness / HP / Break Threshold on an additive-with-cap curve; it never
// touches the shield's AC `bonus` or `speedPenalty`.
//
// Pure functions only — no UI, no catalog reads, no socket logic (S2). This slice
// resolves a base shield + `runes.reinforcing` tier into effective durability
// stats plus a derived Remaster display name, and is wired into useShield so the
// held shield's Hardness/HP/BT (and maxHp) reflect the rune.
//
// Naming (locked decision): Remaster grade-first — "Minor Reinforcing Steel
// Shield", NOT the legacy "Sturdy Shield (Minor)".

// Reinforcing table (AoN, additive-with-cap). Each tier adds a flat delta to the
// base shield's Hardness/HP/BT, then clamps to the tier cap: min(base + delta, cap).
// A plain steel shield (H5/HP20/BT10) + Minor therefore yields H8/HP64/BT32 — the
// exact stats of the retired Sturdy Shield (Minor), so the migration is lossless.
export const REINFORCING = {
  minor:    { rank: 1, level: 4,  price: 75,    label: 'Minor Reinforcing',    hardness: 3, hp: 44,  bt: 22, hardnessCap: 8,  hpCap: 64,  btCap: 32 },
  lesser:   { rank: 2, level: 7,  price: 300,   label: 'Lesser Reinforcing',   hardness: 3, hp: 52,  bt: 26, hardnessCap: 10, hpCap: 80,  btCap: 40 },
  moderate: { rank: 3, level: 10, price: 900,   label: 'Moderate Reinforcing', hardness: 3, hp: 64,  bt: 32, hardnessCap: 13, hpCap: 104, btCap: 52 },
  greater:  { rank: 4, level: 13, price: 2500,  label: 'Greater Reinforcing',  hardness: 5, hp: 80,  bt: 40, hardnessCap: 15, hpCap: 120, btCap: 60 },
  major:    { rank: 5, level: 16, price: 8000,  label: 'Major Reinforcing',    hardness: 5, hp: 84,  bt: 42, hardnessCap: 17, hpCap: 136, btCap: 68 },
  supreme:  { rank: 6, level: 19, price: 32000, label: 'Supreme Reinforcing',  hardness: 7, hp: 108, bt: 54, hardnessCap: 20, hpCap: 160, btCap: 80 },
};

// Ordered tier keys (minor → supreme), for dropdowns and rank comparisons.
export const REINFORCING_TIERS = Object.keys(REINFORCING).sort(
  (a, b) => REINFORCING[a].rank - REINFORCING[b].rank
);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const cap = (base, delta, ceiling) => Math.min(num(base) + num(delta), ceiling);

// Read a base shield's stats regardless of spelling (authored blocks use
// health/breakThreshold; normalized blocks use hp/brokenThreshold).
const baseStats = (base = {}) => ({
  hardness: num(base.hardness),
  hp: num(base.hp ?? base.health),
  brokenThreshold: num(base.brokenThreshold ?? base.breakThreshold),
  bonus: base.bonus,
  speedPenalty: base.speedPenalty,
});

/**
 * Build a derived shield name in Remaster order: "{Grade} Reinforcing {material} {base}".
 * With no reinforcing rune, returns the bare (material +) base name.
 *
 * @param {Object} parts
 * @param {string} [parts.reinforcing] - Reinforcing tier key (minor…supreme)
 * @param {string} [parts.material]    - Precious material (e.g. "Darkwood")
 * @param {string} parts.base          - Base shield name (e.g. "Steel Shield")
 * @returns {string}
 */
export const buildShieldName = ({ reinforcing, material, base } = {}) => {
  const segments = [];
  if (reinforcing && REINFORCING[reinforcing]) segments.push(REINFORCING[reinforcing].label);
  if (material) segments.push(material);
  if (base) segments.push(base);
  return segments.join(' ');
};

/**
 * Resolve a base shield plus a `runes` block into effective durability + metadata.
 * Additive-with-cap over the base's authored stats, so precious-material / non-steel
 * bases (which carry their own higher base Hardness/HP/BT) resolve correctly.
 *
 * @param {Object} base  - { name, price?, material?, hardness, health|hp, breakThreshold|brokenThreshold, bonus?, speedPenalty? }
 * @param {Object} runes - { reinforcing?: tierKey }
 * @returns {{
 *   name: string,
 *   price: number,
 *   hardness: number,
 *   hp: number,
 *   brokenThreshold: number,
 *   bonus: number|undefined,      // AC bonus — passed through untouched
 *   speedPenalty: number|undefined,
 *   reinforcing: string|null,     // resolved tier key, or null
 * }}
 */
export const resolveShield = (base = {}, runes = {}) => {
  const stats = baseStats(base);
  const tierKey = runes && REINFORCING[runes.reinforcing] ? runes.reinforcing : null;
  const tier = tierKey ? REINFORCING[tierKey] : null;

  const hardness = tier ? cap(stats.hardness, tier.hardness, tier.hardnessCap) : stats.hardness;
  const hp = tier ? cap(stats.hp, tier.hp, tier.hpCap) : stats.hp;
  const brokenThreshold = tier ? cap(stats.brokenThreshold, tier.bt, tier.btCap) : stats.brokenThreshold;

  const price = num(base.price) + (tier ? tier.price : 0);
  const name = buildShieldName({ reinforcing: tierKey, material: base.material, base: base.name });

  return {
    name,
    price,
    hardness,
    hp,
    brokenThreshold,
    bonus: stats.bonus,
    speedPenalty: stats.speedPenalty,
    reinforcing: tierKey,
  };
};

// Whether an item carries a structured `runes` block (the base + runes model).
const hasRuneBlock = (item) =>
  !!(item && item.runes && typeof item.runes === 'object' && !Array.isArray(item.runes));

export const hasShieldRuneBlock = hasRuneBlock;

/** Whether a shield item has a reinforcing rune etched (drives resolved display). */
export const hasReinforcing = (item) =>
  hasRuneBlock(item) && !!REINFORCING[item.runes.reinforcing];

/**
 * Resolve an inventory shield's base stats + its runes block in one call.
 * Base stats come from the item's `shield` block; name/price/material from the item.
 */
export const resolveShieldItem = (item) =>
  resolveShield(
    { name: item?.name, price: item?.price, material: item?.material, ...(item?.shield || {}) },
    hasRuneBlock(item) ? item.runes : {}
  );

/**
 * A resolved `shield` block ready to hand to normalizeShield / the durability path:
 * the base shield stats with reinforcing folded in (Hardness/HP/BT capped), AC bonus
 * and speed penalty preserved. Non-reinforced shields pass through unchanged.
 */
export const resolveShieldBlock = (item) => {
  if (!item || !item.shield) return item?.shield ?? null;
  // No reinforcing rune → pass the authored block through untouched (identity),
  // preserving the exact pre-#1165 durability behavior for plain shields.
  if (!hasReinforcing(item)) return item.shield;
  const r = resolveShieldItem(item);
  return {
    ...item.shield,
    hardness: r.hardness,
    hp: r.hp,
    health: r.hp,
    brokenThreshold: r.brokenThreshold,
    breakThreshold: r.brokenThreshold,
  };
};

/**
 * Effective display name for an inventory shield: the full derived Remaster name
 * when a reinforcing rune is present, else the item's own name. Display-only.
 */
export const shieldDisplayName = (item) => {
  if (!hasReinforcing(item)) return item?.name;
  return resolveShieldItem(item).name;
};

/**
 * Short reinforcing-tier summary for a shield's runes block ("Minor Reinforcing"),
 * or '' when no reinforcing rune is present.
 */
export const shieldRuneTierSummary = (runes) => {
  if (!runes || typeof runes !== 'object') return '';
  return REINFORCING[runes.reinforcing]?.label || '';
};
