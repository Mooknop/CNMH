// src/utils/bladeByrnie.js
// Blade Byrnie (#728 E4) — a magic armor that pulls a link into a transient
// +1 striking dagger held in a free hand (returns to the armor after a Strike or
// at end of turn). The dagger isn't real loot: it's a DERIVED weapon, the same
// way Crescent Cross treats chambered shots — built on demand and run through the
// normal strike resolver so it behaves like any other weapon.
//
// The armor is flagged in content with a `bladeByrnie` block; an optional
// `striking: 'greater'` marks a greater Blade Byrnie (greater striking daggers).
// Weapon potency scales off the armor's own potency (#727 resolver): armor +N
// potency -> +N weapon-potency daggers.

import { isHeldState, DEFAULT_ITEM_STATE } from './itemState';
import { resolveItemStrikes } from './strikeUtils';

const isEquipped = (item) =>
  item?.state == null || item.state === DEFAULT_ITEM_STATE || isHeldState(item.state);

/** The equipped armor that can spawn Blade Byrnie daggers, or null. */
export const findBladeByrnie = (inventory = []) =>
  (Array.isArray(inventory) ? inventory : []).find((i) => i && i.bladeByrnie && isEquipped(i)) || null;

/**
 * The transient dagger weapon pulled from a Blade Byrnie. A real weapon shape
 * (runes + strikes) so it resolves through resolveItemStrikes unchanged. Weapon
 * potency mirrors the armor's potency; striking comes from the armor's
 * `bladeByrnie.striking` (default 'striking').
 *
 * @param {Object} armor - the equipped Blade Byrnie item
 * @returns {Object} a derived dagger item
 */
export const deriveBladeDagger = (armor) => {
  const potency = (armor && armor.runes && armor.runes.potency) || 1;
  const striking = (armor && armor.bladeByrnie && armor.bladeByrnie.striking) || 'striking';
  return {
    uid: `blade-dagger-${(armor && armor.uid) || 'byrnie'}`,
    name: 'Dagger',
    // The dagger is in hand once pulled — its Strike is always usable while the
    // overlay is active (the caller only derives it when active).
    noHandRequired: true,
    runes: { potency, striking },
    strikes: [
      {
        type: 'melee',
        actionCount: 1,
        damage: '1d4',
        traits: ['Agile', 'Finesse', 'Thrown 10 ft', 'Versatile S'],
        description: 'A blade pulled from the Blade Byrnie. It returns to the armor after you Strike with it, or at the end of your turn.',
      },
    ],
  };
};

/**
 * The resolved Blade Byrnie dagger strike(s) for a character, or [] when no
 * Blade Byrnie is equipped. Each strike is tagged `bladeByrnie: true` so the
 * encounter UI and the E4b cleanup can recognize the transient weapon.
 *
 * @param {Object} character - resolved character (inventory inlined)
 * @returns {Array} resolved strike objects
 */
export const bladeStrikes = (character) => {
  const armor = findBladeByrnie(character?.inventory);
  if (!armor) return [];
  const dagger = deriveBladeDagger(armor);
  return resolveItemStrikes(dagger, character).map((s) => ({ ...s, bladeByrnie: true }));
};
