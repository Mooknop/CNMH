// src/utils/SpellUtils.js
// Shared utility functions for spell-related components

import {
    getAbilityModifier,
    getProficiencyBonus
  } from './CharacterUtils';
import { itemAbilitiesActive } from './itemState';
import { spellItemDisplayName } from './spellItems';
  
  /**
   * Calculate spell attack modifier and DC based on character data
   * @param {Object} character - The character object
   * @param {Object} [options]
   * @param {boolean} [options.apex] - An invested apex item (#967 R8, the
   *   platinum power ring) boosts the spellcasting attribute: the modifier
   *   becomes max(mod + 1, +4) — never lower than the raw mod. Flows through
   *   to the DC via 10 + spellAttackMod.
   * @returns {Object} - Object containing spellAttackMod and spellDC
   */
  export const calculateSpellStats = (character, { apex = false } = {}) => {
    const spellcasting = character.spellcasting || {};

    // Get ability modifier
    let abilityMod = getAbilityModifier(character.abilities?.[spellcasting.ability] || 10);
    if (apex) {
      abilityMod = Math.max(abilityMod + 1, 4);
    }

    // Get proficiency bonus
    const proficiencyValue = spellcasting.proficiency || 0;
    const proficiencyMod = getProficiencyBonus(proficiencyValue, character.level || 0);

    // Calculate spell attack modifier
    const spellAttackMod = abilityMod + proficiencyMod;

    // Calculate spell DC
    const spellDC = 10 + spellAttackMod;

    return { spellAttackMod, spellDC };
  };
  
  /**
   * Organize spells into rank categories
   * @param {Array} spells - Array of spell objects
   * @returns {Object} - Object with spells organized by rank
   */
  export const organizeSpellsByRank = (spells = []) => {
    const spellsByRank = {
      cantrips: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
      7: [],
      8: [],
      9: [],
      10: []
    };
    
    spells.forEach(spell => {
      const rank = spell.level === 0 ? 'cantrips' : spell.level;
      if (spellsByRank[rank]) {
        spellsByRank[rank].push(spell);
      }
    });
    
    return spellsByRank;
  };
  
  /**
   * Get all available ranks from a spells by rank object
   * @param {Object} spellsByRank - Object with spells organized by rank
   * @returns {Array} - Array of available ranks as strings
   */
  export const getAvailableRanks = (spellsByRank) => {
    return Object.keys(spellsByRank).filter(
      rank => spellsByRank[rank].length > 0
    );
  };
  
  /**
   * Get all unique defense types from an array of spells
   * @param {Array} spells - Array of spell objects
   * @returns {Array} - Array of unique defense types
   */
  export const getDefenseTypes = (spells = []) => {
    const defenseTypes = new Set(['all']);
    
    spells.forEach(spell => {
      if (spell.defense) {
        defenseTypes.add(spell.defense);
      }
    });
    
    return Array.from(defenseTypes);
  };
  
  /**
   * Filter spells by defense type
   * @param {Array} spells - Array of spell objects
   * @param {string} defenseFilter - Defense type to filter by
   * @returns {Array} - Filtered spell objects
   */
  export const filterSpellsByDefense = (spells, defenseFilter) => {
    if (defenseFilter === 'all') {
      return spells;
    }
    
    return spells.filter(spell => 
      spell.defense === defenseFilter || 
      (!spell.defense && defenseFilter === 'none')
    );
  };
  
  /**
   * Filter spells by rank
   * @param {Array} spells - Array of spell objects
   * @param {string} activeSpellRank - Rank to filter by
   * @returns {Array} - Filtered spell objects
   */
  export const filterSpellsByRank = (spells, activeSpellRank) => {
    if (activeSpellRank === 'all') {
      return spells;
    }
    
    if (activeSpellRank === 'cantrips') {
      return spells.filter(spell => spell.level === 0);
    }
    
    return spells.filter(spell => spell.level === parseInt(activeSpellRank));
  };
  
  /**
   * Create a sorted rank list with cantrips first and then numbered ranks
   * @param {Array} availableRanks - Array of available ranks
   * @returns {Array} - Sorted array of ranks
   */
  export const getSortedRankList = (availableRanks) => {
    let sortedRanks = ['all'];
    
    // Add cantrips if available
    if (availableRanks.includes('cantrips')) {
      sortedRanks.push('cantrips');
    }
    
    // Add numbered ranks in order
    for (let i = 1; i <= 10; i++) {
      if (availableRanks.includes(i.toString())) {
        sortedRanks.push(i.toString());
      }
    }
    
    return sortedRanks;
  };
  
  /**
   * Format spell rank for display
   * @param {string} rank - Spell rank
   * @returns {string} - Formatted rank string
   */
  export const formatSpellRank = (rank) => {
    if (rank === 'cantrips') return 'Cantrips';
    if (rank === 'all') return 'All Spells';
    return `Rank ${rank}`;
  };
  
  /**
   * Find scrolls in character inventory
   * @param {Object} character - Character object
   * @returns {Array} - Array of scroll items with spells
   */
  export const findScrollItems = (character) => {
    return character.inventory
      ? character.inventory.filter(item => item.scroll)
      : [];
  };
  
  /**
   * Extract scroll spells from scroll items
   * @param {Array} scrollItems - Array of scroll items
   * @returns {Array} - Array of scroll spells
   */
  export const extractScrollSpells = (scrollItems) => {
    return scrollItems.flatMap(item => {
      // Add an identifier to the spell to know it's from a scroll
      if (item.scroll) {
        return {
          ...item.scroll,
          fromScroll: true,
          scrollName: spellItemDisplayName(item),
          // Gated: a scroll's spell is castable only while the scroll is
          // held (or the catalog flags it noHandRequired).
          active: itemAbilitiesActive(item)
        };
      }
      return [];
    });
  };

  /**
 * Find wands in character inventory
 * @param {Object} character - Character object
 * @returns {Array} - Array of wand items with spells
 */
export const findWandItems = (character) => {
  // Key on the `wand` block, not the name string: derived names (#812 S3) make
  // an `item.name.includes('wand')` heuristic fragile and unnecessary — the
  // block's presence is the source of truth (and matches findScrollItems).
  return character.inventory
    ? character.inventory.filter(item => item.wand)
    : [];
};

/**
 * Extract wand spells from wand items
 * @param {Array} wandItems - Array of wand items
 * @returns {Array} - Array of wand spells
 */
export const extractWandSpells = (wandItems) => {
  return wandItems.flatMap(item => {
    // Add an identifier to the spell to know it's from a wand
    if (item.wand) {
      return {
        ...item.wand,
        fromWand: true,
        wandName: spellItemDisplayName(item),
        // Gated: a wand's spell is castable only while the wand is held
        // (or the catalog flags it noHandRequired).
        active: itemAbilitiesActive(item)
      };
    }
    return [];
  });
};

/**
 * Extract innate spells from character's feats or other sources
 * @param {Object} character - Character object
 * @returns {Array} - Array of innate spells
 */
export const extractInnateSpells = (character) => {
  const innateSpells = [];
  
  // Check for feats with innate spells
  if (character.feats && Array.isArray(character.feats)) {
    character.feats.forEach(feat => {
      if (feat.innate && Array.isArray(feat.innate)) {
        // Add each innate spell from the feat, with source information
        feat.innate.forEach(spell => {
          innateSpells.push({
            ...spell,
            innateSource: feat.name,
            innate: true
          });
        });
      }
    });
  }
  
  // Check for ancestry innate spells (if implemented)
  if (character.ancestry_spells && Array.isArray(character.ancestry_spells)) {
    character.ancestry_spells.forEach(spell => {
      innateSpells.push({
        ...spell,
        innateSource: character.ancestry,
        innate: true
      });
    });
  }
  
  // Add other sources as needed

  return innateSpells;
};

/**
 * Resolve a character's focus-point pool ({ max, current }) regardless of which
 * class-specific shape it lives in. Returns null when the character has no focus pool.
 * @param {Object} character
 * @returns {{max:number, current:number}|null}
 */
export const getFocusInfo = (character) => {
  if (!character) return null;
  if (character.champion?.focus_points !== undefined) {
    return { max: character.champion.focus_points, current: character.champion.focus_points };
  }
  if (character.monk?.focus_points !== undefined) {
    return { max: character.monk.focus_points, current: character.monk.focus_points };
  }
  if (character.spellcasting?.focus?.max !== undefined) {
    const { max, current } = character.spellcasting.focus;
    return { max, current: current ?? max };
  }
  return null;
};

/**
 * The character's focus/devotion/ki spell entries (catalog refs, epic #622),
 * regardless of which class-specific shape they live in. Shared by
 * FocusSpellsList and the Segmented Deck's Spells segment — keep the source
 * priority identical in both.
 * @param {Object} character
 * @returns {Array} raw entries (resolve via resolveFocusSpells)
 */
export const getFocusSpellEntries = (character) => {
  if (!character) return [];
  if (character.champion?.devotion_spells) return character.champion.devotion_spells;
  if (character.monk?.ki_spells) return character.monk.ki_spells;
  if (character.spellcasting?.bloodline?.focus_spells) return character.spellcasting.bloodline.focus_spells;
  if (character.focus_spells) return character.focus_spells;
  if (character.witchwarper?.warpSpells) return character.witchwarper.warpSpells;
  return [];
};

/**
 * Class-flavored label for the focus-spell pool ("Devotion Spells",
 * "Compositions", …). Mirrors FocusSpellsList's original branch order.
 * @param {Object} character
 * @returns {string}
 */
export const getFocusSpellLabel = (character) => {
  if (character?.champion) return 'Devotion Spells';
  if (character?.monk) return 'Qi Spells';
  if (character?.spellcasting?.bloodline) {
    return `${character.spellcasting.bloodline.name} Bloodline Spells`;
  }
  if (character?.class === 'Bard') return 'Compositions';
  return 'Focus Spells';
};