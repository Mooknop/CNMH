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
} from '../../utils/SpellUtils';
import Harrowing from './Harrowing';
import { useCharacter } from '../../hooks/useCharacter';

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

  // Data layer — all character reads go through this hook
  const {
    spellcasting,
    scrollSpells,
    wandSpells,
    gemSpells,
    innateSpells,
    staffSpells,
    staff,
    eldPowers,
    level,
    flags,
    champion,
    monk,
    characterClass,
  } = useCharacter(character);

  const {
    hasSpellcasting,
    hasFocusSpells: hasFocus,
    hasInnateSpells: hasInnate,
    hasScrolls,
    hasWands,
    hasGems,
    hasStaff,
    hasEldPowers,
    hasHarrowing,
  } = flags;

  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';

  // Organize spell data using SpellUtils (pure functions, no raw character access)
  const {
    spellsByRank,
    availableSpellRanks,
    allAvailableRanks,
    sortedRankList,
    allDefenseTypes,
  } = useMemo(() => {
    const staffSpellsByRank    = organizeSpellsByRank(staffSpells);
    const scrollSpellsByRank   = organizeSpellsByRank(scrollSpells);
    const wandSpellsByRank     = organizeSpellsByRank(wandSpells);
    const innateSpellsByRank   = organizeSpellsByRank(innateSpells);
    const gemSpellsByRank      = organizeSpellsByRank(gemSpells);
    const spellsByRank         = organizeSpellsByRank(spellcasting.spells || []);

    const availableSpellRanks      = getAvailableRanks(spellsByRank);
    const availableStaffSpellRanks = getAvailableRanks(staffSpellsByRank);
    const availableScrollSpellRanks= getAvailableRanks(scrollSpellsByRank);
    const availableWandSpellRanks  = getAvailableRanks(wandSpellsByRank);
    const availableInnateSpellRanks= getAvailableRanks(innateSpellsByRank);
    const availableGemSpellRanks   = getAvailableRanks(gemSpellsByRank);

    const allAvailableRanks = [...new Set([
      ...availableSpellRanks,
      ...availableStaffSpellRanks,
      ...availableScrollSpellRanks,
      ...availableWandSpellRanks,
      ...availableInnateSpellRanks,
      ...availableGemSpellRanks,
    ])];

    const sortedRankList = getSortedRankList(allAvailableRanks);

    const allSpells = [
      ...(spellcasting.spells || []),
      ...staffSpells,
      ...scrollSpells,
      ...wandSpells,
      ...innateSpells,
      ...gemSpells,
    ];
    const allDefenseTypes = getDefenseTypes(allSpells);

    return {
      spellsByRank,
      availableSpellRanks,
      allAvailableRanks,
      sortedRankList,
      allDefenseTypes,
    };
  }, [spellcasting, scrollSpells, wandSpells, gemSpells, innateSpells, staffSpells]);

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
      if (hasHarrowing) availableModes.push('harrow');
      
      // Set view mode to the first available one
      if (availableModes.length > 0) {
        setViewMode(availableModes[0]);
      } else {
        // Fallback to 'spells' if somehow there are no available modes
        setViewMode('spells');
      }
    }
  }, [hasSpellcasting, hasInnate, hasFocus, hasEldPowers, hasStaff, hasScrolls, hasWands, hasGems, viewMode, hasHarrowing]);
  
  // If no spellcasting, focus magic, innate spells, or eld powers, show placeholder
  if (!hasSpellcasting && !hasFocus && !hasInnate && !hasEldPowers && !hasHarrowing && !hasScrolls && !hasWands && !hasGems && !hasStaff) {
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
    if (champion) return 'Devotion Spells';
    if (monk) return 'Qi Spells';
    if (characterClass === 'Bard') return 'Compositions';
    if (spellcasting.bloodline) return 'Focus Spells';
    return 'Focus Spells';
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
        staff={staff || {}}
        focusLabel={getFocusSpellsLabel()}
        themeColor={themeColor}
        hasGems={hasGems}
        hasHarrowing={hasHarrowing}
      />
      
      {/* Filters that work across most tabs */}
      {allAvailableRanks.length > 0 && viewMode !== 'focus' && viewMode !== 'eld' && viewMode !== 'harrow' && (
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
          characterLevel={level}
          defenseFilter={defenseFilter}
          character={character}
        />
      )}
      
      {viewMode === 'innate' && hasInnate && (
        <InnateCastingList
          spells={spellsToDisplay}
          themeColor={themeColor}
          characterLevel={level}
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
          staff={staff}
          spells={spellsToDisplay}
          themeColor={themeColor}
          characterLevel={level}
          defenseFilter={defenseFilter}
          activeSpellRank={activeSpellRank}
          character={character}
        />
      )}
      
      {viewMode === 'scrolls' && hasScrolls && (
        <ScrollSpells 
          spells={spellsToDisplay}
          themeColor={themeColor}
          characterLevel={level}
          defenseFilter={defenseFilter}
          activeSpellRank={activeSpellRank}
          character={character}
        />
      )}
      
      {viewMode === 'wands' && hasWands && (
        <WandSpells 
          spells={spellsToDisplay}
          themeColor={themeColor}
          characterLevel={level}
          defenseFilter={defenseFilter}
          activeSpellRank={activeSpellRank}
          character={character}
        />
      )}

      {viewMode === 'gems' && hasGems && (
        <GemSpells 
          spells={spellsToDisplay}
          themeColor={themeColor}
          characterLevel={level}
          defenseFilter={defenseFilter}
          activeSpellRank={activeSpellRank}
          character={character}
        />
      )}
      
      {viewMode === 'eld' && hasEldPowers && (
        <EldPowers 
          eldPowers={eldPowers}
          themeColor={themeColor}
          characterLevel={level}
        />
      )}

      {viewMode === 'harrow' && hasHarrowing && (
        <Harrowing character={character} themeColor={characterColor}/>
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