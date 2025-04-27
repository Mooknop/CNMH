import React, { useState, useMemo } from 'react';
import './SpellsList.css';

// Component imports
import SpellsHeader from './SpellsHeader';
import ViewModeToggle from './ViewModeToggle';
import SpellFilters from './SpellFilters';
import SpellsRepertoire from './SpellsRepertoire';
import StaffSpells from './StaffSpells';
import ScrollSpells from './ScrollSpells';
import WandSpells from './WandSpells';
import { 
  organizeSpellsByRank, 
  getAvailableRanks,
  getDefenseTypes,
  filterSpellsByRank,
  getSortedRankList,
  findScrollItems,
  extractScrollSpells,
  findWandItems,
  extractWandSpells
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
  const [viewMode, setViewMode] = useState('spells'); // 'spells', 'staff', or 'scrolls'
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';
  
  // Get spell data from character
  const spellcasting = character.spellcasting || {};
  
  // Use memoization for preparing spell data to avoid recalculating on every render
  const {
    hasSpellcasting,
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
    availableSpellRanks,
    availableStaffSpellRanks,
    availableScrollSpellRanks,
    availableWandSpellRanks,
    allAvailableRanks,
    sortedRankList,
    allDefenseTypes
  } = useMemo(() => {
    // Check if character has spellcasting
    const hasSpellcasting = !!spellcasting.tradition;
    
    // If no spellcasting, return early with default values
    if (!hasSpellcasting) {
      return {
        hasSpellcasting: false,
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
        availableSpellRanks: [],
        availableStaffSpellRanks: [],
        availableScrollSpellRanks: [],
        availableWandSpellRanks: [],
        allAvailableRanks: [],
        sortedRankList: [],
        allDefenseTypes: []
      };
    }
    
    // Find scrolls in inventory
    const scrollItems = findScrollItems(character);
    const hasScrolls = scrollItems.length > 0;
    
    // Extract scroll spells
    const scrollSpells = hasScrolls ? extractScrollSpells(scrollItems) : [];
    
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
    
    // Get available ranks from each source
    const availableSpellRanks = getAvailableRanks(spellsByRank);
    const availableStaffSpellRanks = getAvailableRanks(staffSpellsByRank);
    const availableScrollSpellRanks = getAvailableRanks(scrollSpellsByRank);
    const availableWandSpellRanks = getAvailableRanks(wandSpellsByRank);
    
    // Combine available ranks from all sources
    const allAvailableRanks = [...new Set([
      ...availableSpellRanks, 
      ...availableStaffSpellRanks,
      ...availableScrollSpellRanks,
      ...availableWandSpellRanks
    ])];
    
    // Create sorted rank list
    const sortedRankList = getSortedRankList(allAvailableRanks);
    
    // Get all defense types from all spells
    const allSpells = [
      ...(spellcasting.spells || []),
      ...staffSpells,
      ...scrollSpells,
      ...wandSpells
    ];
    
    const allDefenseTypes = getDefenseTypes(allSpells);
    
    return {
      hasSpellcasting,
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
      availableSpellRanks,
      availableStaffSpellRanks,
      availableScrollSpellRanks,
      availableWandSpellRanks,
      allAvailableRanks,
      sortedRankList,
      allDefenseTypes
    };
  }, [character, spellcasting]);
  
  // If no spellcasting data exists, show placeholder
  if (!hasSpellcasting) {
    return (
      <div className="spells-list">
        <h2 style={{ color: themeColor }}>Spellcasting</h2>
        <div className="empty-state">
          <p>This character doesn't have spellcasting abilities.</p>
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
    else if (viewMode === 'staff') {
      return filterSpellsByRank(staffSpells, activeSpellRank);
    } 
    else if (viewMode === 'scrolls') {
      return filterSpellsByRank(scrollSpells, activeSpellRank);
    }
    else if (viewMode === 'wands') {
      return filterSpellsByRank(wandSpells, activeSpellRank);
    }
    
    return [];
  };
  
  // Get spells to display based on current filters
  const spellsToDisplay = getSpellsToDisplay();
  
  return (
    <div className="spells-list">
      {/* Spellcasting statistics */}
      <SpellsHeader 
        character={character} 
        themeColor={themeColor} 
      />
      
      {/* View mode toggle */}
      <ViewModeToggle 
        viewMode={viewMode}
        setViewMode={setViewMode}
        hasStaff={hasStaff}
        hasScrolls={hasScrolls}
        hasWands={hasWands}
        staff={character.staff || {}}
        themeColor={themeColor}
      />
      
      {/* Filters that work across all tabs */}
      {allAvailableRanks.length > 0 && (
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
      {viewMode === 'spells' && (
        <SpellsRepertoire 
          spells={spellsToDisplay}
          themeColor={themeColor}
          characterLevel={character.level}
          defenseFilter={defenseFilter}
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
        />
      )}
      
      {viewMode === 'scrolls' && hasScrolls && (
        <ScrollSpells 
          spells={spellsToDisplay}
          themeColor={themeColor}
          characterLevel={character.level}
          defenseFilter={defenseFilter}
          activeSpellRank={activeSpellRank}
        />
      )}
      
      {viewMode === 'wands' && hasWands && (
        <WandSpells 
          spells={spellsToDisplay}
          themeColor={themeColor}
          characterLevel={character.level}
          defenseFilter={defenseFilter}
          activeSpellRank={activeSpellRank}
        />
      )}
      
      {/* Fallback for empty repertoire */}
      {viewMode === 'spells' && availableSpellRanks.length === 0 && (
        <div className="empty-state">
          <p>No spells available for this character.</p>
        </div>
      )}
    </div>
  );
};

export default SpellsList;