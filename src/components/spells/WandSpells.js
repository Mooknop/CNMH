import React from 'react';
import SpellCard from './SpellCard';
import { filterSpellsByDefense } from '../../utils/SpellUtils';

/**
 * Component to display wand spells
 * @param {Object} props
 * @param {Array} props.spells - Array of wand spells to display
 * @param {string} props.themeColor - Theme color from character
 * @param {number} props.characterLevel - Character's level
 * @param {string} props.defenseFilter - Active defense filter
 * @param {string} props.activeSpellRank - Active rank filter
 */
const WandSpells = ({ spells, themeColor, characterLevel, defenseFilter, activeSpellRank }) => {
  // Filter spells by defense type
  const filteredSpells = filterSpellsByDefense(spells, defenseFilter);
  
  return (
    <div className="wands-container">
      <div className="wands-details">
        <h3 style={{ color: themeColor }}>Wands</h3>
        <p className="wands-description">
          Wands allow you to cast a specific spell once per day without expending your own spell slots.
          Unlike scrolls, wands are not consumed when used and recharge each day at dawn.
        </p>
        
        {/* Wand usage rules section */}
        <div className="bloodline-info">
          <h3 style={{ color: themeColor }}>Using Wand</h3>
          <p className="bloodline-description">
            To cast a spell from a wand, you must hold the wand in one hand and activate it with a Cast a Spell activity. 
            This uses the spell's normal number of actions. A spell cast from a wand has the standard effects of that spell for someone 
            of your level, without the need to meet the spell's requirements. A wand's spells are automatically heightened to half the 
            wand's level rounded up. Each wand can be used to cast its spell only once per day without risking the wand's destruction
          </p>
          <div className="bloodline-magic">
            <span className="bloodline-magic-label">Overchanging Wands:</span>
            <span className="bloodline-magic-effect">
              After the spell is cast from the wand for the day, you can attempt to cast it one more time—overcharging the wand at the risk of destroying it.
              Cast the Spell again, then roll a DC 10 flat check. On a success, the wand is broken.
              On a failure, the wand is destroyed.
              If anyone tries to overcharge a wand when it’s already been overcharged that day, the wand is automatically destroyed (even if it had been repaired) and no spell is cast.
            </span>
          </div>
        </div>        
        {filteredSpells.length > 0 ? (
          <div className="wands-spells-list">
            <div className="spells-grid">
              {filteredSpells.map(spell => (
                <SpellCard 
                  key={`${spell.id}-wand`}
                  spell={{
                    ...spell,
                    fromWand: true,
                    wandName: spell.wandName || "Wand"
                  }}
                  themeColor={themeColor}
                  characterLevel={characterLevel}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-wands-spells">
            {activeSpellRank !== 'all' || defenseFilter !== 'all' ? (
              <p>No wand spells matching your current filters.</p>
            ) : (
              <p>No wands found in your inventory.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WandSpells;