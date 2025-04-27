import React, { useState, useEffect } from 'react';
import './SpellsList.css';
import CollapsibleCard from '../shared/CollapsibleCard';
import { 
  getAbilityModifier, 
  getProficiencyBonus, 
  getProficiencyLabel 
} from '../../utils/CharacterUtils';

const SpellsList = ({ character, characterColor }) => {
  const [activeSpellRank, setActiveSpellRank] = useState('all');
  const [defenseFilter, setDefenseFilter] = useState('all');
  const [viewMode, setViewMode] = useState('spells'); // 'spells', 'staff', or 'scrolls'
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';
  
  // Get spell data from character
  const spellcasting = character.spellcasting || {};
  
  // If no spellcasting data exists, show placeholder
  if (!spellcasting.tradition) {
    return (
      <div className="spells-list">
        <h2 style={{ color: themeColor }}>Spellcasting</h2>
        <div className="empty-state">
          <p>This character doesn't have spellcasting abilities.</p>
        </div>
      </div>
    );
  }
  
  // Check if character has a staff object
  const hasStaff = character.staff && character.staff.name;
  
  // Find scrolls in inventory
  const scrollItems = character.inventory
    ? character.inventory.filter(item => 
        item.name.toLowerCase().includes('scroll') && item.spells && item.spells.length > 0)
    : [];
  
  // Check if character has scrolls
  const hasScrolls = scrollItems.length > 0;
  
  // Get all scroll spells
  const scrollSpells = hasScrolls 
    ? scrollItems.flatMap(item => item.spells.map(spell => ({
        ...spell,
        scrollName: item.name, // Add the scroll name for reference
        fromScroll: true // Mark as scroll spell
      })))
    : [];
  
  // Staff spells (if available in the character data)
  const staffSpells = character.staff ? character.staff.spells || [] : [];
  
  // Calculate spell attack and DC
  const getSpellModifier = () => {
    const abilityMod = getAbilityModifier(character.abilities?.[spellcasting.ability] || 10);
    const proficiencyValue = spellcasting.proficiency || 0;
    
    // Calculate proficiency bonus
    const proficiencyMod = getProficiencyBonus(proficiencyValue, character.level || 0);
    
    return abilityMod + proficiencyMod;
  };
  
  const spellAttackMod = getSpellModifier();
  const spellDC = 10 + spellAttackMod;
  
  // Organize spells by rank
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
  
  // Populate spells by rank from character's spell repertoire
  if (spellcasting.spells) {
    spellcasting.spells.forEach(spell => {
      const rank = spell.level === 0 ? 'cantrips' : spell.level;
      if (spellsByRank[rank]) {
        spellsByRank[rank].push(spell);
      }
    });
  }

  // Organize staff spells by rank
  const staffSpellsByRank = {
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

  // Populate staff spells by rank
  if (staffSpells.length > 0) {
    staffSpells.forEach(spell => {
      const rank = spell.level === 0 ? 'cantrips' : spell.level;
      if (staffSpellsByRank[rank]) {
        staffSpellsByRank[rank].push(spell);
      }
    });
  }
  
  // Organize scroll spells by rank
  const scrollSpellsByRank = {
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
  
  // Populate scroll spells by rank
  if (scrollSpells.length > 0) {
    scrollSpells.forEach(spell => {
      const rank = spell.level === 0 ? 'cantrips' : spell.level;
      if (scrollSpellsByRank[rank]) {
        scrollSpellsByRank[rank].push(spell);
      }
    });
  }
  
  // Get available spell ranks from all sources (only show ranks that have spells)
  const availableSpellRanks = Object.keys(spellsByRank).filter(
    rank => spellsByRank[rank].length > 0
  );

  const availableStaffSpellRanks = Object.keys(staffSpellsByRank).filter(
    rank => staffSpellsByRank[rank].length > 0
  );
  
  const availableScrollSpellRanks = Object.keys(scrollSpellsByRank).filter(
    rank => scrollSpellsByRank[rank].length > 0
  );

  // Combine available ranks from all sources
  const allAvailableRanks = [...new Set([
    ...availableSpellRanks, 
    ...availableStaffSpellRanks,
    ...availableScrollSpellRanks
  ])];
  
  // Format spell rank for display
  const formatSpellRank = (rank) => {
    if (rank === 'cantrips') return 'Cantrips';
    if (rank === 'all') return 'All Spells';
    return `Rank ${rank}`;
  };

  // Get all unique defense types from all spells
  const getAllDefenseTypes = () => {
    const defenseTypes = new Set(['all']);
    
    // Add defense types from regular spells
    if (spellcasting.spells) {
      spellcasting.spells.forEach(spell => {
        if (spell.defense) {
          defenseTypes.add(spell.defense);
        }
      });
    }

    // Add defense types from staff spells
    if (staffSpells.length > 0) {
      staffSpells.forEach(spell => {
        if (spell.defense) {
          defenseTypes.add(spell.defense);
        }
      });
    }
    
    // Add defense types from scroll spells
    if (scrollSpells.length > 0) {
      scrollSpells.forEach(spell => {
        if (spell.defense) {
          defenseTypes.add(spell.defense);
        }
      });
    }
    
    return Array.from(defenseTypes);
  };
  
  const defenseTypes = getAllDefenseTypes();

  // Filter spells by defense type
  const filterSpellsByDefense = (spells) => {
    if (defenseFilter === 'all') {
      return spells;
    }
    
    return spells.filter(spell => 
      spell.defense === defenseFilter || 
      (!spell.defense && defenseFilter === 'none')
    );
  };

  // Filter spells by rank
  const filterSpellsByRank = (spells) => {
    if (activeSpellRank === 'all') {
      return spells;
    }
    
    if (activeSpellRank === 'cantrips') {
      return spells.filter(spell => spell.level === 0);
    }
    
    return spells.filter(spell => spell.level === parseInt(activeSpellRank));
  };

  // Get all spells for display
  const getAllSpells = () => {
    let allSpells = [];
    // Add cantrips first
    if (spellsByRank['cantrips'] && spellsByRank['cantrips'].length > 0) {
      allSpells = [...spellsByRank['cantrips']];
    }
    
    // Add other ranks in order
    for (let i = 1; i <= 10; i++) {
      if (spellsByRank[i] && spellsByRank[i].length > 0) {
        allSpells = [...allSpells, ...spellsByRank[i]];
      }
    }
    
    return allSpells;
  };

  // Get all staff spells for display
  const getAllStaffSpells = () => {
    return staffSpells;
  };
  
  // Get all scroll spells for display
  const getAllScrollSpells = () => {
    return scrollSpells;
  };

  // Get spells to display based on active rank and view mode
  const getSpellsToDisplay = () => {
    if (viewMode === 'spells') {
      if (activeSpellRank === 'all') {
        return getAllSpells();
      }
      return spellsByRank[activeSpellRank] || [];
    } else if (viewMode === 'staff') {
      return filterSpellsByRank(getAllStaffSpells());
    } else if (viewMode === 'scrolls') {
      return filterSpellsByRank(getAllScrollSpells());
    }
    return [];
  };

  // Create sorted rank list with cantrips first and then all option
  const getSortedRankList = () => {
    let sortedRanks = ['all'];
    
    // Add cantrips if available in either source
    if (allAvailableRanks.includes('cantrips')) {
      sortedRanks.push('cantrips');
    }
    
    // Add numbered ranks in order
    for (let i = 1; i <= 10; i++) {
      if (allAvailableRanks.includes(i.toString())) {
        sortedRanks.push(i.toString());
      }
    }
    
    return sortedRanks;
  };

  const sortedRankList = getSortedRankList();
  const spellsToDisplay = getSpellsToDisplay();
  const filteredSpells = filterSpellsByDefense(spellsToDisplay);
  
  // Render a spell card 
  const renderSpellCard = (spell) => {
    // Create header content
    const header = (
      <>
        <h3 style={{ color: themeColor }}>{spell.name}</h3>
        <div className="spell-header-meta">
          <span className="spell-rank-indicator" style={{ backgroundColor: themeColor }}>
            {spell.level === 0 
              ? `Cantrip ${spell.baseLevel} (${Math.ceil(character.level / 2)})`
              : `Rank ${spell.level}`
            }
          </span>
          {spell.prepared !== undefined && (
            <div className={`prepared-indicator ${spell.prepared ? 'prepared' : 'not-prepared'}`}>
              {spell.prepared ? 'Prepared' : 'Not Prepared'}
            </div>
          )}
          {spell.fromScroll && (
            <div className="scroll-indicator">
              {spell.scrollName}
            </div>
          )}
        </div>
      </>
    );
    
    // Create content
    const content = (
      <>
        <div className="spell-meta">
          {spell.traits && spell.traits.map((trait, index) => (
            <span key={index} className="spell-trait">{trait}</span>
          ))}
        </div>
        <div className="spell-details">
          {spell.actions && (
            <div className="spell-actions">
              <span className="detail-label">Actions:</span>
              <span className="detail-value">{spell.actions}</span>
            </div>
          )}
          {spell.defense && (
            <div className="spell-defense">
              <span className="detail-label">Defense:</span>
              <span className="detail-value">{spell.defense}</span>
            </div>
          )}
          {spell.range && (
            <div className="spell-range">
              <span className="detail-label">Range:</span>
              <span className="detail-value">{spell.range}</span>
            </div>
          )}
          {spell.targets && (
            <div className="spell-targets">
              <span className="detail-label">Targets:</span>
              <span className="detail-value">{spell.targets}</span>
            </div>
          )}
          {spell.duration && (
            <div className="spell-duration">
              <span className="detail-label">Duration:</span>
              <span className="detail-value">{spell.duration}</span>
            </div>
          )}
        </div>
        <div className="spell-description">
          {spell.description}
        </div>
        {spell.heightened && (
          <div className="spell-heightened">
            <span className="heightened-label" style={{ color: themeColor }}>Heightened:</span>
            {Object.entries(spell.heightened).map(([level, effect], index) => (
              <div key={index} className="heightened-entry">
                <span className="heightened-level">{level}:</span>
                <span className="heightened-effect">{effect}</span>
              </div>
            ))}
          </div>
        )}
      </>
    );
    
    return (
      <CollapsibleCard 
        key={spell.id + (spell.fromScroll ? '-scroll' : '')}
        className="spell-card"
        header={header}
        themeColor={themeColor}
        initialExpanded={false}
      >
        {content}
      </CollapsibleCard>
    );
  };

  return (
    <div className="spells-list">      
      <div className="spellcasting-stats">
        <div className="spellcasting-tradition">
          <span className="stat-label">Tradition</span>
          <span className="stat-value" style={{ color: themeColor }}>{spellcasting.tradition}</span>
        </div>
        <div className="spell-proficiency">
          <span className="stat-label">Proficiency</span>
          <span className="stat-value" style={{ color: themeColor }}>{getProficiencyLabel(spellcasting.proficiency)}</span>
        </div>
        <div className="spell-attack">
          <span className="stat-label">Spell Attack</span>
          <span className="stat-value" style={{ color: themeColor }}>+{spellAttackMod}</span>
        </div>
        <div className="spell-dc">
          <span className="stat-label">Spell DC</span>
          <span className="stat-value" style={{ color: themeColor }}>{spellDC}</span>
        </div>
      </div>
      
      {/* View Mode Toggle for all tabs if needed */}
      <div className="view-mode-toggle">
        <button 
          className={`view-mode-btn ${viewMode === 'spells' ? 'active' : ''}`}
          onClick={() => setViewMode('spells')}
          style={{ 
            backgroundColor: viewMode === 'spells' ? themeColor : '',
            borderColor: viewMode === 'spells' ? themeColor : ''
          }}
        >
          Repertoire
        </button>
        
        {hasStaff && (
          <button 
            className={`view-mode-btn ${viewMode === 'staff' ? 'active' : ''}`}
            onClick={() => setViewMode('staff')}
            style={{ 
              backgroundColor: viewMode === 'staff' ? themeColor : '',
              borderColor: viewMode === 'staff' ? themeColor : ''
            }}
          >
            {character.staff.name}
          </button>
        )}
        
        {hasScrolls && (
          <button 
            className={`view-mode-btn ${viewMode === 'scrolls' ? 'active' : ''}`}
            onClick={() => setViewMode('scrolls')}
            style={{ 
              backgroundColor: viewMode === 'scrolls' ? themeColor : '',
              borderColor: viewMode === 'scrolls' ? themeColor : ''
            }}
          >
            Scrolls
          </button>
        )}
      </div>
      
      {/* Global filters that work for all tabs */}
      {allAvailableRanks.length > 0 && (
        <div className="spell-filters-container">
          {/* Spell rank filter */}
          <div className="spell-level-tabs">
            {sortedRankList.map(rank => (
              <button
                key={rank}
                className={`spell-level-tab ${activeSpellRank === rank ? 'active' : ''}`}
                onClick={() => setActiveSpellRank(rank)}
                style={{ 
                  backgroundColor: activeSpellRank === rank ? themeColor : '',
                  borderColor: activeSpellRank === rank ? themeColor : ''
                }}
              >
                {formatSpellRank(rank)}
              </button>
            ))}
          </div>
          
          {/* Defense type filter */}
          {defenseTypes.length > 1 && (
            <div className="defense-filter">
              <span className="filter-label" style={{ color: themeColor }}>Filter by Defense:</span>
              <div className="defense-buttons">
                {defenseTypes.map(defense => (
                  <button
                    key={defense}
                    className={`defense-filter-btn ${defenseFilter === defense ? 'active' : ''}`}
                    onClick={() => setDefenseFilter(defense)}
                    style={{ 
                      backgroundColor: defenseFilter === defense ? themeColor : '',
                      borderColor: defenseFilter === defense ? themeColor : ''
                    }}
                  >
                    {defense === 'all' ? 'All' : defense === 'none' ? 'None' : defense}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Regular Spells View */}
      {viewMode === 'spells' && availableSpellRanks.length > 0 && (
        <div className="spells-container">
          {filteredSpells.length > 0 ? (
            <div className="spells-grid">
              {filteredSpells.map(spell => renderSpellCard(spell))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No spells matching your current filters.</p>
            </div>
          )}
        </div>
      )}
      
      {/* Staff Spells View - Only shown if character has a staff */}
      {viewMode === 'staff' && hasStaff && (
        <div className="staff-container">
          <div className="staff-details">
            <h3 style={{ color: themeColor }}>{character.staff.name}</h3>
            <p className="staff-description">{character.staff.description || "A magical staff that can store spells."}</p>
            
            {/* Staff usage rules section */}
            <div className="staff-rules">
              <h4 style={{ color: themeColor }}>Staff Rules</h4>
              <p>Each day during your daily preparations, you can prepare a staff to add charges to it for free. 
              This gives the staff a number of charges equal to the level of your highest-level spell slot. 
              You can use these charges to cast spells from the staff.</p>
            </div>
            
            {filteredSpells.length > 0 ? (
              <div className="staff-spells-list">
                <h4 style={{ color: themeColor }}>Available Staff Spells</h4>
                <div className="spells-grid">
                  {filteredSpells.map(spell => renderSpellCard(spell))}
                </div>
              </div>
            ) : (
              <div className="empty-staff-spells">
                <h4 style={{ color: themeColor }}>Available Staff Spells</h4>
                {activeSpellRank !== 'all' || defenseFilter !== 'all' ? (
                  <p>No staff spells matching your current filters.</p>
                ) : (
                  <>
                    <p>This staff does not have any spells specified in the character data. 
                       Staff spells should be added to the character's staff object under a "spells" property.</p>
                    
                    <div className="staff-placeholder">
                      <h5 style={{ color: themeColor }}>Default Staff Functionality</h5>
                      <p>Staves typically contain a selection of thematically linked spells that can be cast by 
                      expending charges from the staff. The exact spells depend on the type of staff and its magical properties.</p>
                      <p>Consult your Game Master or the Pathfinder 2E rulebook for details on your specific staff's capabilities.</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Scrolls View - Only shown if character has scrolls */}
      {viewMode === 'scrolls' && hasScrolls && (
        <div className="scrolls-container">
          <div className="scrolls-details">
            <h3 style={{ color: themeColor }}>Spell Scrolls</h3>
            <p className="scrolls-description">Spell scrolls allow any magic user to cast the spell written upon them, even if they don't know the spell themselves, so long as the spell is part of their magical tradition.</p>
            
            {/* Scroll usage rules section */}
            <div className="scrolls-rules">
              <h4 style={{ color: themeColor }}>Scroll Rules</h4>
              <p>To cast a spell from a scroll, you must hold the scroll in one hand and activate it with a Cast a Spell activity. 
              A scroll can be used only once, and it's consumed when the spell is cast or the scroll is destroyed.</p>
            </div>
            
            {filteredSpells.length > 0 ? (
              <div className="scrolls-spells-list">
                <h4 style={{ color: themeColor }}>Available Scroll Spells</h4>
                <div className="spells-grid">
                  {filteredSpells.map(spell => renderSpellCard(spell))}
                </div>
              </div>
            ) : (
              <div className="empty-scrolls-spells">
                <h4 style={{ color: themeColor }}>Available Scroll Spells</h4>
                {activeSpellRank !== 'all' || defenseFilter !== 'all' ? (
                  <p>No scroll spells matching your current filters.</p>
                ) : (
                  <p>No spell scrolls found in your inventory.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      {viewMode === 'spells' && availableSpellRanks.length === 0 && (
        <div className="empty-state">
          <p>No spells available for this character.</p>
        </div>
      )}
    </div>
  );
};

export default SpellsList;