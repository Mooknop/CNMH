// src/components/actions/StrikesList.js
import React from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import { getStrikes, renderActionIcons } from '../../utils/ActionsUtils';

/**
 * Component to render character's strikes, separated into melee and ranged categories
 * @param {Object} props - Component props
 * @param {Object} props.character - Character data
 * @param {string} props.themeColor - Character color theme
 */
const StrikesList = ({ character, themeColor }) => {
  // Get all strikes for the character
  const strikes = getStrikes(character);
  
  // Separate strikes into melee and ranged categories
  const meleeStrikes = strikes.filter(strike => strike.type === 'melee');
  const rangedStrikes = strikes.filter(strike => strike.type === 'ranged');
  
  // Helper function to render action icons
  const renderStrikeActionIcon = (strike) => {
    const count = strike.actionCount || 1;
    const actionText = `${count} Action${count > 1 ? 's' : ''}`;
    const actionInfo = renderActionIcons(actionText, themeColor);
    
    if (actionInfo && actionInfo.type === 'standard') {
      return (
        <div className="action-count">
          {Array(actionInfo.count).fill().map((_, i) => (
            <span key={i} className="action-icon" style={{ color: themeColor }}>{actionInfo.icon}</span>
          ))}
        </div>
      );
    }
    
    return (
      <div className="action-count">
        {Array(count).fill().map((_, i) => (
          <span key={i} className="action-icon" style={{ color: themeColor }}>●</span>
        ))}
      </div>
    );
  };
  
  // Helper function to render a strike card
  const renderStrikeCard = (strike, index) => {
    // Create header content
    const header = (
      <>
        <h3 style={{ color: themeColor }}>{strike.name}</h3>
        {renderStrikeActionIcon(strike)}
      </>
    );
    
    // Create content
    const content = (
      <>
        <div className="strike-traits">
          {strike.traits && strike.traits.map((trait, i) => (
            <span key={i} className="trait-tag">{trait}</span>
          ))}
        </div>
        
        <div className="strike-details">
          <div className="strike-attack">
            <span className="detail-label">Attack</span>
            <span className="detail-value" style={{ color: themeColor }}>{strike.attackMod}</span>
          </div>
          
          <div className="strike-damage">
            <span className="detail-label">Damage</span>
            <span className="detail-value" style={{ color: themeColor }}>{strike.damage}</span>
          </div>
          
          {/* Add range display for ranged weapons */}
          {(strike.type === 'ranged' || strike.range) && (
            <div className="strike-range">
              <span className="detail-label">Range</span>
              <span className="detail-value" style={{ color: themeColor }}>
                {strike.range || '30 feet'}
              </span>
            </div>
          )}
        </div>
        
        {strike.description && (
          <div className="strike-description">
            {strike.description}
          </div>
        )}
        
        {/* Display item source if it exists */}
        {strike.source && strike.source !== strike.name && (
          <div className="strike-source" style={{ 
            fontSize: '0.8rem', 
            color: '#666',
            borderTop: '1px solid #eee',
            padding: '0.5rem 1rem',
            fontStyle: 'italic'
          }}>
            From: {strike.source}
          </div>
        )}
      </>
    );
    
    return (
      <CollapsibleCard 
        key={`strike-${index}`}
        className="strike-card"
        header={header}
        themeColor={themeColor}
        style={{ borderLeft: `4px solid ${themeColor}` }}
      >
        {content}
      </CollapsibleCard>
    );
  };

  return (
    <div className="strikes-container">
      {strikes.length > 0 ? (
        <>
          {/* Melee Strikes Section */}
          {meleeStrikes.length > 0 && (
            <div className="strikes-section">
              <h3 className="strike-category-header" style={{ 
                color: themeColor,
                borderBottom: `1px solid ${themeColor}`,
                paddingBottom: '0.5rem',
                marginBottom: '1rem'
              }}>
                Melee Strikes
              </h3>
              <div className="strikes-grid">
                {meleeStrikes.map((strike, index) => renderStrikeCard(strike, `melee-${index}`))}
              </div>
            </div>
          )}
          
          {/* Ranged Strikes Section */}
          {rangedStrikes.length > 0 && (
            <div className="strikes-section">
              <h3 className="strike-category-header" style={{ 
                color: themeColor,
                borderBottom: `1px solid ${themeColor}`,
                paddingBottom: '0.5rem',
                marginTop: '2rem',
                marginBottom: '1rem'
              }}>
                Ranged Strikes
              </h3>
              <div className="strikes-grid">
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