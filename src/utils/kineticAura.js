// Kinetic aura predicates (#228). Channel Elements activates a kineticist's
// aura; impulses require it; overflow impulses deactivate it on use.
//
// Trait-driven so existing content works untagged: an ability with both the
// Aura and Kineticist traits activates the aura, the Impulse trait requires
// it, and the Overflow trait burns it out. Explicit boolean tags
// (activatesAura / requiresAura / overflow) take precedence so content can
// opt in or out without engine changes.

import { parseSpellArea } from './spellArea';

const hasTrait = (ability, name) => {
  const traits = Array.isArray(ability?.traits) ? ability.traits : [];
  const lower = String(name).toLowerCase();
  return traits.some((t) => String(t).toLowerCase() === lower);
};

export const activatesAura = (ability) => {
  if (!ability) return false;
  if (ability.activatesAura !== undefined) return ability.activatesAura === true;
  return hasTrait(ability, 'aura') && hasTrait(ability, 'kineticist');
};

export const requiresAura = (ability) => {
  if (!ability) return false;
  if (ability.requiresAura !== undefined) return ability.requiresAura === true;
  return hasTrait(ability, 'impulse');
};

export const isOverflow = (ability) => {
  if (!ability) return false;
  if (ability.overflow !== undefined) return ability.overflow === true;
  return hasTrait(ability, 'overflow');
};

// Whether the character has any aura-activating ability — gates the aura
// badge so non-kineticists never render aura UI.
export const characterHasKineticAura = (character) =>
  (character?.feats || []).some(
    (f) =>
      (f?.actions || []).some(activatesAura) ||
      (f?.strikes || []).some(activatesAura)
  ) || (character?.actions || []).some(activatesAura);

// The character's aura-activating ability (Channel Elements or equivalent),
// same iteration shape `characterHasKineticAura` uses — feats' actions and
// strikes, then top-level actions.
const findAuraAbility = (character) => {
  for (const f of character?.feats || []) {
    const found = (f?.actions || []).find(activatesAura) || (f?.strikes || []).find(activatesAura);
    if (found) return found;
  }
  return (character?.actions || []).find(activatesAura) || null;
};

/**
 * The aura's authored radius (#1733 ruling 2 — no fallback radius): reads
 * `ability.areaShape` via `parseSpellArea` (`utils/spellArea.js`), the same
 * authoring override a spell's area uses. An aura with no `activatesAura`
 * ability, or one whose ability carries no machine-readable
 * `areaShape: { shape: 'emanation', feet }`, resolves to null — callers must
 * treat null as "never send `auraset`", not as an invitation to guess a size.
 *
 * @param {Object} character
 * @returns {{feet:number, label:string}|null}
 */
export function auraProfile(character) {
  const ability = findAuraAbility(character);
  if (!ability) return null;
  const area = parseSpellArea(ability);
  if (!area || area.shape !== 'emanation' || !(Number(area.feet) > 0)) return null;
  return { feet: Number(area.feet), label: ability.name || 'Aura' };
}
