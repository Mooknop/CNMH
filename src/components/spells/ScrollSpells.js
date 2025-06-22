import React from 'react';
import SpellCard from './SpellCard';
import TraitTag from '../shared/TraitTag';
import { filterSpellsByDefense } from '../../utils/SpellUtils';

/**
 * Component to display scroll spells
 * @param {Object} props
 * @param {Array} props.spells - Array of scroll spells to display
 * @param {string} props.themeColor - Theme color from character
 * @param {number} props.characterLevel - Character's level
 * @param {string} props.defenseFilter - Active defense filter
 * @param {string} props.activeSpellRank - Active rank filter
 */
const ScrollSpells = ({ spells, themeColor, characterLevel, defenseFilter, activeSpellRank }) => {
  // Filter spells by defense type
  const filteredSpells = filterSpellsByDefense(spells, defenseFilter);
  
  return (
    <div className="scrolls-container">
      <div className="scrolls-details">
        <h3 style={{ color: themeColor }}>Spell Scrolls</h3>
        <p className="scrolls-description">
          Spell scrolls allow any magic user to cast the spell written upon them, 
          even if they don't know the spell themselves, so long as the spell is part 
          of their magical tradition.
        </p>
        
        {filteredSpells.length > 0 ? (
          <div className="scrolls-spells-list">
            <div className="spells-grid">
              {filteredSpells.map(spell => (
                <SpellCard 
                  key={`${spell.id}-scroll`}
                  spell={spell}
                  themeColor={themeColor}
                  characterLevel={characterLevel}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-scrolls-spells">
            {activeSpellRank !== 'all' || defenseFilter !== 'all' ? (
              <p>No scroll spells matching your current filters.</p>
            ) : (
              <p>No spell scrolls found in your inventory.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScrollSpells;