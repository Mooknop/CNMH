// Accessory-rune spine (#1033 S1) — pure helpers for the one-per-item accessory
// rune slot (`runes.accessory`), the accessory mirror of armorRunes.js.
//
// PF2e model (Grand Bazaar pg. 88): an accessory rune inscribes onto a mundane,
// non-invested item matching the rune's Usage; the inscription grants the item
// the Invested trait, so one item can only ever hold ONE accessory rune, and an
// item that is already invested magic can never take one. Weapon/armor runes on
// the host do NOT disqualify it (a runed shield is not invested), which is how
// Explorer's Clothing dual-hosts armor runes plus an accessory rune.
//
// The slot is deliberately orthogonal to runeSockets.gearTarget: hosts are
// classified by USAGE TAGS, not by a single weapon/armor/ring target, so a
// cloak (no target at all) and a shield (no target either) are both hosts.
//
// Rune docs are `type: 'property', target: 'accessory'` with a `usage` tag list
// — the same doc shape the #982 generative shop pipeline already filters on.

import { isContainer } from './InventoryUtils';
import { runeTarget } from './runeClassify';

// The authorable host tags (GmRunes usage checkboxes, S4). Derived tags —
// 'shield', 'container', 'light' — are computed from the item's own structure
// and never authored.
export const ACCESSORY_TAGS = [
  'clothing', 'footwear', 'cape', 'cloak', 'belt', 'scarf', 'umbrella',
  'dueling-cape', 'pocketed',
];

// Bulk ceiling for the derived 'light' tag (Called, Unexceptional): light (L)
// bulk is stored as 0.1, negligible as 0. Missing weight = not light — a host
// must be authored with a weight to qualify, never by omission.
const LIGHT_BULK_MAX = 0.1;

const runesOf = (item) =>
  item && item.runes && typeof item.runes === 'object' && !Array.isArray(item.runes)
    ? item.runes
    : null;

/** Whether the item holds an accessory rune (a string ref or an inlined doc). */
export const hasAccessoryRune = (item) => !!runesOf(item)?.accessory;

/**
 * The inlined accessory-rune DOC on an item, or null. A still-string ref (not
 * yet resolved through finishItem's runeMap inlining) has no readable fields,
 * so it reads as "no doc" — hasAccessoryRune still reports the slot as taken.
 */
export const accessoryRuneOf = (item) => {
  const r = runesOf(item)?.accessory;
  return r && typeof r === 'object' ? r : null;
};

/**
 * Every usage tag a host satisfies: its authored `accessoryTags` plus the
 * derived structural tags — 'shield' (carries a shield block), 'container',
 * and 'light' (bulk L or negligible).
 */
export const accessoryUsageTags = (item) => {
  if (!item || typeof item !== 'object') return [];
  const tags = new Set(
    (Array.isArray(item.accessoryTags) ? item.accessoryTags : []).map(String)
  );
  if (item.shield) tags.add('shield');
  if (isContainer(item)) tags.add('container');
  if (typeof item.weight === 'number' && item.weight <= LIGHT_BULK_MAX) tags.add('light');
  return [...tags];
};

// An item whose AUTHORED traits include Invested — pre-existing invested magic,
// which can never take an accessory rune. (The invested trait an inscription
// itself grants is derived via isInvestable, never written into traits, so it
// can't feed back into this gate.)
const hasAuthoredInvestedTrait = (item) =>
  Array.isArray(item?.traits) &&
  item.traits.some((t) => String(t).toLowerCase() === 'invested');

/**
 * Whether `rune` can be inscribed onto `item`: an accessory rune whose usage
 * list intersects the host's tags, onto a host that is neither invested magic
 * nor already inscribed (max one).
 */
export const accessoryEligible = (item, rune) => {
  if (!item || !rune || runeTarget(rune) !== 'accessory') return false;
  if (hasAuthoredInvestedTrait(item)) return false;
  if (hasAccessoryRune(item)) return false;
  const tags = accessoryUsageTags(item);
  return (Array.isArray(rune.usage) ? rune.usage : []).some((u) => tags.includes(String(u)));
};

// Traits an inscription grants, appended to the host's authored traits for
// display (deduped, case-insensitive). Never stamped into the stored entry.
const GRANTED_TRAITS = ['Magical', 'Invested'];

/**
 * Resolve a host + its accessory rune into effective metadata — the accessory
 * mirror of resolveArmorItem. Identity-shaped for an un-inscribed (or
 * unresolved-ref) host. Derived fields are computed at read sites and NEVER
 * written back into the stored inventory entry (re-resolution would compound
 * the name prefix and price).
 */
export const resolveAccessoryItem = (item) => {
  const rune = accessoryRuneOf(item);
  const authoredTraits = Array.isArray(item?.traits) ? item.traits : [];
  if (!rune) {
    return {
      name: item?.name,
      price: item?.price || 0,
      modifiers: [],
      riders: [],
      actions: [],
      actuated: null,
      traits: authoredTraits,
      rune: null,
    };
  }
  const lower = new Set(authoredTraits.map((t) => String(t).toLowerCase()));
  return {
    name: rune.name && item?.name ? `${rune.name} ${item.name}` : item?.name,
    price: (item?.price || 0) + (rune.price || 0),
    modifiers: Array.isArray(rune.modifiers) ? rune.modifiers : [],
    riders: Array.isArray(rune.riders) ? rune.riders : [],
    actions: Array.isArray(rune.actions) ? rune.actions : [],
    actuated: rune.actuated || null,
    traits: [...authoredTraits, ...GRANTED_TRAITS.filter((t) => !lower.has(t.toLowerCase()))],
    rune,
  };
};

/**
 * Effective display name for an inscribed host: the rune name prefixed onto
 * `innerName` — which defaults to the item's own name, but callers that
 * already derive a runed name (armorDisplayName for a dual-host Explorer's
 * Clothing) pass that in so the accessory prefix wraps the full derived name.
 */
export const accessoryDisplayName = (item, innerName = item?.name) => {
  const rune = accessoryRuneOf(item);
  return rune?.name && innerName ? `${rune.name} ${innerName}` : innerName;
};
