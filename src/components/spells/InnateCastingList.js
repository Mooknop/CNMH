// src/components/spells/InnateCastingList.js
import React from 'react';
import SpellCard from './SpellCard';
import TraitTag from '../shared/TraitTag';
import { filterSpellsByDefense } from '../../utils/SpellUtils';

/**
 * Component to display innate spells
 * @param {Object} props
 * @param {Array} props.spells - Array of innate spells to display
 * @param {string} props.themeColor - Theme color from character
 * @param {number} props.characterLevel - Character's level
 * @param {string} props.defenseFilter - Active defense filter
 * @param {Object} props.character - Character data for additional context
 */
const InnateCastingList = ({ spells, themeColor, characterLevel, defenseFilter, character }) => {
  // Filter spells by defense type
  const filteredSpells = filterSpellsByDefense(spells, defenseFilter);
  
  return (
    <div className="innate-spells-container">
      <div className="innate-details">
        <h3 style={{ color: themeColor }}>Innate Spellcasting</h3>
        <p className="innate-description">
          Innate spells are magical abilities that you can cast without a spellcasting class. These often come from
          your ancestry, feats, or other special abilities. Unlike normal spells, innate spells don't require spell slots.
        </p>
        
        {/* Innate casting rules section */}
        <div className="bloodline-info">
          <h3 style={{ color: themeColor }}>Innate Spellcasting Rules</h3>
          <p className="bloodline-description">
            Innate spells don't use spell slots, and you can cast them a specified number of times per day.
            If an innate spell is a cantrip, you can cast it at will, as often as you want.
            Innate cantrips are heightened to half your level rounded up, like other cantrips.
          </p>
          <div className="bloodline-magic">
            <span className="bloodline-magic-effect">
              The ability score you use for innate spell attacks and DCs (usually Charisma) is determined 
              by the source of your innate spells. Most innate spells are limited to a certain number of 
              uses per day. You can't use abilities that let you cast more spells, such as Drain 
              Bonded Item, to cast more innate spells.
            </span>
          </div>
        </div>        
        {filteredSpells.length > 0 ? (
          <div className="innate-spells-list">
            <div className="spells-grid">
              {filteredSpells.map(spell => (
                <SpellCard 
                  key={spell.id}
                  spell={{
                    ...spell,
                    fromInnate: true,
                    innateSource: spell.innateSource
                  }}
                  themeColor={themeColor}
                  characterLevel={characterLevel}
                  character={character}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-staff-spells">
            {defenseFilter !== 'all' ? (
              <p>No innate spells matching your current filters.</p>
            ) : (
              <p>This character doesn't have any innate spellcasting abilities.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InnateCastingList;