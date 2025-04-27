import React from 'react';
import SpellCard from './SpellCard';
import { filterSpellsByDefense } from '../../utils/SpellUtils';

/**
 * Component to display character's spell repertoire
 * @param {Object} props
 * @param {Array} props.spells - Array of spells to display
 * @param {string} props.themeColor - Theme color from character
 * @param {number} props.characterLevel - Character's level
 * @param {string} props.defenseFilter - Active defense filter
 * @param {Object} props.character - Full character data for bloodline effects
 */
const SpellsRepertoire = ({ 
  spells, 
  themeColor, 
  characterLevel, 
  defenseFilter,
  character 
}) => {
  // Filter spells by defense type
  const filteredSpells = filterSpellsByDefense(spells, defenseFilter);
  
  return (
    <div className="spells-container">
      <div className="bloodline-info">
        <h3 style={{ color: themeColor }}>Spell Repertoire</h3>
        <p className="bloodline-description">
          The collection of spells you can cast is called your spell repertoire.
          As you gain new spells in your spell repertoire, you might want to replace some of the spells you previously learned.
          Each time you gain a level and learn new spells, you can swap out one of your old spells for a different spell of the same rank.
          This spell can be a cantrip, but you can't swap out bloodline spells.
          You can also swap out spells by retraining during downtime.
        </p>
      </div>    
      {filteredSpells.length > 0 ? (
        <div className="spells-grid">
          {filteredSpells.map(spell => (
            <SpellCard 
              key={spell.id}
              spell={spell}
              themeColor={themeColor}
              characterLevel={characterLevel}
              character={character}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No spells matching your current filters.</p>
        </div>
      )}
    </div>
  );
};

export default SpellsRepertoire;