// Allied minions (#261) — companion/familiar helpers shared by the owner sheet,
// the GM HP-adjust modal, and the minion strike resolver.
//
// Minions live on the owner character (`character.animalCompanion`,
// `character.familiar`). Their live HP is synced under `cnmh_minions_<ownerId>`
// keyed by the role slug below; a minion's own MAP turn-state is synced under
// `cnmh_turnstate_<ownerId>-<role>` (owner-scoped so two PCs' companions don't
// share a counter).

import { getAbilityModifier, getProficiencyBonus } from './CharacterUtils';

// Stable per-owner role slugs — each PC has at most one of each in the data model.
export const MINION_COMPANION = 'companion';
export const MINION_FAMILIAR = 'familiar';

// Globally-unique id for a minion's turn-state / actor identity.
export const minionTurnId = (ownerId, role) => `${ownerId}-${role}`;

/**
 * The minions a character fields, derived from the (already authored) character
 * data. Absent slots are skipped.
 *
 * @param {Object} characterModel - useCharacter() output (has animalCompanion / familiar)
 * @returns {Array<{ role: string, name: string, maxHp: number, data: Object }>}
 */
export const minionRoster = (characterModel) => {
  const roster = [];
  const companion = characterModel?.animalCompanion;
  if (companion) {
    roster.push({ role: MINION_COMPANION, name: companion.name, maxHp: companion.hp, data: companion });
  }
  const familiar = characterModel?.familiar;
  if (familiar) {
    roster.push({ role: MINION_FAMILIAR, name: familiar.name, maxHp: familiar.hp, data: familiar });
  }
  return roster;
};

// Best-of Str/Dex mod + the strike's proficiency bonus at the owner's level —
// the same math AnimalCompanionModal renders, lifted here for reuse + testing.
export const minionStrikeAttackMod = (strike, companionData, ownerLevel) => {
  const bestAbilityMod = getAbilityModifier(
    Math.max(companionData?.abilities?.dexterity ?? 10, companionData?.abilities?.strength ?? 10)
  );
  return bestAbilityMod + getProficiencyBonus(strike?.proficiency ?? 0, ownerLevel);
};

// Damage string with the companion's Str mod folded into melee strikes (mirrors
// the strikeUtils convention; ranged strikes carry no Str-to-damage).
export const minionStrikeDamage = (strike, companionData) => {
  const base = strike?.damage || '1d4';
  const isMelee = (strike?.type || 'melee') !== 'ranged';
  const strMod = getAbilityModifier(companionData?.abilities?.strength ?? 10);
  if (isMelee && strMod !== 0) return base + (strMod > 0 ? `+${strMod}` : `${strMod}`);
  return base;
};
