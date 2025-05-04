import React from 'react';
import SpellCard from './SpellCard';
import TraitTag from '../shared/TraitTag';
import { filterSpellsByDefense } from '../../utils/SpellUtils';

/**
 * Component to display spell gems
 * @param {Object} props
 * @param {Array} props.spells - Array of gem spells to display
 * @param {string} props.themeColor - Theme color from character
 * @param {number} props.characterLevel - Character's level
 * @param {string} props.defenseFilter - Active defense filter
 * @param {string} props.activeSpellRank - Active rank filter
 */
const GemSpells = ({ spells, themeColor, characterLevel, defenseFilter, activeSpellRank }) => {
  // Filter spells by defense type
  const filteredSpells = filterSpellsByDefense(spells, defenseFilter);
  
  return (
    <div className="gems-container">
      <div className="gems-details">
        <h3 style={{ color: themeColor }}>Spell Gems</h3>
        <p className="gems-description">
          Spell gems contain the magical script necessary to cast a specific spell once.
          These latticed gemstones are suspended in silicon casings and function similar to scrolls,
          containing encoded magical energy that can be released by anyone who knows how to activate them.
        </p>
        
        {/* Gem usage rules section */}
        <div className="bloodline-info">
          <h3 style={{ color: themeColor }}>Using Spell Gems</h3>
          <p className="bloodline-description">
            To cast a spell from a gem, you must hold the gem in one hand and activate it with a Cast a Spell activity.
            A spell gem can be used only once, and it's consumed when the spell is cast or the gem is destroyed.
          </p>
        </div>
        
        {filteredSpells.length > 0 ? (
          <div className="gems-spells-list">
            <div className="spells-grid">
              {filteredSpells.map(spell => (
                <SpellCard 
                  key={`${spell.id}-gem`}
                  spell={spell}
                  themeColor={themeColor}
                  characterLevel={characterLevel}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-gems-spells">
            {activeSpellRank !== 'all' || defenseFilter !== 'all' ? (
              <p>No spell gems matching your current filters.</p>
            ) : (
              <p>No spell gems found in your inventory.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GemSpells;