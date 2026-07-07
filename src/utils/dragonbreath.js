// Dragonbreath Weapons (Magic+ arsenal M4, epic #1206 / #1210). Pure helpers —
// no React, no catalog reads.
//
// Dragonbreath is a TEMPLATE applied to a base weapon, not a rune and not a fixed
// catalog weapon. A base-weapon inventory entry carries:
//
//   entry.dragonbreath = { tier: 'base'|'greater'|'major', dragonType: 'Mirage' }
//
// beside its normal `entry.runes.property`. The template is TREATED AS carrying
// the tier's fundamental runes (potency + striking); everything downstream —
// Strike dice, property-slot capacity, breath dice/DC — derives from those
// implied fundamentals, so the existing weaponRunes resolver just works once they
// are injected (dragonbreathRunes). Fundamentals are locked to the tier: they are
// never etched directly (that is a tier UPGRADE via the work-order rail), only
// property runes are etched into the slots the implied potency grants.

// Per-tier template facts: the implied fundamentals plus the pack's authored
// level / price / cone size. Base tier carries no tier word in the display name.
export const DRAGONBREATH_TIERS = {
  base: { key: 'base', potency: 1, striking: 'striking', tierWord: null, level: 7, price: 350, coneFt: 15 },
  greater: { key: 'greater', potency: 2, striking: 'greater', tierWord: 'Greater', level: 13, price: 2800, coneFt: 30 },
  major: { key: 'major', potency: 3, striking: 'major', tierWord: 'Major', level: 20, price: 70500, coneFt: 60 },
};

export const DRAGONBREATH_TIER_ORDER = ['base', 'greater', 'major'];

/** The pack-authored catalog price of a bare dragonbreath weapon at a tier (no
 * base weapon / property runes), or 0 for an unknown tier. */
export const dragonbreathTierPrice = (tier) => {
  const t = DRAGONBREATH_TIERS[String(tier).toLowerCase()];
  return t ? t.price : 0;
};

/** The item level of a dragonbreath weapon at a tier, or 0 for an unknown tier. */
export const dragonbreathTierLevel = (tier) => {
  const t = DRAGONBREATH_TIERS[String(tier).toLowerCase()];
  return t ? t.level : 0;
};

// Breath dice by striking grade and save DC by potency tier — both derived from
// the tier's implied fundamentals (pack "Special": 4d6/6d6/8d6 as the striking
// grade rises; DC 23/27/35 as the potency rises). The cone widens by tier; the
// emanation option is always a 5-foot burst.
const BREATH_DICE = { striking: '4d6', greater: '6d6', major: '8d6' };
const BREATH_DC = { 1: 23, 2: 27, 3: 35 };
export const BREATH_EMANATION_FT = 5;
export const BREATH_FREQUENCY = 'once per minute';

// Authored dragon-kind table — the breath/Strike damage type(s) per dragon,
// transcribed from the pack's Dragon Scale catalysts (its two official dragon
// families: elemental "creature" dragons and planar/Outer dragons). The pack
// explicitly invites the GM to add kinds; a type not in this table still
// templates (name + tier mechanics), it simply carries no damage type until the
// GM annotates one. The breath save defaults to basic Reflex — the classic cone
// breath — which the GM can override per kind.
export const DRAGON_KINDS = {
  // Creature dragons (the breath's damage type is also its trait)
  black: { damageTypes: ['acid'] },
  blue: { damageTypes: ['electricity'] },
  green: { damageTypes: ['poison'] },
  red: { damageTypes: ['fire'] },
  white: { damageTypes: ['cold'] },
  brass: { damageTypes: ['fire'] },
  bronze: { damageTypes: ['electricity'] },
  copper: { damageTypes: ['acid'] },
  gold: { damageTypes: ['fire'] },
  silver: { damageTypes: ['cold'] },
  brine: { damageTypes: ['acid'] },
  cloud: { damageTypes: ['electricity'] },
  sky: { damageTypes: ['electricity'] },
  magma: { damageTypes: ['fire'] },
  underworld: { damageTypes: ['fire'] },
  sovereign: { damageTypes: ['mental'] },
  umbral: { damageTypes: ['void'] },
  // Planar / Outer dragons (a choice of damage type)
  adamantine: { damageTypes: ['bludgeoning', 'fire'] },
  conspirator: { damageTypes: ['mental', 'poison'] },
  diabolic: { damageTypes: ['fire', 'spirit'] },
  empyreal: { damageTypes: ['spirit'] },
  fortune: { damageTypes: ['force'] },
  horned: { damageTypes: ['fire', 'poison'] },
  mirage: { damageTypes: ['force', 'mental'] },
  omen: { damageTypes: ['mental'] },
};

export const DEFAULT_BREATH_SAVE = 'Reflex';

/** Normalized template block ({ tier, dragonType }) for an entry, or null. */
export const dragonbreathMeta = (entry) => {
  const d = entry && entry.dragonbreath;
  if (!d || typeof d !== 'object') return null;
  const tier = String(d.tier || 'base').toLowerCase();
  if (!DRAGONBREATH_TIERS[tier]) return null;
  return { tier, dragonType: d.dragonType ? String(d.dragonType) : '' };
};

/** Whether an entry is a dragonbreath-templated weapon. */
export const isDragonbreath = (entry) => !!dragonbreathMeta(entry);

/** The tier's implied fundamental runes ({ potency, striking }), or null. */
export const impliedFundamentals = (tier) => {
  const t = DRAGONBREATH_TIERS[String(tier).toLowerCase()];
  return t ? { potency: t.potency, striking: t.striking } : null;
};

/**
 * The resolved `runes` block for a dragonbreath entry: the tier's implied
 * fundamentals plus the entry's own property runes (which carry through). The
 * template's fundamentals always win over any stray potency/striking on the
 * entry — fundamentals are locked to the tier. Feed straight into resolveWeapon.
 */
export const dragonbreathRunes = (entry) => {
  const meta = dragonbreathMeta(entry);
  if (!meta) return null;
  const fund = impliedFundamentals(meta.tier);
  const property = Array.isArray(entry && entry.runes && entry.runes.property) ? entry.runes.property : [];
  return { potency: fund.potency, striking: fund.striking, property };
};

/** Dragon-kind facts for a type string (case-insensitive), or null. */
export const dragonKind = (dragonType) =>
  (dragonType && DRAGON_KINDS[String(dragonType).toLowerCase()]) || null;

/**
 * Display name: [property runes] [tier word] [dragon type] Dragonbreath [base].
 * Base tier omits the tier word; property-rune names prepend in order; the dragon
 * type is capitalized. e.g. "Vitalizing Greater Mirage Dragonbreath Longsword",
 * "Mirage Dragonbreath Longsword" (base tier).
 */
export const dragonbreathName = ({ tier = 'base', dragonType = '', properties = [], base = '' } = {}) => {
  const t = DRAGONBREATH_TIERS[String(tier).toLowerCase()] || DRAGONBREATH_TIERS.base;
  const segments = [];
  segments.push(...(Array.isArray(properties) ? properties.filter(Boolean) : []));
  if (t.tierWord) segments.push(t.tierWord);
  const dt = dragonType ? String(dragonType).trim() : '';
  if (dt) segments.push(dt.charAt(0).toUpperCase() + dt.slice(1));
  segments.push('Dragonbreath');
  if (base) segments.push(base);
  return segments.join(' ');
};

/** Derive the display name from an entry + its base weapon name. */
export const dragonbreathDisplayName = (entry, baseName) => {
  const meta = dragonbreathMeta(entry);
  if (!meta) return baseName || (entry && entry.name) || '';
  const properties = (Array.isArray(entry && entry.runes && entry.runes.property) ? entry.runes.property : [])
    .filter(Boolean)
    .map((p) => p && p.name)
    .filter(Boolean);
  return dragonbreathName({ tier: meta.tier, dragonType: meta.dragonType, properties, base: baseName || '' });
};

/**
 * The Strike damage type a dragonbreath template confers (the weapon's damage
 * type follows the dragon's breath). An explicit `entry.dragonbreath.damageType`
 * wins (the acquisition flow records the wielder's pick); else the kind's damage
 * type when it has exactly one option; else null — a multi-option kind whose
 * choice hasn't been recorded leaves the weapon's native damage type standing.
 */
export const dragonbreathStrikeDamageType = (entry) => {
  const meta = dragonbreathMeta(entry);
  if (!meta) return null;
  const explicit = entry.dragonbreath.damageType ? String(entry.dragonbreath.damageType).toLowerCase() : null;
  if (explicit) return explicit;
  const kind = dragonKind(meta.dragonType);
  return kind && kind.damageTypes.length === 1 ? kind.damageTypes[0] : null;
};

/**
 * The breath activation profile for a dragonbreath entry: dice + DC derived from
 * the tier's implied fundamentals, the cone size by tier, an always-available
 * 5-ft emanation, once-per-minute frequency, and the damage type(s)/save from the
 * dragon kind (empty damageTypes when the kind is unauthored). Null for a
 * non-dragonbreath entry.
 */
export const dragonbreathBreath = (entry) => {
  const meta = dragonbreathMeta(entry);
  if (!meta) return null;
  const t = DRAGONBREATH_TIERS[meta.tier];
  const kind = dragonKind(meta.dragonType);
  return {
    dice: BREATH_DICE[t.striking],
    dc: BREATH_DC[t.potency],
    coneFt: t.coneFt,
    emanationFt: BREATH_EMANATION_FT,
    frequency: BREATH_FREQUENCY,
    damageTypes: kind ? [...kind.damageTypes] : [],
    save: DEFAULT_BREATH_SAVE,
  };
};

/** The tier a base/greater weapon upgrades into, or null at the top (major). */
export const nextDragonbreathTier = (tier) => {
  const i = DRAGONBREATH_TIER_ORDER.indexOf(String(tier).toLowerCase());
  return i >= 0 && i < DRAGONBREATH_TIER_ORDER.length - 1 ? DRAGONBREATH_TIER_ORDER[i + 1] : null;
};

/**
 * Price to upgrade from one tier to another: the DIFFERENCE of the tier prices
 * (the work-order rail charges the delta, per #1210 — base→greater 2,450 gp;
 * greater→major 67,700 gp). Null for a non-upgrade (same/lower tier) or an
 * unknown tier.
 */
export const dragonbreathUpgradePrice = (fromTier, toTier) => {
  const from = DRAGONBREATH_TIERS[String(fromTier).toLowerCase()];
  const to = DRAGONBREATH_TIERS[String(toTier).toLowerCase()];
  if (!from || !to || to.price <= from.price) return null;
  return to.price - from.price;
};

/**
 * The synthetic "rune" that upgrades a dragonbreath weapon to the next tier
 * through the runesmithing work-order rail (#1210 M4d). It is shaped like a
 * fundamental potency rune so it flows through the existing socket-staging,
 * handoff, checkout, and collect pipeline unchanged — `price` is the tier-price
 * delta and `dragonbreathUpgrade` names the target tier. The upgrade bumps BOTH
 * fundamentals at once, so it is offered on the potency socket only. Null at
 * major (top tier) or for a non-dragonbreath entry.
 */
export const dragonbreathUpgradeOption = (entry) => {
  const meta = dragonbreathMeta(entry);
  if (!meta) return null;
  const toTier = nextDragonbreathTier(meta.tier);
  if (!toTier) return null;
  const t = DRAGONBREATH_TIERS[toTier];
  return {
    id: `dragonbreath-upgrade-${toTier}`,
    name: `${t.tierWord} Dragonbreath`,
    type: 'fundamental',
    fundamental: 'potency',
    target: 'weapon',
    price: dragonbreathUpgradePrice(meta.tier, toTier),
    dragonbreathUpgrade: toTier,
  };
};

/**
 * Apply a tier upgrade to a dragonbreath entry: bump `dragonbreath.tier` to
 * `toTier`, preserving the dragon type and any etched property runes. Only a
 * one-step upgrade from the entry's current tier applies; anything else (a skip,
 * a downgrade, a non-template entry) returns null. uid / loadout handling is the
 * caller's (applyRune).
 */
export const applyDragonbreathUpgrade = (entry, toTier) => {
  const meta = dragonbreathMeta(entry);
  if (!meta || nextDragonbreathTier(meta.tier) !== String(toTier).toLowerCase()) return null;
  return { ...entry, dragonbreath: { ...entry.dragonbreath, tier: String(toTier).toLowerCase() } };
};
