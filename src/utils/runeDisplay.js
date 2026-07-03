// Human-readable rendering of a rune doc's structured mechanics (#1055 S1).
// The store's purchase surfaces (ware preview, etch socket picker, runestone
// ItemModal) previously showed only `description` — flavor text for most
// accessory runes — so a buyer never learned the modifiers, riders, or
// activations they were paying for. These pure formatters turn the authored
// data into prose for the shared RuneMechanics renderer.
import { runeTarget } from './runeClassify';

// Display labels for accessory usage tags — the authored ACCESSORY_TAGS plus
// the derived shield/container/light tags (accessoryRunes.js).
const USAGE_LABELS = {
  clothing: 'clothing',
  footwear: 'footwear',
  cape: 'capes',
  cloak: 'cloaks',
  belt: 'belts',
  scarf: 'scarves',
  umbrella: 'umbrellas',
  'dueling-cape': 'dueling capes',
  pocketed: 'pocketed items',
  shield: 'shields',
  container: 'containers',
  light: 'light items (Bulk L or less)',
};

const TARGET_LABELS = { weapon: 'weapons', armor: 'armor', ring: 'a power ring' };

// What inscription means for the host — the rule a buyer must know before
// picking a host item (Grand Bazaar pg. 88).
export const ACCESSORY_RUNE_NOTE =
  'Inscribing makes the item magical and Invested — an item holds at most one '
  + 'accessory rune, and an already-invested item can never take one.';

const STAT_LABELS = { ac: 'AC' };
const statLabel = (stat) =>
  STAT_LABELS[stat] || String(stat).charAt(0).toUpperCase() + String(stat).slice(1);

/**
 * One rune modifier as prose, or null when it carries nothing renderable.
 * Covers the authored vocabulary: skill/AC item bonuses, typed resistances,
 * and the eased persistent-damage flat check (Greater Stanching).
 */
export function runeModifierText(mod) {
  if (!mod || typeof mod !== 'object' || !mod.stat) return null;
  if (mod.stat === 'resistance') {
    const vs = mod.vs ? String(mod.vs).replace(/-/g, ' ') : 'damage';
    if (mod.flatCheckEase) return `Eases the flat check to end ${vs}`;
    if (typeof mod.amount === 'number') return `Resistance ${mod.amount} to ${vs}`;
    return `Resistance to ${vs}`;
  }
  if (typeof mod.amount !== 'number') return null;
  const amount = mod.amount >= 0 ? `+${mod.amount}` : `${mod.amount}`;
  const kind = mod.kind ? `${mod.kind} ` : '';
  return `${amount} ${kind}bonus to ${statLabel(mod.stat)}`;
}

/**
 * What the rune etches onto: an accessory rune lists its usage tags (how a
 * buyer learns Paired needs pocketed items), a targeted rune names its slot.
 */
export function runeUsageText(rune) {
  const target = runeTarget(rune);
  if (target === 'accessory') {
    const tags = (Array.isArray(rune.usage) ? rune.usage : [])
      .map((u) => USAGE_LABELS[String(u)] || String(u).replace(/-/g, ' '));
    return tags.length ? `Etches onto ${tags.join(', ')}` : null;
  }
  return TARGET_LABELS[target] ? `Etches onto ${TARGET_LABELS[target]}` : null;
}
