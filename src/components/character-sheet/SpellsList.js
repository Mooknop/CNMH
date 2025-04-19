import React, { useState } from 'react';
import './SpellsList.css';
import { 
  getAbilityModifier, 
  getProficiencyBonus, 
  getProficiencyLabel 
} from '../../utils/CharacterUtils';

const SpellsList = ({ character }) => {
  const [activeSpellRank, setActiveSpellRank] = useState('all');
  const [defenseFilter, setDefenseFilter] = useState('all');
  
  // Get spell data from character
  const spellcasting = character.spellcasting || {};
  
  // If no spellcasting data exists, show placeholder
  if (!spellcasting.tradition) {
    return (
      <div className="spells-list">
        <h2>Spellcasting</h2>
        <div className="empty-state">
          <p>This character doesn't have spellcasting abilities.</p>
        </div>
      </div>
    );
  }
  
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
  
  // Populate spells by rank
  if (spellcasting.spells) {
    spellcasting.spells.forEach(spell => {
      const rank = spell.level === 0 ? 'cantrips' : spell.level;
      if (spellsByRank[rank]) {
        spellsByRank[rank].push(spell);
      }
    });
  }
  
  // Get available spell ranks (only show ranks that have spells)
  const availableSpellRanks = Object.keys(spellsByRank).filter(
    rank => spellsByRank[rank].length > 0
  );
  
  // Format spell rank for display
  const formatSpellRank = (rank) => {
    if (rank === 'cantrips') return 'Cantrips';
    if (rank === 'all') return 'All Spells';
    return `Rank ${rank}`;
  };

  // Get all unique defense types from spells
  const getAllDefenseTypes = () => {
    const defenseTypes = new Set(['all']);
    
    if (spellcasting.spells) {
      spellcasting.spells.forEach(spell => {
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

  // Get spells to display based on active rank
  const getSpellsToDisplay = () => {
    if (activeSpellRank === 'all') {
      return getAllSpells();
    }
    return spellsByRank[activeSpellRank] || [];
  };

  // Create sorted rank list with cantrips first and then all option
  const getSortedRankList = () => {
    let sortedRanks = ['all'];
    
    // Add cantrips if available
    if (availableSpellRanks.includes('cantrips')) {
      sortedRanks.push('cantrips');
    }
    
    // Add numbered ranks in order
    for (let i = 1; i <= 10; i++) {
      if (availableSpellRanks.includes(i.toString())) {
        sortedRanks.push(i.toString());
      }
    }
    
    return sortedRanks;
  };

  const sortedRankList = getSortedRankList();
  const spellsToDisplay = getSpellsToDisplay();
  const filteredSpells = filterSpellsByDefense(spellsToDisplay);

  return (
    <div className="spells-list">
      <h2>Spellcasting</h2>
      
      <div className="spellcasting-stats">
        <div className="spellcasting-tradition">
          <span className="stat-label">Tradition</span>
          <span className="stat-value">{spellcasting.tradition}</span>
        </div>
        <div className="spellcasting-ability">
          <span className="stat-label">Ability</span>
          <span className="stat-value">
            {spellcasting.ability.charAt(0).toUpperCase() + spellcasting.ability.slice(1)}
          </span>
        </div>
        <div className="spell-proficiency">
          <span className="stat-label">Proficiency</span>
          <span className="stat-value">{getProficiencyLabel(spellcasting.proficiency)}</span>
        </div>
        <div className="spell-attack">
          <span className="stat-label">Spell Attack</span>
          <span className="stat-value">+{spellAttackMod}</span>
        </div>
        <div className="spell-dc">
          <span className="stat-label">Spell DC</span>
          <span className="stat-value">{spellDC}</span>
        </div>
        {spellcasting.focus && (
          <div className="focus-points">
            <span className="stat-label">Focus Points</span>
            <span className="stat-value">{spellcasting.focus.current}/{spellcasting.focus.max}</span>
          </div>
        )}
      </div>
      
      {availableSpellRanks.length > 0 ? (
        <div className="spell-ranks-container">
          <div className="spell-level-tabs">
            {sortedRankList.map(rank => (
              <button
                key={rank}
                className={`spell-level-tab ${activeSpellRank === rank ? 'active' : ''}`}
                onClick={() => setActiveSpellRank(rank)}
              >
                {formatSpellRank(rank)}
              </button>
            ))}
          </div>
          
          {defenseTypes.length > 1 && (
            <div className="defense-filter">
              <span className="filter-label">Filter by Defense:</span>
              <div className="defense-buttons">
                {defenseTypes.map(defense => (
                  <button
                    key={defense}
                    className={`defense-filter-btn ${defenseFilter === defense ? 'active' : ''}`}
                    onClick={() => setDefenseFilter(defense)}
                  >
                    {defense === 'all' ? 'All' : defense === 'none' ? 'None' : defense}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="spells-container">
            {filteredSpells.length > 0 ? (
              <div className="spells-grid">
                {filteredSpells.map(spell => (
                  <div key={spell.id} className="spell-card">
                    <div className="spell-header">
                      <h3>{spell.name}</h3>
                      <span className="spell-rank-indicator">
                        {spell.level === 0 
                          ? `Cantrip (${Math.ceil(character.level / 2)})`
                          : `Rank ${spell.level}`
                        }
                      </span>
                      {spell.prepared !== undefined && (
                        <div className={`prepared-indicator ${spell.prepared ? 'prepared' : 'not-prepared'}`}>
                          {spell.prepared ? 'Prepared' : 'Not Prepared'}
                        </div>
                      )}
                    </div>
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
                        <span className="heightened-label">Heightened:</span>
                        {Object.entries(spell.heightened).map(([level, effect], index) => (
                          <div key={index} className="heightened-entry">
                            <span className="heightened-level">{level}:</span>
                            <span className="heightened-effect">{effect}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>No spells matching your current filters.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <p>No spells available for this character.</p>
        </div>
      )}
    </div>
  );
};

export default SpellsList;