// src/utils/ActionsUtils.js
// Updated utility functions for actions-related components

import { 
  getAbilityModifier, 
  getAttackBonus 
} from './CharacterUtils';

/**
 * Get all strikes for the character
 * @param {Object} character - Character data
 * @returns {Array} - Array of strike objects with attack modifiers
 */
export const getStrikes = (character) => {
  // Create array to hold all strikes
  let allStrikes = [];

  // Add defined strikes from character data if they exist
  if (character.strikes && Array.isArray(character.strikes) && character.strikes.length > 0) {
    // Process each predefined strike to calculate attack modifier
    const processedStrikes = character.strikes.map(strike => {
      // Determine ability modifier based on strike type and traits
      let abilityMod;
      const isMelee = strike.type === 'melee';
      const isFinesse = strike.traits && strike.traits.includes('Finesse');
      const isThrown = strike.traits && strike.traits.includes('Thrown');
      
      // Get relevant ability modifiers
      const strMod = getAbilityModifier(character.abilities?.strength || 10);
      const dexMod = getAbilityModifier(character.abilities?.dexterity || 10);
      
      // Use appropriate modifier based on weapon type and traits
      if (isFinesse) {
        abilityMod = Math.max(strMod, dexMod); // Finesse can use higher of STR or DEX
      } else if (isMelee) {
        abilityMod = strMod; // Melee weapons use STR
      } else {
        abilityMod = dexMod; // Ranged weapons use DEX
      }
      
      // Determine the proficiency value to use
      let proficiencyValue = 0;
      // Check for proficiency based on weapon category
      if (strike.proficiency && character.proficiencies?.weapons?.[strike.proficiency]) {
        proficiencyValue = character.proficiencies.weapons[strike.proficiency].proficiency || 0;
      }
      // Special case for unarmed attacks
      else if (strike.traits && strike.traits.includes('Unarmed')) {
        proficiencyValue = character.proficiencies?.weapons?.unarmed?.proficiency || 0;
      }
      // Default to simple weapons proficiency
      else {
        proficiencyValue = character.proficiencies?.weapons?.simple?.proficiency || 0;
      }
      
      // Calculate attack bonus
      const attackBonus = getAttackBonus(abilityMod, proficiencyValue, character.level || 0);

      // Add appropriate mod to damage
      let damageString = strike.damage || '??';
      
      // Add strength mod to melee weapons OR thrown ranged weapons
      if ((isMelee || isThrown) && strMod !== 0 && !damageString.includes('+') && !damageString.includes('-')) {
        damageString += (strMod > 0 ? '+' + strMod : strMod);
      }
      
      // Return the strike with calculated attack modifier
      return {
        ...strike,
        attackMod: attackBonus,
        damage: damageString
      };
    });
    
    allStrikes = [...processedStrikes];
  }

  // Add strikes from feats
  if (character.feats) {
    const featStrikes = character.feats
      .filter(feat => feat.strikes && Array.isArray(feat.strikes) && feat.strikes.length > 0) // Only feats with strikes property
      .flatMap(feat => {
        // Map each strike from this feat and add a source property
        return feat.strikes.map(strike => {
          // Determine ability modifier based on strike type and traits
          let abilityMod;
          const isMelee = strike.type === 'melee';
          const isFinesse = strike.traits && strike.traits.includes('Finesse');
          const isThrown = strike.traits && strike.traits.includes('Thrown');
          const isKineticist = strike.traits && strike.traits.includes('Kineticist');
          
          // Get relevant ability modifiers
          const strMod = getAbilityModifier(character.abilities?.strength || 10);
          const dexMod = getAbilityModifier(character.abilities?.dexterity || 10);
          const conMod = getAbilityModifier(character.abilities?.constitution || 10);
          
          // Use appropriate modifier based on weapon type and traits
          if(isKineticist){
            abilityMod = conMod;
          } else if (isFinesse) {
            abilityMod = Math.max(strMod, dexMod); // Finesse can use higher of STR or DEX
          } else if (isMelee) {
            abilityMod = strMod; // Melee weapons use STR
          } else {
            abilityMod = dexMod; // Ranged weapons use DEX
          }
          
          // Determine the proficiency value to use
          let proficiencyValue = 0;
          // Check for proficiency based on weapon category
          if (strike.proficiency && character.proficiencies?.weapons?.[strike.proficiency]) {
            proficiencyValue = character.proficiencies.weapons[strike.proficiency].proficiency || 0;
          }
          // Special case for unarmed attacks
          else if (strike.traits && strike.traits.includes('Unarmed')) {
            proficiencyValue = character.proficiencies?.weapons?.unarmed?.proficiency || 0;
          }
          // Default to simple weapons proficiency
          else {
            proficiencyValue = character.proficiencies?.weapons?.simple?.proficiency || 0;
          }
          
          // Calculate attack bonus
          const attackBonus = getAttackBonus(abilityMod, proficiencyValue, character.level || 0);
          
          // Format damage string with ability modifier
          let damageString = strike.damage || '1d6';
          
          // Add strength mod to melee weapons OR thrown ranged weapons
          if ((isMelee || isThrown) && strMod !== 0 && !damageString.includes('+') && !damageString.includes('-')) {
            damageString += (strMod > 0 ? '+' + strMod : strMod);
          }
          
          // Check for variable actions - important for Metal Blast
          let variableActionCount = null;
          
          // Check for text like "One to Two"
          if (strike.actionCount && typeof strike.actionCount === 'string') {
            const actionText = strike.actionCount.toLowerCase();
            if (actionText.includes('to')) {
              const rangeMatch = actionText.match(/(\w+)\s+to\s+(\w+)/i);
              if (rangeMatch) {
                const min = convertWordToNumber(rangeMatch[1]);
                const max = convertWordToNumber(rangeMatch[2]);
                if (min > 0 && max > 0) {
                  variableActionCount = { min, max };
                }
              }
            }
          } 
          // Special handling for Pellias's Metal Blast
          else if (strike.name && strike.name.includes('Metal Blast')) {
            // Parse from actionCount string if it's in the format "One to Two Actions"
            if (typeof strike.action === 'string' && strike.action.toLowerCase().includes('to')) {
              const actionText = strike.action.toLowerCase();
              const rangeMatch = actionText.match(/(\w+)\s+to\s+(\w+)/i);
              if (rangeMatch) {
                const min = convertWordToNumber(rangeMatch[1]);
                const max = convertWordToNumber(rangeMatch[2]);
                if (min > 0 && max > 0) {
                  variableActionCount = { min, max };
                }
              }
            } else {
              // Hardcode for Metal Blast which we know is "One to Two"
              variableActionCount = { min: 1, max: 2 };
            }
          }
          
          return {
            name: strike.name,
            type: strike.type || 'melee', // Default to melee if not specified
            actionCount: parseInt(strike.actionCount || strike.action) || 1,
            variableActionCount: variableActionCount,
            actions: strike.action && typeof strike.action === 'string' ? strike.action : null,
            traits: strike.traits || [],
            attackMod: attackBonus,
            damage: damageString,
            description: strike.description || "",
            source: feat.name, // Add feat source for reference
            range: strike.range
          };
        });
      });
    
    // Add feat strikes to the list
    allStrikes = [...allStrikes, ...featStrikes];
  }

  // Add strikes from inventory weapons
  if (character.inventory) {
    const weaponStrikes = character.inventory
      .filter(item => item.strikes) // Only items with strikes property
      .flatMap(item => {
        // Check if item.strikes is an array (multiple strikes) or a single object
        const strikesArray = Array.isArray(item.strikes) ? item.strikes : [item.strikes];
        
        // Process each strike for this item
        return strikesArray.map(weaponStrike => {
          const isProficient = character.proficiencies?.weapons?.[weaponStrike.proficiency || 'simple'];
          const proficiencyValue = isProficient?.proficiency || 0;
          
          // Determine ability modifier based on weapon traits
          let abilityMod;
          const isMelee = weaponStrike.type === 'melee';
          const isFinesse = weaponStrike.traits && weaponStrike.traits.includes('Finesse');
          const isThrown = weaponStrike.traits && weaponStrike.traits.includes('Thrown');
          
          // Get relevant ability modifiers
          const strMod = getAbilityModifier(character.abilities?.strength || 10);
          const dexMod = getAbilityModifier(character.abilities?.dexterity || 10);
          
          // Use appropriate modifier based on weapon type and traits
          if (isFinesse) {
            abilityMod = Math.max(strMod, dexMod); // Finesse can use higher of STR or DEX
          } else if (isMelee) {
            abilityMod = strMod; // Melee weapons use STR
          } else {
            abilityMod = dexMod; // Ranged weapons use DEX
          }
          
          // Calculate attack bonus from ability, proficiency and level
          let attackBonus = getAttackBonus(abilityMod, proficiencyValue, character.level || 0);
          
          // Add weapon potency bonus if present
          if (item.potency) {
            // Convert the numerical value of the potency rune to a string with a + sign
            const potencyBonus = `+${item.potency}`;
            
            // If the attack bonus already includes a + sign, add the potency numerically
            if (attackBonus.startsWith('+')) {
              const currentBonus = parseInt(attackBonus.substring(1));
              attackBonus = `+${currentBonus + item.potency}`;
            } else {
              // Otherwise, just append the potency bonus
              attackBonus = `${attackBonus}${potencyBonus}`;
            }
          }
          
          // Format damage string with ability modifier
          let damageString = weaponStrike.damage || '1d6';
          
          // Add strength mod to melee weapons OR thrown ranged weapons
          if ((isMelee || isThrown) && strMod !== 0 && !damageString.includes('+') && !damageString.includes('-')) {
            damageString += (strMod > 0 ? '+' + strMod : strMod);
          }
          
          // Determine strike name based on type
          const strikeName = weaponStrike.name || 
            (weaponStrike.type === 'melee' ? `${item.name} Melee Strike` : `${item.name} Ranged Strike`);
          
          return {
            name: strikeName,
            type: weaponStrike.type || 'melee', // Default to melee if not specified
            actionCount: parseInt(weaponStrike.actionCount || weaponStrike.action) || 1,
            traits: weaponStrike.traits || [],
            attackMod: attackBonus,
            damage: damageString,
            description: weaponStrike.description || item.description || "",
            source: item.name,
            range: weaponStrike.range
          };
        });
      });
    
    // Add weapon strikes to the list
    allStrikes = [...allStrikes, ...weaponStrikes];
  }

  // Add unarmed strike if no strikes available
  if (allStrikes.length === 0) {
    const unarmedProficiency = character.proficiencies?.weapons?.unarmed?.proficiency || 0;
    const strMod = getAbilityModifier(character.abilities?.strength || 10);
    const attackBonus = getAttackBonus(strMod, unarmedProficiency, character.level || 0);
    
    allStrikes.push({
      name: "Unarmed Strike",
      type: "melee",
      actionCount: 1,
      traits: ["Attack", "Melee", "Unarmed"],
      attackMod: attackBonus,
      damage: `1d4${strMod !== 0 ? (strMod > 0 ? '+' + strMod : strMod) : ''}`,
      description: "A strike with your fist or another body part."
    });
  }

  // Post-process strikes for variable action counts
  allStrikes = allStrikes.map(strike => {
    // Special handling for Metal Blast
    if (strike.name && strike.name.includes('Metal Blast')) {
      return {
        ...strike,
        actions: 'One to Two Actions',
        variableActionCount: { min: 1, max: 2 }
      };
    }
    
    return strike;
  });

  // Ensure type is defined for all strikes
  allStrikes = allStrikes.map(strike => ({
    ...strike,
    type: strike.type || (strike.traits && strike.traits.includes('Ranged') ? 'ranged' : 'melee')
  }));

  return allStrikes;
};

/**
 * Categorize strikes by type (melee/ranged)
 * @param {Array} strikes - Array of strike objects
 * @returns {Object} - Object with strikes categorized by type
 */
export const categorizeStrikesByType = (strikes) => {
  return {
    melee: strikes.filter(strike => strike.type === 'melee'),
    ranged: strikes.filter(strike => strike.type === 'ranged')
  };
};

/**
 * Helper function to convert word numbers to integers
 * @param {string} word - Word representation of a number
 * @returns {number} - Numeric value
 */
const convertWordToNumber = (word) => {
  const wordMap = {
    'one': 1,
    'two': 2,
    'three': 3,
    '1': 1,
    '2': 2,
    '3': 3
  };
  
  return wordMap[word.toLowerCase()] || 0;
};

/**
 * Get all actions for the character
 * @param {Object} character - Character data
 * @returns {Array} - Array of action objects
 */
export const getActions = (character) => {
  // Create array to hold all actions
  let allActions = [];

  // Add defined actions from character data if they exist
  if (character.actions && character.actions.length > 0) {
    // Process each action to normalize action count and check for variable actions
    const processedActions = character.actions.map(action => {
      return processActionText(action);
    });
    
    allActions = [...processedActions];
  }

  // Add actions from inventory items
  if (character.inventory) {
    const inventoryActions = character.inventory
      .filter(item => item.actions && item.actions.length > 0) // Only items with actions property
      .flatMap(item => {
        // Map each action from this item and add a source property
        return item.actions.map(action => {
          const processedAction = processActionText(action);
          return {
            ...processedAction,
            source: item.name // Add source for reference
          };
        });
      });
    
    // Add inventory actions to the list
    allActions = [...allActions, ...inventoryActions];
  }

  // Add actions from feats
  if (character.feats) {
    const featActions = character.feats
      .filter(feat => feat.actions && feat.actions.length > 0) // Only feats with actions property
      .flatMap(feat => {
        // Map each action from this feat and add a source property
        return feat.actions.map(action => {
          const processedAction = processActionText(action);
          return {
            ...processedAction,
            source: feat.name // Add source for reference
          };
        });
      });
    
    // Add feat actions to the list
    allActions = [...allActions, ...featActions];
  }

  // Add standard actions if none exist (move, stride, etc.)
  if (allActions.length === 0) {
    allActions = [
      {
        name: "Stride",
        actionCount: 1,
        traits: ["Move"],
        description: "You move up to your Speed."
      },
      {
        name: "Step",
        actionCount: 1,
        traits: ["Move"],
        description: "You carefully move 5 feet. This movement doesn't trigger reactions that are normally triggered by movement."
      },
      {
        name: "Strike",
        actionCount: 1,
        traits: ["Attack"],
        description: "You attack with a weapon or unarmed attack."
      }
    ];
  }

  return allActions;
};

/**
 * Process action text to handle variable action counts
 * @param {Object} action - The action object to process
 * @returns {Object} - The processed action with normalized actionCount and variableActionCount fields
 */
const processActionText = (action) => {
  // If actions field is defined as text (like "One to Three Actions")
  if (action.actions && typeof action.actions === 'string') {
    const text = action.actions.toLowerCase();
    
    // Check for variable action ranges
    if (text.includes('to')) {
      const rangeMatch = text.match(/(\w+)\s+to\s+(\w+)/i);
      if (rangeMatch) {
        const min = convertWordToNumber(rangeMatch[1]);
        const max = convertWordToNumber(rangeMatch[2]);
        
        if (min > 0 && max > 0) {
          return {
            ...action,
            actionCount: min, // Use minimum as default
            variableActionCount: {
              min,
              max
            }
          };
        }
      }
    }
    
    // Process regular action counts
    const count = parseActionCount(action.actions);
    if (count > 0) {
      return {
        ...action,
        actionCount: count
      };
    }
  }
  
  // Return original action if no processing was needed
  return action;
};

/**
 * Get all reactions for the character
 * @param {Object} character - Character data
 * @returns {Array} - Array of reaction objects
 */
export const getReactions = (character) => {
  // Create array to hold all reactions
  let allReactions = [];

  // Add defined reactions from character data if they exist
  if (character.reactions && character.reactions.length > 0) {
    allReactions = [...character.reactions];
  }

  // Add reactions from inventory items
  if (character.inventory) {
    const inventoryReactions = character.inventory
      .filter(item => item.reactions && item.reactions.length > 0) // Only items with reactions property
      .flatMap(item => {
        // Map each reaction from this item and add a source property
        return item.reactions.map(reaction => ({
          ...reaction,
          source: item.name // Add source for reference
        }));
      });
    
    // Add inventory reactions to the list
    allReactions = [...allReactions, ...inventoryReactions];
  }

  // Add reactions from feats
  if (character.feats) {
    const featReactions = character.feats
      .filter(feat => feat.reactions && feat.reactions.length > 0) // Only feats with reactions
      .flatMap(feat => {
        // Map each reaction from this feat and add a source property
        return feat.reactions.map(reaction => ({
          ...reaction,
          source: feat.name // Add feat source for reference
        }));
      });
    
    // Add feat reactions to the list
    allReactions = [...allReactions, ...featReactions];
  }

  return allReactions;
};

/**
 * Get all free actions for the character
 * @param {Object} character - Character data
 * @returns {Array} - Array of free action objects
 */
export const getFreeActions = (character) => {
  // Create array to hold all free actions
  let allFreeActions = [];

  // Add defined free actions from character data if they exist
  if (character.freeActions && character.freeActions.length > 0) {
    allFreeActions = [...character.freeActions];
  }

  // Add free actions from inventory items
  if (character.inventory) {
    const inventoryFreeActions = character.inventory
      .filter(item => item.freeActions && item.freeActions.length > 0) // Only items with freeActions property
      .flatMap(item => {
        // Map each free action from this item and add a source property
        return item.freeActions.map(freeAction => ({
          ...freeAction,
          source: item.name // Add source for reference
        }));
      });
    
    // Add inventory free actions to the list
    allFreeActions = [...allFreeActions, ...inventoryFreeActions];
  }

  // Add free actions from feats
  if (character.feats) {
    const featFreeActions = character.feats
      .filter(feat => feat.freeActions && feat.freeActions.length > 0)
      .flatMap(feat => {
        return feat.freeActions.map(freeAction => ({
          ...freeAction,
          source: feat.name
        }));
      });
    
    // Add feat free actions to the list
    allFreeActions = [...allFreeActions, ...featFreeActions];
  }

  return allFreeActions;
};

/**
 * Parse action text to determine action count
 * @param {string} actionText - Text describing actions (e.g., "One Action", "Two Actions")
 * @returns {number} - Number of actions (0 if not determinable)
 */
export const parseActionCount = (actionText) => {
  if (!actionText) return 0;
  
  // Convert to lowercase for consistent matching
  const text = actionText.toLowerCase();
  
  // Check for "One Action", "Two Actions", "Three Actions" format
  if (text.includes('one action')) return 1;
  if (text.includes('two actions')) return 2;
  if (text.includes('three actions')) return 3;
  
  // Check for "1 Action", "2 Actions", "3 Actions" format
  const match = text.match(/(\d+)\s+action/i);
  if (match) return parseInt(match[1]);
  
  // Handle "One to Three Actions" variable format
  if (text.includes('one to three actions')) return 3; // Return the maximum
  if (text.includes('one to two actions')) return 2;  // Return the maximum
  
  // Handle special action types
  if (text.includes('reaction')) return -1; // Reaction
  if (text.includes('free action')) return -2; // Free action
  
  return 0; // Unknown or not applicable
};

/**
 * Get the action type based on action count
 * @param {number} actionCount - Action count from parseActionCount
 * @returns {string} - Action type (standard, reaction, free)
 */
export const getActionType = (actionCount) => {
  if (actionCount > 0) return 'standard';
  if (actionCount === -1) return 'reaction';
  if (actionCount === -2) return 'free';
  return 'unknown';
};

/**
 * Extract variable action count from action text if present
 * @param {string} actionText - Text describing actions
 * @returns {Object|null} - Object with min and max action counts, or null if not variable
 */
export const extractVariableActionCount = (actionText) => {
  if (!actionText) return null;
  
  const text = actionText.toLowerCase();
  
  // Look for "X to Y actions" pattern
  const rangeMatch = text.match(/(\w+)\s+to\s+(\w+)\s+action/i);
  if (rangeMatch) {
    const min = convertWordToNumber(rangeMatch[1]);
    const max = convertWordToNumber(rangeMatch[2]);
    
    if (min > 0 && max > 0 && min <= max) {
      return { min, max };
    }
  }
  
  return null;
};

/**
 * Render action indicators as JSX
 * @param {string} actionText - Text describing actions
 * @param {string} themeColor - Color theme to use
 * @returns {Object} - JSX elements for rendering action indicators
 */
export const renderActionIcons = (actionText, themeColor) => {
  if (!actionText) return null;
  
  const text = actionText.toLowerCase();
  
  // Check for variable action counts
  const variableCount = extractVariableActionCount(text);
  if (variableCount) {
    return {
      type: 'variable',
      min: variableCount.min,
      max: variableCount.max,
      count: variableCount.min // Use minimum as default count
    };
  }
  
  // Special icons for reaction and free action
  if (text.includes('reaction')) {
    return { 
      type: 'reaction',
      icon: '⟳',
      count: 1
    };
  }
  
  if (text.includes('free action')) {
    return {
      type: 'free',
      icon: '⟡',
      count: 1
    };
  }
  
  // Standard actions
  const actionCount = parseActionCount(text);
  if (actionCount > 0) {
    return {
      type: 'standard',
      icon: '●',
      count: actionCount
    };
  }
  
  // Default for unknown
  return {
    type: 'text',
    text: actionText,
    count: 0
  };
};