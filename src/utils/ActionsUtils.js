// src/utils/ActionsUtils.js
// Shared utility functions for actions-related components

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
          
          // Format damage string with ability modifier
          let damageString = strike.damage || '1d6';
          
          // Add strength mod to melee weapons OR thrown ranged weapons
          if ((isMelee || isThrown) && strMod !== 0 && !damageString.includes('+') && !damageString.includes('-')) {
            damageString += (strMod > 0 ? '+' + strMod : strMod);
          }
          
          return {
            name: strike.name,
            type: strike.type || 'melee', // Default to melee if not specified
            actionCount: parseInt(strike.actionCount || strike.action) || 1,
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
 * Get all actions for the character
 * @param {Object} character - Character data
 * @returns {Array} - Array of action objects
 */
export const getActions = (character) => {
  // Create array to hold all actions
  let allActions = [];

  // Add defined actions from character data if they exist
  if (character.actions && character.actions.length > 0) {
    allActions = [...character.actions];
  }

  // Add actions from inventory items
  if (character.inventory) {
    const inventoryActions = character.inventory
      .filter(item => item.actions && item.actions.length > 0) // Only items with actions property
      .flatMap(item => {
        // Map each action from this item and add a source property
        return item.actions.map(action => ({
          ...action,
          source: item.name // Add source for reference
        }));
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
        return feat.actions.map(action => ({
          ...action,
          source: feat.name // Add source for reference
        }));
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
          source: feat.name // Add source for reference
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