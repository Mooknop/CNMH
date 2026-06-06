// src/components/actions/StrikesList.js
import React from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import TraitTag from '../shared/TraitTag';
import ActionIcon from '../shared/ActionIcon';
import ThaumaturgeImplementsDisplay from './ThaumaturgeImplementsDisplay';
import UseActionChip from '../shared/UseActionChip';
import { useCharacter } from '../../hooks/useCharacter';
import { useExploitVulnerability } from '../../hooks/useExploitVulnerability';
import { formatModifier } from '../../utils/CharacterUtils';


/**
 * Component to render character's strikes, separated into melee and ranged categories
 * @param {Object} props - Component props
 * @param {Object} props.character - Character data
 * @param {string} props.themeColor - Character color theme
 * @param {boolean} props.encounterMode - When true, shows Use buttons
 * @param {Function} props.onUse - Called with (strike, cost) when Use is clicked
 */
const StrikesList = ({ character, themeColor, encounterMode, onUse }) => {
  const { strikes, flags, thaumaturge } = useCharacter(character);
  const { isThaumaturge } = flags;
  const { exploitFor } = useExploitVulnerability();
  const activeExploit = character?.id ? exploitFor(character.id) : null;

  // Separate strikes into melee and ranged categories
  const meleeStrikes = strikes.filter(strike => strike.type === 'melee');
  const rangedStrikes = strikes.filter(strike => strike.type === 'ranged');
  
  // Helper function to get action text for a strike
  const getActionText = (strike) => {
    // Check for variable action counts first
    if (strike.variableActionCount) {
      const { min, max } = strike.variableActionCount;
      return `${min} to ${max} Actions`;
    }
    
    // Otherwise use the standard action count
    const count = strike.actionCount || 1;
    return `${count} Action${count !== 1 ? 's' : ''}`;
  };
  
  const renderStrikeCard = (strike, index) => {
    const inactive = strike.active === false;

    const headerRight = encounterMode && !inactive
      ? (
        <UseActionChip
          cost={strike.actionCount || 1}
          verb="Use"
          name={strike.name}
          variableRange={strike.variableActionCount}
          onUse={(c) => onUse && onUse(strike, c)}
        />
      )
      : null;

    const header = (
      <>
        <h3>{strike.name}</h3>
        <div className="action-icons">
          <ActionIcon
            actionText={strike.actions || getActionText(strike)}
            color={themeColor}
          />
        </div>
      </>
    );

    const exploitLabel = (() => {
      if (!activeExploit) return null;
      const parts = activeExploit.type === 'mortal'
        ? `Mortal Weakness — ${activeExploit.weaknessType} ${activeExploit.value} vs ${activeExploit.targetName}`
        : `Personal Antithesis — weakness ${activeExploit.value} vs ${activeExploit.targetName}`;
      return activeExploit.magical ? `${parts} · magical` : parts;
    })();

    const content = (
      <>
        {exploitLabel && (
          <div className="strike-exploit-badge" data-testid="strike-exploit-badge">
            {exploitLabel}
          </div>
        )}
        <div className="strike-traits">
          {strike.traits && strike.traits.map((trait, i) => (
            <TraitTag key={i} trait={trait} />
          ))}
        </div>

        <div className="strike-details">
          <div className="strike-attack">
            <span className="detail-label">Attack</span>
            <span className="detail-value">{formatModifier(strike.attackMod)}</span>
          </div>
          <div className="strike-damage">
            <span className="detail-label">Damage</span>
            <span className="detail-value">{strike.damage}</span>
          </div>
          {(strike.type === 'ranged' || strike.range) && (
            <div className="strike-range">
              <span className="detail-label">Range</span>
              <span className="detail-value">
                {strike.range || '30 feet'}
              </span>
            </div>
          )}
        </div>

        {strike.description && (
          <div className="strike-description">{strike.description}</div>
        )}

        {inactive && (
          <div className="ability-inactive-hint">
            Not in hand — draw this weapon to Strike with it.
          </div>
        )}

        {strike.source && strike.source !== strike.name && (
          <div className="strike-source">
            From: {strike.source}
          </div>
        )}
      </>
    );

    return (
      <CollapsibleCard
        key={`strike-${index}`}
        className={`strike-card${inactive ? ' is-inactive' : ''}`}
        header={header}
        headerRight={headerRight}
        themeColor={themeColor}
      >
        {content}
      </CollapsibleCard>
    );
  };

  return (
    <div className="strikes-container">
      {/* Display Thaumaturge implements if character is a Thaumaturge */}
      {isThaumaturge && (
        <ThaumaturgeImplementsDisplay thaumaturge={thaumaturge} themeColor={themeColor} />
      )}
      
      {strikes.length > 0 ? (
        <>
          {/* Melee Strikes Section */}
          {meleeStrikes.length > 0 && (
            <div className="strikes-section">
              <h3 className="strike-category-header">Melee Strikes</h3>
              <div className="cards-grid">
                {meleeStrikes.map((strike, index) => renderStrikeCard(strike, `melee-${index}`))}
              </div>
            </div>
          )}
          
          {/* Ranged Strikes Section */}
          {rangedStrikes.length > 0 && (
            <div className="strikes-section">
              <h3 className="strike-category-header">Ranged Strikes</h3>
              <div className="cards-grid">
                {rangedStrikes.map((strike, index) => renderStrikeCard(strike, `ranged-${index}`))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <p>No strikes available for this character.</p>
        </div>
      )}
    </div>
  );
};

export default StrikesList;