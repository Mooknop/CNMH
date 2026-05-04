// src/utils/strikeUtils.js
// Utilities for computing and categorizing character strikes.

import { getAbilityModifier, getAttackBonus } from './CharacterUtils';
import { convertWordToNumber } from './actionIconUtils';

/**
 * Compute the ability modifier, proficiency value, attack bonus, and damage string
 * for a single strike given a character's stats. Extracted to eliminate the duplicated
 * block that previously appeared for character strikes, feat strikes, and inventory strikes.
 *
 * @param {Object} strike    - Strike data (type, traits, proficiency, damage, …)
 * @param {Object} character - Character data
 * @param {string} [defaultDamage='1d6'] - Fallback damage string when strike.damage is absent
 * @returns {{ strMod, attackBonus, damageString }}
 */
const resolveStrikeMods = (strike, character, defaultDamage = '1d6') => {
  const isMelee = strike.type === 'melee';
  const isFinesse = strike.traits?.includes('Finesse');
  const isThrown = strike.traits?.includes('Thrown');
  const isKineticist = strike.traits?.includes('Kineticist');

  const strMod = getAbilityModifier(character.abilities?.strength || 10);
  const dexMod = getAbilityModifier(character.abilities?.dexterity || 10);
  const conMod = getAbilityModifier(character.abilities?.constitution || 10);

  let abilityMod;
  if (isKineticist) {
    abilityMod = conMod;
  } else if (isFinesse) {
    abilityMod = Math.max(strMod, dexMod);
  } else if (isMelee) {
    abilityMod = strMod;
  } else {
    abilityMod = dexMod;
  }

  let proficiencyValue = 0;
  if (strike.proficiency && character.proficiencies?.weapons?.[strike.proficiency]) {
    proficiencyValue = character.proficiencies.weapons[strike.proficiency].proficiency || 0;
  } else if (strike.traits?.includes('Unarmed')) {
    proficiencyValue = character.proficiencies?.weapons?.unarmed?.proficiency || 0;
  } else {
    proficiencyValue = character.proficiencies?.weapons?.simple?.proficiency || 0;
  }

  const attackBonus = getAttackBonus(abilityMod, proficiencyValue, character.level || 0);

  let damageString = strike.damage || defaultDamage;
  if ((isMelee || isThrown) && strMod !== 0 && !damageString.includes('+') && !damageString.includes('-')) {
    damageString += strMod > 0 ? '+' + strMod : strMod;
  }

  return { strMod, attackBonus, damageString };
};

/**
 * Get all strikes for the character, combining character-defined strikes,
 * feat strikes, and inventory weapon strikes.
 * @param {Object} character - Character data
 * @returns {Array} - Array of strike objects with computed attack modifiers
 */
export const getStrikes = (character) => {
  let allStrikes = [];

  // Character-defined strikes
  if (character.strikes && Array.isArray(character.strikes) && character.strikes.length > 0) {
    const processedStrikes = character.strikes.map(strike => {
      const { attackBonus, damageString } = resolveStrikeMods(strike, character, '??');
      return { ...strike, attackMod: attackBonus, damage: damageString };
    });
    allStrikes = [...processedStrikes];
  }

  // Feat strikes
  if (character.feats) {
    const featStrikes = character.feats
      .filter(feat => feat.strikes && Array.isArray(feat.strikes) && feat.strikes.length > 0)
      .flatMap(feat =>
        feat.strikes.map(strike => {
          const { attackBonus, damageString } = resolveStrikeMods(strike, character);

          // Variable action count parsing (e.g. "One to Two Actions")
          let variableActionCount = null;
          if (strike.actionCount && typeof strike.actionCount === 'string') {
            const actionText = strike.actionCount.toLowerCase();
            if (actionText.includes('to')) {
              const rangeMatch = actionText.match(/(\w+)\s+to\s+(\w+)/i);
              if (rangeMatch) {
                const min = convertWordToNumber(rangeMatch[1]);
                const max = convertWordToNumber(rangeMatch[2]);
                if (min > 0 && max > 0) variableActionCount = { min, max };
              }
            }
          } else if (strike.name?.includes('Metal Blast')) {
            if (typeof strike.action === 'string' && strike.action.toLowerCase().includes('to')) {
              const rangeMatch = strike.action.toLowerCase().match(/(\w+)\s+to\s+(\w+)/i);
              if (rangeMatch) {
                const min = convertWordToNumber(rangeMatch[1]);
                const max = convertWordToNumber(rangeMatch[2]);
                if (min > 0 && max > 0) variableActionCount = { min, max };
              }
            } else {
              variableActionCount = { min: 1, max: 2 };
            }
          }

          return {
            name: strike.name,
            type: strike.type || 'melee',
            actionCount: parseInt(strike.actionCount || strike.action) || 1,
            variableActionCount,
            actions: strike.action && typeof strike.action === 'string' ? strike.action : null,
            traits: strike.traits || [],
            attackMod: attackBonus,
            damage: damageString,
            description: strike.description || '',
            source: feat.name,
            range: strike.range,
          };
        })
      );
    allStrikes = [...allStrikes, ...featStrikes];
  }

  // Inventory weapon strikes
  if (character.inventory) {
    const weaponStrikes = character.inventory
      .filter(item => item.strikes)
      .flatMap(item => {
        const strikesArray = Array.isArray(item.strikes) ? item.strikes : [item.strikes];
        return strikesArray.map(weaponStrike => {
          const { attackBonus: baseBonus, damageString } = resolveStrikeMods(weaponStrike, character);

          // Apply potency rune bonus if present
          let attackBonus = baseBonus;
          if (item.potency) {
            if (attackBonus.startsWith('+')) {
              attackBonus = `+${parseInt(attackBonus.substring(1)) + item.potency}`;
            } else {
              attackBonus = `${attackBonus}+${item.potency}`;
            }
          }

          const strikeName = weaponStrike.name ||
            (weaponStrike.type === 'melee' ? `${item.name} Melee Strike` : `${item.name} Ranged Strike`);

          return {
            name: strikeName,
            type: weaponStrike.type || 'melee',
            actionCount: parseInt(weaponStrike.actionCount || weaponStrike.action) || 1,
            traits: weaponStrike.traits || [],
            attackMod: attackBonus,
            damage: damageString,
            description: weaponStrike.description || item.description || '',
            source: item.name,
            range: weaponStrike.range,
          };
        });
      });
    allStrikes = [...allStrikes, ...weaponStrikes];
  }

  // Fallback: unarmed strike
  if (allStrikes.length === 0) {
    const unarmedProficiency = character.proficiencies?.weapons?.unarmed?.proficiency || 0;
    const strMod = getAbilityModifier(character.abilities?.strength || 10);
    const attackBonus = getAttackBonus(strMod, unarmedProficiency, character.level || 0);

    allStrikes.push({
      name: 'Unarmed Strike',
      type: 'melee',
      actionCount: 1,
      traits: ['Attack', 'Melee', 'Unarmed'],
      attackMod: attackBonus,
      damage: `1d4${strMod !== 0 ? (strMod > 0 ? '+' + strMod : strMod) : ''}`,
      description: 'A strike with your fist or another body part.',
    });
  }

  // Post-process: normalise Metal Blast variable actions, fill in missing type
  return allStrikes
    .map(strike => {
      if (strike.name?.includes('Metal Blast')) {
        return { ...strike, actions: 'One to Two Actions', variableActionCount: { min: 1, max: 2 } };
      }
      return strike;
    })
    .map(strike => ({
      ...strike,
      type: strike.type || (strike.traits?.includes('Ranged') ? 'ranged' : 'melee'),
    }));
};

/**
 * Categorize strikes by type (melee/ranged)
 * @param {Array} strikes - Array of strike objects
 * @returns {{ melee: Array, ranged: Array }}
 */
export const categorizeStrikesByType = (strikes) => ({
  melee: strikes.filter(s => s.type === 'melee'),
  ranged: strikes.filter(s => s.type === 'ranged'),
});
