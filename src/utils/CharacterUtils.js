// src/utils/characterUtils.js
// Utility functions for character calculations in Pathfinder 2E

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
   * Get proficiency bonus based on proficiency rank and level
   * @param {number} proficiencyRank - Proficiency rank (0-4)
   * @param {number} level - Character level
   * @returns {number} - Calculated proficiency bonus
   */
  export const getProficiencyBonus = (proficiencyRank, level) => {
    if (proficiencyRank <= 0) return 0;
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
   * Calculate skill modifier using ability score and proficiency
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
    const profBonus = getProficiencyBonus(skillData.proficiency || 0, character.level || 0);
    
    // Return the sum of ability modifier and proficiency bonus
    return abilityMod + profBonus;
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
    
    // In PF2E, Bulk limit is equal to Strength ability modifier + 5
    const abilities = character.abilities || {};
    const strMod = getAbilityModifier(abilities.strength || 10);
    const bulkLimit = strMod + 10; // Maximum Bulk before becoming overencumbered
    const encumberedThreshold = bulkLimit - 5; // Encumbered after this threshold
    
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