// src/components/actions/StrikesList.js
import React from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import { getStrikes } from '../../utils/ActionsUtils';

/**
 * Component to render character's strikes
 * @param {Object} props - Component props
 * @param {Object} props.character - Character data
 * @param {string} props.themeColor - Character color theme
 */
const StrikesList = ({ character, themeColor }) => {
  // Get all strikes for the character
  const strikes = getStrikes(character);
  
  // Group strikes by source (weapon or feat)
  const groupedStrikes = strikes.reduce((acc, strike) => {
    const sourceKey = strike.source || 'Unarmed';
    if (!acc[sourceKey]) {
      acc[sourceKey] = [];
    }
    acc[sourceKey].push(strike);
    return acc;
  }, {});
  
  return (
    <div className="strikes-container">
      {strikes.length > 0 ? (
        <div className="strikes-grid">
          {Object.entries(groupedStrikes).map(([source, strikeGroup]) => (
            strikeGroup.map((strike, strikeIndex) => {
              // Create header content
              const header = (
                <>
                  <h3 style={{ color: themeColor }}>{strike.name}</h3>
                  <div className="action-count">
                    {Array(strike.actionCount || 1).fill().map((_, i) => (
                      <span key={i} className="action-icon" style={{ color: themeColor }}>●</span>
                    ))}
                  </div>
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
                  key={`${source}-strike-${strikeIndex}`}
                  className="strike-card"
                  header={header}
                  themeColor={themeColor}
                  style={{ borderLeft: `4px solid ${themeColor}` }}
                >
                  {content}
                </CollapsibleCard>
              );
            })
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No strikes available for this character.</p>
        </div>
      )}
    </div>
  );
};

export default StrikesList;