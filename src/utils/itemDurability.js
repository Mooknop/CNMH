// Item durability (#539 / #540 / #541) — pure rules, React-free.
//
// PF2e items have Hardness, Hit Points, and a Broken Threshold (BT). Each
// instance of damage an item takes is reduced by its Hardness; the remainder
// comes off its HP. At HP ≤ BT the item is Broken ("can't be used for its
// normal function, nor does it grant bonuses — with the exception of armor");
// at 0 HP it is Destroyed and can't be Repaired. (Player Core "Item Damage",
// GM Core p. 252 "Material Statistics".)
//
// Where the numbers come from, in priority order (durabilityFor):
//   1. an authored `durability: { hardness, hp, brokenThreshold }` block
//   2. a shield's authored stat block (reinforcing-rune adjusted, #1165)
//   3. the material table — via the item's `material` field, else the armor
//      group, else the weapon heuristic (metal unless obviously wooden:
//      "Metal weapons and armor are assumed to be made of iron or steel
//      unless noted otherwise.")
//
// Weapons use a material's THIN-item row (the table lists "sword" under thin
// steel and "club" under thin wood); armor uses the ordinary-items row ("iron
// or steel armor", "Armor, saddle" under leather, "Armor, jacket" under cloth).
import { normalizeShield } from './InventoryUtils';
import { resolveShieldBlock } from './shieldRunes';

// GM Core p. 252, Material Statistics (ORC) — the gear-relevant rows.
// thin = thin items (blades, hafts, chains); items = ordinary items (armor).
export const MATERIAL_STATS = Object.freeze({
  cloth:   { items: { hardness: 1, hp: 4,  brokenThreshold: 2 } },
  leather: { thin:  { hardness: 2, hp: 8,  brokenThreshold: 4 },
             items: { hardness: 4, hp: 16, brokenThreshold: 8 } },
  wood:    { thin:  { hardness: 3, hp: 12, brokenThreshold: 6 },
             items: { hardness: 5, hp: 20, brokenThreshold: 10 } },
  steel:   { thin:  { hardness: 5, hp: 20, brokenThreshold: 10 },
             items: { hardness: 9, hp: 36, brokenThreshold: 18 } },
});

// Material-name → table key. Iron shares the steel row outright; low-grade
// cold iron and silver "have the same statistics as" their base metal, which
// is what the party's gear is. True precious-material grades (adamantine,
// orichalcum…) should author an explicit durability block instead.
const MATERIAL_ALIASES = Object.freeze({
  iron: 'steel',
  'cold iron': 'steel',
  silver: 'steel',
  steel: 'steel',
  wood: 'wood',
  darkwood: 'wood',
  leather: 'leather',
  cloth: 'cloth',
});

// Armor group → material (seed groups: cloth, leather, chain, plate, composite).
const ARMOR_GROUP_MATERIAL = Object.freeze({
  cloth: 'cloth',
  leather: 'leather',
  chain: 'steel',
  plate: 'steel',
  composite: 'steel',
});

// Armor category fallback when no group is authored.
const ARMOR_CATEGORY_MATERIAL = Object.freeze({
  unarmored: 'cloth',
  light: 'leather',
  medium: 'steel',
  heavy: 'steel',
});

// Obviously-wooden weapons (bows, clubs, staves); everything else metal.
const WOODEN_WEAPON_RE = /\b(bow|club|staff|stave|shillelagh)\b|crossbow|longbow|shortbow/i;

const materialKey = (name) =>
  typeof name === 'string' ? MATERIAL_ALIASES[name.trim().toLowerCase()] : undefined;

const hasStrikes = (item) =>
  !!item.strikes && (Array.isArray(item.strikes) ? item.strikes.length > 0 : true);

const isConsumableGear = (item) =>
  !!item.consumable ||
  !!item.ammunition ||
  (Array.isArray(item.traits) && item.traits.some((t) => String(t).toLowerCase() === 'consumable'));

/** Broken: HP at or below the broken threshold. */
export const isBrokenHp = (hp, brokenThreshold) =>
  Number.isFinite(hp) && Number.isFinite(brokenThreshold) && hp <= brokenThreshold;

/** Destroyed: HP reduced to 0 (a destroyed item can't be Repaired). */
export const isDestroyedHp = (hp) => Number.isFinite(hp) && hp <= 0;

/**
 * The durability stats an item is authored/derived to have (its FULL values —
 * `hp` here is max HP; live HP lives in the cnmh_itemhp_ overlay).
 *
 * Returns { hardness, hp, brokenThreshold } or null for items that don't
 * track durability (consumables, potions, plain gear without a strikes /
 * armor / shield block and no authored durability).
 *
 * @param {Object|null|undefined} item - resolved catalog item / inventory entry
 * @returns {{ hardness:number, hp:number, brokenThreshold:number }|null}
 */
export const durabilityFor = (item) => {
  if (!item || typeof item !== 'object') return null;

  // 1. Authored block wins everywhere. BT defaults to half max HP (PF2e).
  if (item.durability && typeof item.durability === 'object') {
    const { hardness = 0, hp, brokenThreshold } = item.durability;
    if (!Number.isFinite(hp) || hp <= 0) return null;
    return {
      hardness,
      hp,
      brokenThreshold: Number.isFinite(brokenThreshold) ? brokenThreshold : Math.floor(hp / 2),
    };
  }

  // 2. Artifacts can't be damaged by normal means (PF2e) — untracked unless
  //    an authored durability block above explicitly opts one in.
  if (item.artifact) return null;

  // 3. Shields author their own stat block; fold the reinforcing rune in the
  //    same way useShield does so both surfaces agree (#1165 S1).
  if (item.shield && typeof item.shield === 'object') {
    const s = normalizeShield(resolveShieldBlock(item));
    if (!s || !Number.isFinite(s.hp)) return null;
    return {
      hardness: s.hardness ?? 0,
      hp: s.hp,
      brokenThreshold: Number.isFinite(s.brokenThreshold) ? s.brokenThreshold : Math.floor(s.hp / 2),
    };
  }

  // 4. Armor: material field, else group, else category.
  if (item.armor && typeof item.armor === 'object') {
    const key =
      materialKey(item.material) ||
      ARMOR_GROUP_MATERIAL[String(item.armor.group || '').toLowerCase()] ||
      ARMOR_CATEGORY_MATERIAL[String(item.armor.category || '').toLowerCase()] ||
      'steel';
    const row = MATERIAL_STATS[key];
    return { ...(row.items || row.thin) };
  }

  // 5. Weapons: thin-item row of their material. Thrown alchemical gear
  //    (bombs, holy water) is consumable — used up, not tracked.
  if (hasStrikes(item) && !isConsumableGear(item)) {
    const key =
      materialKey(item.material) ||
      (WOODEN_WEAPON_RE.test(`${item.id || ''} ${item.name || ''}`) ? 'wood' : 'steel');
    const row = MATERIAL_STATS[key];
    return { ...(row.thin || row.items) };
  }

  return null;
};

/** Whether the durability engine tracks this item at all. */
export const isDurableItem = (item) => durabilityFor(item) !== null;

/**
 * Full durability status for an inventory entry given its cnmh_itemhp_ overlay
 * record ({ hp } or undefined ⇒ authored max). React-free twin of
 * useItemHp.statusFor so strike/AC derivations can run outside hooks.
 *
 * @param {Object} item - resolved catalog item / inventory entry
 * @param {Object} [overlayRecord] - the overlay's { hp } record for this uid
 * @returns {{ hp, maxHp, hardness, brokenThreshold, broken, destroyed }|null}
 */
export const entryHpStatus = (item, overlayRecord) => {
  const dur = durabilityFor(item);
  if (!dur) return null;
  const hp = overlayRecord?.hp ?? dur.hp;
  return {
    hp,
    maxHp: dur.hp,
    hardness: dur.hardness,
    brokenThreshold: dur.brokenThreshold,
    broken: isBrokenHp(hp, dur.brokenThreshold),
    destroyed: isDestroyedHp(hp),
  };
};

/**
 * Apply one instance of damage to an item: Hardness prevents its own value,
 * the remainder comes off HP (floored at 0). `hardnessBonus` raises effective
 * Hardness for this hit only (e.g. a deflecting shield vs ranged, #1196 G1);
 * negative bonuses are clamped so a bonus never lowers Hardness.
 *
 * @param {object} opts
 * @param {number} opts.dealt           - incoming damage before Hardness
 * @param {number} opts.hardness        - the item's Hardness
 * @param {number} opts.hp              - the item's current HP
 * @param {number} opts.brokenThreshold - HP at or below which it breaks
 * @param {number} [opts.hardnessBonus] - extra Hardness for this hit only
 * @returns {{ prevented:number, taken:number, hpAfter:number, broken:boolean, destroyed:boolean }}
 */
export function applyItemDamage({ dealt, hardness, hp, brokenThreshold, hardnessBonus = 0 }) {
  const effectiveHardness = (hardness || 0) + Math.max(0, hardnessBonus || 0);
  const prevented = Math.min(dealt, effectiveHardness);
  const taken = dealt - prevented;
  const hpAfter = Math.max(0, (hp || 0) - taken);
  return {
    prevented,
    taken,
    hpAfter,
    broken: isBrokenHp(hpAfter, brokenThreshold ?? 0),
    destroyed: isDestroyedHp(hpAfter),
  };
}

/**
 * Restore HP toward the item's max (Repair, Rust Scrub, …). Clamped so repair
 * never exceeds max; a non-positive amount is a no-op. A destroyed item
 * (0 HP) can't be Repaired — callers gate on isDestroyedHp before offering
 * repair; this function stays a pure clamp.
 *
 * @param {object} opts
 * @param {number} opts.hp     - current HP
 * @param {number} opts.maxHp  - authored max HP
 * @param {number} opts.amount - HP to restore
 * @returns {number} the new HP
 */
export function restoreItemHp({ hp, maxHp, amount }) {
  const cur = Math.max(0, hp || 0);
  if (!(amount > 0)) return cur;
  return Math.min(Math.max(cur, maxHp || 0), cur + amount);
}
