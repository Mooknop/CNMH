// Spellgun spine (Magic+ arsenal M1, epic #1206 / #1207). Pure helpers — no
// React/Foundry — for the one-shot spell-attack devices (Howl of Winter,
// Verdant Bola). A spellgun is a Consumable that Activates as a 2-action attack:
// the wielder CHOOSES a spell attack roll or a firearm attack roll, resolved
// against the target's AC (Howl) or Reflex DC (Verdant Bola), then the device
// melts. This module owns the shared derivations the attack/consume modal reads:
//   - the two attack-roll options (spell vs firearm) and their bonuses,
//   - the per-variant damage dice + Speed-penalty duration,
//   - the degree-of-success outcome (damage multiplier, Speed penalty,
//     grabbed/restrained condition),
//   - the range increment.
//
// Data shape (item.json): a `spellgun` block beside the item, plus `variants`
// for graded spellguns (Howl lesser/moderate/greater/major):
//   item.spellgun = {
//     rangeIncrement: 30,        // feet — feeds #527 range machinery
//     against: 'ac' | 'reflex-dc',
//     damageType?: 'cold',       // omitted for control spellguns (Bola)
//     actionCount: 2,            // Interact + Strike
//     attackChoice: true,        // spell-attack vs firearm-attack is the wielder's pick
//   }

import { getAbilityModifier, getAttackBonusValue } from './CharacterUtils';
import { calculateSpellStats } from './SpellUtils';

/** Whether an item is a spellgun (carries the block or the Spellgun trait). */
export const isSpellgun = (item) =>
  !!item && (!!item.spellgun || (item.traits || []).some((t) => String(t).toLowerCase() === 'spellgun'));

/**
 * The item's `spellgun` block, or null when it isn't a spellgun. Normalises the
 * defence key so callers can trust `against` ∈ {'ac','reflex-dc'}.
 */
export const spellgunMeta = (item) => {
  const meta = item?.spellgun;
  if (!meta || typeof meta !== 'object') return null;
  return { against: 'ac', actionCount: 2, ...meta };
};

/** The defence a spellgun's attack roll is compared to: 'ac' | 'reflex'. */
export const spellgunDefense = (item) =>
  spellgunMeta(item)?.against === 'reflex-dc' ? 'reflex' : 'ac';

/** The spellgun's range increment in feet, or null. */
export const spellgunRangeIncrementFt = (item) => {
  const ft = spellgunMeta(item)?.rangeIncrement;
  return typeof ft === 'number' && ft > 0 ? ft : null;
};

/**
 * A spellgun's graded variants (Howl of Winter), sorted by level ascending.
 * Flat spellguns (Verdant Bola) return an empty array.
 */
export const spellgunVariants = (item) =>
  Array.isArray(item?.variants)
    ? [...item.variants].sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
    : [];

/**
 * The two attack-roll options the wielder chooses between per activation
 * (RAW: "your choice of a spell attack roll or a firearm attack roll").
 *
 * - spell:   the character's spell attack modifier (SpellUtils). Non-casters
 *            score low here and simply pick the firearm option instead.
 * - firearm: Dex + the best weapon proficiency the character has (martial,
 *            else simple) — how a firearm attacks for most PCs.
 *
 * @param {Object} character
 * @returns {Array<{ id:'spell'|'firearm', label:string, bonus:number }>}
 */
export const spellgunAttackOptions = (character) => {
  if (!character) return [];
  const { spellAttackMod } = calculateSpellStats(character);

  const dexMod = getAbilityModifier(character.abilities?.dexterity || 10);
  const weapons = character.proficiencies?.weapons || {};
  const firearmProf =
    weapons.martial?.proficiency || weapons.simple?.proficiency || 0;
  const firearmBonus = getAttackBonusValue(dexMod, firearmProf, character.level || 0);

  return [
    { id: 'spell', label: 'Spell attack', bonus: spellAttackMod },
    { id: 'firearm', label: 'Firearm attack', bonus: firearmBonus },
  ];
};

/**
 * Resolve a spellgun's degree-of-success outcome.
 *
 * Damage spellguns (Howl, against AC):
 *   critical success → double damage, −10 ft Speed
 *   success          → full damage,   −5 ft Speed
 *   failure/crit fail → miss
 * Control spellguns (Verdant Bola, against Reflex DC):
 *   critical success → restrained
 *   success          → grabbed
 *   failure/crit fail → miss
 *
 * @param {string} against  - 'ac' | 'reflex-dc'
 * @param {string} degree   - 'criticalSuccess'|'success'|'failure'|'criticalFailure'
 * @returns {{ hit:boolean, crit:boolean, damageMultiplier:number,
 *             speedPenalty:number, condition:string|null }}
 */
export const spellgunOutcome = (against, degree) => {
  const crit = degree === 'criticalSuccess';
  const hit = crit || degree === 'success';
  const control = against === 'reflex-dc';

  if (!hit) {
    return { hit: false, crit: false, damageMultiplier: 0, speedPenalty: 0, condition: null };
  }
  if (control) {
    return {
      hit: true,
      crit,
      damageMultiplier: 0,
      speedPenalty: 0,
      condition: crit ? 'restrained' : 'grabbed',
    };
  }
  return {
    hit: true,
    crit,
    damageMultiplier: crit ? 2 : 1,
    speedPenalty: crit ? 10 : 5,
    condition: null,
  };
};
