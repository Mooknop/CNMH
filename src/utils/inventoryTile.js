// src/utils/inventoryTile.js
// Presentation helpers for the inventory "Loadout Grid" IconTile: a short
// monospace placeholder code, a material tint family, charge/glow detection,
// and a rarity class. All derive from the *resolved* effective item (the shape
// useCharacter produces), classifying by field presence since items carry no
// explicit `type`/`category`.
import { isContainer, isItemMagical, isConsumable, getItemRarity } from './InventoryUtils';

/**
 * Whether the item is a weapon (carries Strike data). Mirrors ItemModal's
 * `item.strikes` check; tolerates both the array and single-object shapes.
 */
const isWeapon = (item) => !!(item && item.strikes);

/**
 * Material tint family for the tile face + code colour. First match wins, so the
 * order encodes precedence: containers and weapons read as themselves even when
 * also magical; magical-but-mundane gear lands on arcane; everything else iron.
 * @returns {'ember'|'iron'|'verdant'|'arcane'|'gold'|'neutral'}
 */
export const itemTint = (item) => {
  if (!item) return 'neutral';
  if (isContainer(item)) return 'gold';
  if (isWeapon(item)) return 'ember';
  if (item.shield) return 'iron';
  if (isConsumable(item)) return 'verdant';
  if (isItemMagical(item) || item.wand || item.staff) return 'arcane';
  return 'iron';
};

/**
 * Charge/resource state for the charge pips, or null when the item has no
 * tracked resource. Staves carry an explicit `{ current, max }`; wands and
 * scrolls model a single daily/one-shot use.
 * @returns {{ current: number, max: number }|null}
 */
export const itemCharges = (item) => {
  if (!item) return null;
  const staffCharges = item.staff && item.staff.charges;
  if (staffCharges && typeof staffCharges.max === 'number') {
    return {
      current: staffCharges.current ?? staffCharges.max,
      max: staffCharges.max,
    };
  }
  if (item.charges && typeof item.charges.max === 'number') {
    return { current: item.charges.current ?? item.charges.max, max: item.charges.max };
  }
  if (item.wand) return { current: 1, max: 1 };
  return null;
};

/**
 * Whether the tile should glow (a charged / daily-resource item). Honors an
 * explicit `item.glow` flag for authored set-pieces (e.g. everburning torch).
 */
export const isGlowy = (item) => !!item && (!!item.glow || itemCharges(item) !== null);

/**
 * Rarity CSS class suffix for the tile ring ('uncommon' | 'rare' | 'unique' |
 * 'common'). Common (no rarity trait) gets no ring.
 */
export const itemRarity = (item) => {
  const r = getItemRarity(item);
  return r ? String(r).toLowerCase() : 'common';
};

/**
 * Derive a short uppercase placeholder code from an item name (the fallback when
 * there's no `item.image`). One word → first 4 letters; two words → 2+2; three
 * or more → initials of the first four words. Parentheticals and one-letter
 * noise words (a stray possessive "s", a "(50 ft.)" unit) are dropped first, so
 * "Rope (50 ft.)" → "ROPE", "Light Hammer" → "LIHA", "Lesser Healing Potion" →
 * "LHP", "Healer's Toolkit" → "HETO".
 * @param {string} name
 * @returns {string}
 */
export const itemCode = (name) => {
  const cleaned = String(name || '').replace(/\([^)]*\)/g, ' ');
  const all = cleaned.match(/[A-Za-z]+/g) || [];
  // Prefer meaningful words; fall back to the raw list if everything was short.
  const words = all.filter((w) => w.length > 1).length ? all.filter((w) => w.length > 1) : all;
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  if (words.length === 2) {
    return (words[0].slice(0, 2) + words[1].slice(0, 2)).toUpperCase();
  }
  return words.slice(0, 4).map((w) => w[0]).join('').toUpperCase();
};
