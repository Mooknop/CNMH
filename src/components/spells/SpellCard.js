// src/components/spells/SpellCard.js
import React from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import TraitTag from '../shared/TraitTag';
import ActionIcon from '../shared/ActionIcon';

/**
 * Component to render a spell card with expandable details
 * @param {Object} props
 * @param {Object} props.spell - The spell data
 * @param {string} props.themeColor - Theme color from character
 * @param {number} props.characterLevel - Character's level for cantrip scaling
 * @param {Object} props.character - Character data for bloodline effects (optional)
 */
const SpellCard = ({ spell, themeColor, characterLevel, character }) => {
  // Create header content for the card
  const header = (
    <>
      <h3 style={{ color: themeColor }}>{spell.name}</h3>
      <div className="spell-header-meta">
        {/* Action indicators now come first */}
        {spell.actions && (
          <div className="spell-actions-indicator">
            <ActionIcon actionText={spell.actions} color={themeColor} />
          </div>
        )}
        <span className="spell-rank-indicator" style={{ backgroundColor: themeColor }}>
          {spell.level === 0 
            ? `Cantrip ${spell.baseLevel} (${Math.ceil(characterLevel / 2)})`
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
        {spell.fromWand && (
          <div className="wand-indicator">
            {spell.wandName}
          </div>
        )}
        {spell.fromInnate && (
          <div className="innate-indicator">
            Innate
          </div>
        )}
        {spell.bloodline && (
          <div className="bloodline-indicator">
            Bloodline
          </div>
        )}
      </div>
    </>
  );
  
  // Create content for the collapsible section
  const content = (
    <>
      <div className="spell-meta">
        {spell.traits && spell.traits.map((trait, index) => (
          <TraitTag key={index} trait={trait} />
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
      
      {spell.trigger && (
        <div className="reaction-trigger">
          <span className="trigger-label" style={{ color: themeColor }}>Trigger</span>
          <span className="trigger-text">{spell.trigger}</span>
        </div>
      )}

      {/* Blood Magic effect for bloodline spells */}
      {spell.bloodline && character?.spellcasting?.bloodline?.blood_magic && (
        <div className="spell-blood-magic">
          <span className="blood-magic-label" style={{ color: themeColor }}>Blood Magic:</span>
          <p className="blood-magic-effect">{character.spellcasting.bloodline.blood_magic}</p>
        </div>
      )}
      
      <div className="spell-description">
        {spell.description}
      </div>
      
      {/* Degrees of Success Section */}
      {spell.degrees && (
        <div className="spell-degrees">
          <span className="degrees-label" style={{ color: themeColor }}>Degrees of Success:</span>
          {Object.entries(spell.degrees).map(([degree, effect], index) => (
            <div key={index} className="degree-entry">
              <span className="degree-level">{degree}:</span>
              <span className="degree-effect">{effect}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Heightened Effects Section */}
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

      {spell.fromInnate && spell.innateSource && (
        <div className="innate-source">
          <span>Source: {spell.innateSource}</span>
        </div>
      )}
    </>
  );
  
  return (
    <CollapsibleCard 
      key={spell.id + (spell.fromScroll ? '-scroll' : '')}
      className={`spell-card ${spell.bloodline ? 'bloodline-spell' : ''}`}
      header={header}
      themeColor={themeColor}
      initialExpanded={false}
    >
      {content}
    </CollapsibleCard>
  );
};

export default SpellCard;