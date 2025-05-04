// src/utils/characterUtils.js
// Utility functions for character calculations in Pathfinder 2E

/**
 * Character color palette - used for consistent color coding across components
 */
export const CHARACTER_COLORS = [
  '#7E8C9A', // slate
  '#64b5f6', // blue
  '#81c784', // green
  '#ba68c8', // purple
  '#E67E22',  // bright rust
  '#C33764'  //Nebula Pink
];

/**
 * Get color for character based on its array index
 * @param {number} index - Index of character in the array
 * @returns {string} - Color hex code
 */
export const getCharacterColor = (index) => {
  return CHARACTER_COLORS[index % CHARACTER_COLORS.length];
};

/**
 * Calculate ability modifier from ability score
 * @param {number} abilityScore - The ability score value (usually 1-30)
 * @returns {number} - The calculated modifier
 */
export const getAbilityModifier = (abilityScore) => {
  const score = abilityScore || 10; // Default to 10 if undefined
  return Math.floor((score - 10) / 2);
};

/**
 * Get the formatted string representation of a modifier (adding + for positive values)
 * @param {number} modifier - The numerical modifier
 * @returns {string} - Formatted modifier with + or - sign
 */
export const formatModifier = (modifier) => {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
};

/**
 * Get the proficiency label from the proficiency value
 * @param {number} proficiency - Proficiency value (0-4)
 * @returns {string} - Corresponding label
 */
export const getProficiencyLabel = (proficiency) => {
  switch(proficiency) {
    case 1: return 'Trained';
    case 2: return 'Expert';
    case 3: return 'Master';
    case 4: return 'Legendary';
    default: return 'Untrained';
  }
};

/**
 * Check if a character has a specific feat by name
 * @param {Object} character - The character object
 * @param {string} featName - Name of the feat to check for
 * @returns {boolean} - True if character has the feat
 */
export const hasFeat = (character, featName) => {
  if (!character || !character.feats || !Array.isArray(character.feats)) {
    return false;
  }
  
  return character.feats.some(feat => 
    feat.name.toLowerCase() === featName.toLowerCase()
  );
};

/**
 * Get proficiency bonus based on proficiency rank and level
 * @param {number} proficiencyRank - Proficiency rank (0-4)
 * @param {number} level - Character level
 * @param {Object} character - The character object (optional, for feats)
 * @returns {number} - Calculated proficiency bonus
 */
export const getProficiencyBonus = (proficiencyRank, level, character = null) => {
  if (proficiencyRank <= 0) {
    // Check for Untrained Improvisation feat
    if (character && hasFeat(character, "Untrained Improvisation")) {
      const characterLevel = character.level || level || 0;
      // Level 7+ gets full level, otherwise half level
      if (characterLevel >= 7) {
        return characterLevel;
      }
      return Math.floor(characterLevel / 2);
    }
    return 0;
  }
  
  // In PF2E: Trained (+2), Expert (+4), Master (+6), Legendary (+8) plus level
  return (proficiencyRank * 2) + (level || 0);
};

/**
 * Map of skills to their corresponding ability scores
 */
export const SKILL_ABILITY_MAP = {
  acrobatics: 'dexterity',
  arcana: 'intelligence',
  athletics: 'strength',
  crafting: 'intelligence',
  deception: 'charisma',
  diplomacy: 'charisma',
  intimidation: 'charisma',
  medicine: 'wisdom',
  nature: 'wisdom',
  occultism: 'intelligence',
  performance: 'charisma',
  religion: 'wisdom',
  society: 'intelligence',
  stealth: 'dexterity',
  survival: 'wisdom',
  thievery: 'dexterity'
};

/**
 * Get item bonus for a specific skill from character's inventory
 * @param {Object} character - The character object
 * @param {string} skillId - The skill identifier
 * @returns {number} - The item bonus value (0 if none)
 */
export const getItemBonus = (character, skillId) => {
  if (!character || !character.inventory) return 0;
  
  // Look for items with the 'bonus' property that applies to this skill
  const itemsWithBonus = character.inventory.filter(item => {
    if (!item.bonus || !Array.isArray(item.bonus) || item.bonus.length < 2) return false;
    
    // Skip items that aren't invested if they require investing
    if (item.invested === true && item.invested !== undefined) {
      return item.bonus[0] === skillId;
    }
    
    return item.bonus[0] === skillId;
  });
  
  // Return the highest bonus value
  if (itemsWithBonus.length === 0) return 0;
  
  return Math.max(...itemsWithBonus.map(item => item.bonus[1] || 0));
};

/**
 * Calculate skill modifier using ability score, proficiency, and item bonuses
 * @param {Object} character - The character object
 * @param {string} skillId - The skill identifier
 * @returns {number} - The calculated skill modifier
 */
export const getSkillModifier = (character, skillId) => {
  if (!character) return 0;
  
  // Get the associated ability for this skill
  const abilityKey = SKILL_ABILITY_MAP[skillId] || 'dexterity';
  
  // Get the ability modifier
  const abilities = character.abilities || {};
  const abilityScore = abilities[abilityKey] || 10;
  const abilityMod = getAbilityModifier(abilityScore);
  
  // Get the proficiency value and calculate bonus
  const skills = character.skills || {};
  const skillData = skills[skillId] || { proficiency: 0 };
  const profBonus = getProficiencyBonus(skillData.proficiency || 0, character.level || 0, character);
  
  // Get any item bonus for this skill
  const itemBonus = getItemBonus(character, skillId);
  
  // Return the sum of ability modifier, proficiency bonus, and item bonus
  return abilityMod + profBonus + itemBonus;
};

/**
 * Calculate attack bonus based on ability modifier and proficiency
 * @param {number} abilityMod - The ability modifier 
 * @param {number} proficiency - Proficiency rank
 * @param {number} level - Character level
 * @returns {string} - Formatted attack bonus
 */
export const getAttackBonus = (abilityMod, proficiency, level) => {
  const profBonus = getProficiencyBonus(proficiency, level);
  const bonus = abilityMod + profBonus;
  return formatModifier(bonus);
};

/**
 * Utility functions for inventory and bulk calculations
 */

/**
 * Calculate a character's bulk limit based on Strength
 * @param {Object} character - The character object
 * @returns {Object} - Object containing bulk limit and encumbered threshold
 */
export const calculateBulkLimit = (character) => {
  if (!character || !character.abilities) return { bulkLimit: 0, encumberedThreshold: 0 };
  
  // In PF2E, Bulk limit is equal to Strength ability modifier + 10
  const abilities = character.abilities || {};
  const strMod = getAbilityModifier(abilities.strength || 10);
  let bulkLimit = strMod + 10; // Maximum Bulk before becoming overencumbered
  let encumberedThreshold = bulkLimit - 5; // Encumbered after this threshold
  
  // Check if the character has the Hefty Hauler feat
  if (hasFeat(character, "Hefty Hauler")) {
    // Hefty Hauler increases both maximum and encumbered Bulk by 2
    bulkLimit += 2;
    encumberedThreshold += 2;
  }
  
  return { bulkLimit, encumberedThreshold };
};

/**
 * Convert pounds to Bulk as per PF2E rules
 * @param {number} pounds - Weight in pounds
 * @returns {number} - Equivalent Bulk value
 */
export const poundsToBulk = (pounds) => {
  if (pounds < 0.1) return 0; // Negligible Bulk
  if (pounds < 1) return 0.1; // Light (L) Bulk
  return Math.ceil(pounds / 10); // 1 Bulk is roughly 10 pounds
};

/**
 * Calculate total Bulk from inventory
 * @param {Array} inventory - Character's inventory array
 * @returns {number} - Total bulk
 */
export const calculateTotalBulk = (inventory) => {
  if (!inventory) return 0;
  
  return inventory.reduce((total, item) => {
    const itemBulk = poundsToBulk(item.weight) * item.quantity;
    return total + itemBulk;
  }, 0);
};

/**
 * Format Bulk for display
 * @param {number} bulk - Bulk value
 * @returns {string} - Formatted bulk string
 */
export const formatBulk = (bulk) => {
  if (bulk === 0) return '—'; // Negligible
  if (bulk < 1) return 'L'; // Light Bulk
  return bulk.toString(); // Regular Bulk
};