import React, { useState, useMemo, useEffect } from 'react';
import './SpellsList.css';

import GemSpells from './GemSpells';
import SpellsHeader from './SpellsHeader';
import ViewModeToggle from './ViewModeToggle';
import SpellFilters from './SpellFilters';
import SpellsRepertoire from './SpellsRepertoire';
import StaffSpells from './StaffSpells';
import ScrollSpells from './ScrollSpells';
import WandSpells from './WandSpells';
import FocusSpellsList from './FocusSpellsList';
import InnateCastingList from './InnateCastingList';
import EldPowers from './EldPowers';
import { 
  organizeSpellsByRank, 
  getAvailableRanks,
  getDefenseTypes,
  filterSpellsByRank,
  getSortedRankList,
  findScrollItems,
  extractScrollSpells,
  findWandItems,
  extractWandSpells,
  extractInnateSpells,
  findGemItems,
  extractGemSpells
} from '../../utils/SpellUtils';

/**
 * Main component for displaying spells in different categories
 * @param {Object} props
 * @param {Object} props.character - Character data
 * @param {string} props.characterColor - Theme color for the character
 */
const SpellsList = ({ character, characterColor }) => {
  // State for filters and view mode
  const [activeSpellRank, setActiveSpellRank] = useState('all');
  const [defenseFilter, setDefenseFilter] = useState('all');
  const [viewMode, setViewMode] = useState(null); // Initialize to null, will be set after determining available modes
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';
  
  // Get spell data from character
  const spellcasting = character.spellcasting || {};
  
  // Check if character has a bloodline
  const hasBloodline = !!spellcasting.bloodline;
  
  // Function to check if character has focus spells
  const hasFocusSpells = () => {
    // Check each character class for focus spells
    if (character.champion && character.champion.devotion_spells) {
      return true;
    }
    if (character.spellcasting && character.spellcasting.focus) {
      return true;
    }
    if (character.monk && character.monk.ki_spells) {
      return true;
    }
    if (character.focus_spells && character.focus_spells.length > 0) {
      return true;
    }
    return false;
  };
  
  // Use memoization for preparing spell data
  const {
    hasSpellcasting,
    hasFocus,
    hasInnate,
    innateSpells,
    scrollSpells,
    hasScrolls,
    wandSpells,
    hasWands,
    spellsByRank,
    staffSpells,
    hasStaff,
    availableSpellRanks,
    allAvailableRanks,
    sortedRankList,
    allDefenseTypes,
    hasGems,
    gemSpells,
    hasEldPowers,
    eldPowers
  } = useMemo(() => {
    // Check if character has Eld Powers
    const hasEldPowers = spellcasting.eldPowers && spellcasting.eldPowers.length > 0;
    const eldPowers = spellcasting.eldPowers || [];
    
    // Check if character has spellcasting
    const hasSpellcasting = !!spellcasting.tradition;
    
    // Check if character has focus spells
    const hasFocus = hasFocusSpells();
    
    // Extract innate spells
    const innateSpells = extractInnateSpells(character);
    const hasInnate = innateSpells.length > 0;
    
    // If no spellcasting, return early with default values
    if (!hasSpellcasting && !hasFocus && !hasInnate && !hasEldPowers) {
      return {
        hasSpellcasting: false,
        hasFocus: false,
        hasInnate: false,
        hasEldPowers: false,
        eldPowers: [],
        innateSpells: [],
        scrollItems: [],
        scrollSpells: [],
        hasScrolls: false,
        wandItems: [],
        wandSpells: [],
        hasWands: false,
        spellsByRank: {},
        staffSpells: [],
        hasStaff: false,
        staffSpellsByRank: {},
        scrollSpellsByRank: {},
        wandSpellsByRank: {},
        innateSpellsByRank: {},
        availableSpellRanks: [],
        availableStaffSpellRanks: [],
        availableScrollSpellRanks: [],
        availableWandSpellRanks: [],
        availableInnateSpellRanks: [],
        allAvailableRanks: [],
        sortedRankList: [],
        allDefenseTypes: [],
        hasGems: false,
        gemSpells: []
      };
    }
    
    // Find scrolls in inventory
    const scrollItems = findScrollItems(character);
    const hasScrolls = scrollItems.length > 0;
    
    // Extract scroll spells
    const scrollSpells = hasScrolls ? extractScrollSpells(scrollItems) : [];
    
    // Spell gems
    const gemItems = findGemItems(character);
    const hasGems = gemItems.length > 0;
    // Extract gem spells
    const gemSpells = hasGems ? extractGemSpells(gemItems) : [];

    // Find wands in inventory
    const wandItems = findWandItems(character);
    const hasWands = wandItems.length > 0;
    
    // Extract wand spells
    const wandSpells = hasWands ? extractWandSpells(wandItems) : [];
    
    // Check if character has a staff
    const hasStaff = character.staff && character.staff.name;
    const staffSpells = character.staff?.spells || [];
    
    // Organize spells by rank
    const spellsByRank = organizeSpellsByRank(spellcasting.spells || []);
    const staffSpellsByRank = organizeSpellsByRank(staffSpells);
    const scrollSpellsByRank = organizeSpellsByRank(scrollSpells);
    const wandSpellsByRank = organizeSpellsByRank(wandSpells);
    const innateSpellsByRank = organizeSpellsByRank(innateSpells);
    const gemSpellsByRank = organizeSpellsByRank(gemSpells);
    
    // Get available ranks from each source
    const availableSpellRanks = getAvailableRanks(spellsByRank);
    const availableStaffSpellRanks = getAvailableRanks(staffSpellsByRank);
    const availableScrollSpellRanks = getAvailableRanks(scrollSpellsByRank);
    const availableWandSpellRanks = getAvailableRanks(wandSpellsByRank);
    const availableInnateSpellRanks = getAvailableRanks(innateSpellsByRank);
    const availableGemSpellRanks = getAvailableRanks(gemSpellsByRank);
    
    // Combine available ranks from all sources
    const allAvailableRanks = [...new Set([
      ...availableSpellRanks, 
      ...availableStaffSpellRanks,
      ...availableScrollSpellRanks,
      ...availableWandSpellRanks,
      ...availableInnateSpellRanks,
      ...availableGemSpellRanks
    ])];
    
    // Create sorted rank list
    const sortedRankList = getSortedRankList(allAvailableRanks);
    
    // Get all defense types from all spells
    const allSpells = [
      ...(spellcasting.spells || []),
      ...staffSpells,
      ...scrollSpells,
      ...wandSpells,
      ...innateSpells,
      ...gemSpells
    ];
    
    const allDefenseTypes = getDefenseTypes(allSpells);
    
    return {
      hasSpellcasting,
      hasFocus,
      hasInnate,
      hasEldPowers,
      eldPowers,
      innateSpells,
      scrollItems,
      scrollSpells,
      hasScrolls,
      wandItems,
      wandSpells,
      hasWands,
      spellsByRank,
      staffSpells,
      hasStaff,
      staffSpellsByRank,
      scrollSpellsByRank,
      wandSpellsByRank,
      innateSpellsByRank,
      availableSpellRanks,
      availableStaffSpellRanks,
      availableScrollSpellRanks,
      availableWandSpellRanks,
      availableInnateSpellRanks,
      allAvailableRanks,
      sortedRankList,
      allDefenseTypes,
      gemItems,
      gemSpells,
      hasGems,
      gemSpellsByRank,
      availableGemSpellRanks
    };
  }, [character, spellcasting]);

  // Effect to set the initial view mode based on what's available
  useEffect(() => {
    // Only set view mode if it hasn't been set yet
    if (viewMode === null) {
      // Determine what view modes are available
      const availableModes = [];
      
      if (hasSpellcasting) availableModes.push('spells');
      if (hasInnate) availableModes.push('innate');
      if (hasFocus) availableModes.push('focus');
      if (hasEldPowers) availableModes.push('eld');
      if (hasStaff) availableModes.push('staff');
      if (hasScrolls) availableModes.push('scrolls');
      if (hasWands) availableModes.push('wands');
      if (hasGems) availableModes.push('gems');
      
      // Set view mode to the first available one
      if (availableModes.length > 0) {
        setViewMode(availableModes[0]);
      } else {
        // Fallback to 'spells' if somehow there are no available modes
        setViewMode('spells');
      }
    }
  }, [hasSpellcasting, hasInnate, hasFocus, hasEldPowers, hasStaff, hasScrolls, hasWands, hasGems, viewMode]);
  
  // If no spellcasting, focus magic, innate spells, or eld powers, show placeholder
  if (!hasSpellcasting && !hasFocus && !hasInnate && !hasEldPowers) {
    return (
      <div className="spells-list">
        <h2 style={{ color: themeColor }}>Spellcasting</h2>
        <div className="empty-state">
          <p>This character doesn't have spellcasting, innate, focus magic abilities, or Eld Powers.</p>
        </div>
      </div>
    );
  }
  
  // If view mode hasn't been set yet, show loading state
  if (viewMode === null) {
    return (
      <div className="spells-list">
        <h2 style={{ color: themeColor }}>Spellcasting</h2>
        <div className="empty-state">
          <p>Loading spells...</p>
        </div>
      </div>
    );
  }
  
  // Prepare the spells to display based on view mode and filters
  const getSpellsToDisplay = () => {
    if (viewMode === 'spells') {
      // Flatten the spell repertoire for filtering
      let allSpells = [];
      
      if (activeSpellRank === 'all') {
        // Add all spells in rank order
        if (spellsByRank['cantrips'] && spellsByRank['cantrips'].length > 0) {
          allSpells = [...allSpells, ...spellsByRank['cantrips']];
        }
        
        for (let i = 1; i <= 10; i++) {
          if (spellsByRank[i] && spellsByRank[i].length > 0) {
            allSpells = [...allSpells, ...spellsByRank[i]];
          }
        }
        
        return allSpells;
      }
      
      // Return spells of specific rank
      return spellsByRank[activeSpellRank] || [];
    } 
    else if (viewMode === 'innate') {
      return filterSpellsByRank(innateSpells, activeSpellRank);
    }
    else if (viewMode === 'staff') {
      return filterSpellsByRank(staffSpells, activeSpellRank);
    } 
    else if (viewMode === 'scrolls') {
      return filterSpellsByRank(scrollSpells, activeSpellRank);
    }
    else if (viewMode === 'wands') {
      return filterSpellsByRank(wandSpells, activeSpellRank);
    }
    else if (viewMode === 'gems') {
      return filterSpellsByRank(gemSpells, activeSpellRank);
    }
    
    return [];
  };
  
  // Get spells to display based on current filters
  const spellsToDisplay = getSpellsToDisplay();
  
  // Determine the focus spells label
  const getFocusSpellsLabel = () => {
    if (character.champion) {
      return 'Devotion Spells';
    }
    if (character.monk) {
      return 'Qi Spells';
    }
    if (character.class === 'Bard') {
      return 'Compositions';
    }
    if (character.spellcasting && character.spellcasting.bloodline) {
      return 'Focus Spells';
    }
    return 'Focus Spells';
  };
  
  // Show bloodline information if character has a bloodline
  const renderBloodlineInfo = () => {
    if (!hasBloodline) return null;
    
    const { name, description } = spellcasting.bloodline;
    
    return (
      <div className="bloodline-info">
        <h3 style={{ color: themeColor }}>{name} Bloodline</h3>
        <p className="bloodline-description">{description}</p>
        <div className="bloodline-magic">
          <span className="bloodline-magic-label">Imperial Blood Magic:</span>
          <span className="bloodline-magic-effect">Whenever you cast a bloodline spell passed down from your ancestor, you choose one blood magic effect you know to benefit from.</span>
        </div>
      </div>
    );
  };
  
  return (
    <div className="spells-list">
      {/* Spellcasting statistics - only show if character has spellcasting */}
      {hasSpellcasting && (
        <SpellsHeader 
          character={character} 
          themeColor={themeColor} 
        />
      )}
      
      {/* Bloodline information */}
      {hasBloodline && renderBloodlineInfo()}
      
      {/* View mode toggle */}
      <ViewModeToggle 
        viewMode={viewMode}
        setViewMode={setViewMode}
        hasSpellcasting={hasSpellcasting}
        hasFocus={hasFocus}
        hasInnate={hasInnate}
        hasEldPowers={hasEldPowers}
        hasStaff={hasStaff}
        hasScrolls={hasScrolls}
        hasWands={hasWands}
        staff={character.staff || {}}
        focusLabel={getFocusSpellsLabel()}
        themeColor={themeColor}
        hasGems={hasGems}
      />
      
      {/* Filters that work across all tabs */}
      {allAvailableRanks.length > 0 && viewMode !== 'focus' && viewMode !== 'eld' && (
        <SpellFilters
          rankList={sortedRankList}
          activeSpellRank={activeSpellRank}
          setActiveSpellRank={setActiveSpellRank}
          defenseTypes={allDefenseTypes}
          defenseFilter={defenseFilter}
          setDefenseFilter={setDefenseFilter}
          themeColor={themeColor}
        />
      )}
      
      {/* Content based on active view */}
      {viewMode === 'spells' && hasSpellcasting && (
        <SpellsRepertoire 
          spells={spellsToDisplay}
          themeColor={themeColor}
          characterLevel={character.level}
          defenseFilter={defenseFilter}
          character={character}
        />
      )}
      
      {viewMode === 'innate' && hasInnate && (
        <InnateCastingList
          spells={spellsToDisplay}
          themeColor={themeColor}
          characterLevel={character.level}
          defenseFilter={defenseFilter}
          character={character}
        />
      )}
      
      {viewMode === 'focus' && hasFocus && (
        <FocusSpellsList 
          character={character} 
          characterColor={themeColor} 
        />
      )}
      
      {viewMode === 'staff' && hasStaff && (
        <StaffSpells 
          staff={character.staff}
          spells={spellsToDisplay}
          themeColor={themeColor}
          characterLevel={character.level}
          defenseFilter={defenseFilter}
          activeSpellRank={activeSpellRank}
          character={character}
        />
      )}
      
      {viewMode === 'scrolls' && hasScrolls && (
        <ScrollSpells 
          spells={spellsToDisplay}
          themeColor={themeColor}
          characterLevel={character.level}
          defenseFilter={defenseFilter}
          activeSpellRank={activeSpellRank}
          character={character}
        />
      )}
      
      {viewMode === 'wands' && hasWands && (
        <WandSpells 
          spells={spellsToDisplay}
          themeColor={themeColor}
          characterLevel={character.level}
          defenseFilter={defenseFilter}
          activeSpellRank={activeSpellRank}
          character={character}
        />
      )}

      {viewMode === 'gems' && hasGems && (
        <GemSpells 
          spells={spellsToDisplay}
          themeColor={themeColor}
          characterLevel={character.level}
          defenseFilter={defenseFilter}
          activeSpellRank={activeSpellRank}
          character={character}
        />
      )}
      
      {viewMode === 'eld' && hasEldPowers && (
        <EldPowers 
          eldPowers={eldPowers}
          themeColor={themeColor}
          characterLevel={character.level}
        />
      )}
      
      {/* Fallbacks for empty repertoires */}
      {viewMode === 'spells' && availableSpellRanks.length === 0 && hasSpellcasting && (
        <div className="empty-state">
          <p>No spells available for this character.</p>
        </div>
      )}
      
      {viewMode === 'innate' && (!hasInnate || innateSpells.length === 0) && (
        <div className="empty-state">
          <p>No innate spells available for this character.</p>
        </div>
      )}
    </div>
  );
};

export default SpellsList;