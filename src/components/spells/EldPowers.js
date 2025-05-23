// src/components/spells/EldPowers.js
import React, { useState } from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import TraitTag from '../shared/TraitTag';
import ActionIcon from '../shared/ActionIcon';
import './EldPowers.css';

/**
 * Component to display Eld Powers
 * @param {Object} props
 * @param {Array} props.eldPowers - Array of Eld Power sources
 * @param {string} props.themeColor - Theme color from character
 * @param {number} props.characterLevel - Character's level
 */
const EldPowers = ({ eldPowers, themeColor, characterLevel }) => {
  // State for selected source
  const [selectedSource, setSelectedSource] = useState(eldPowers[0]?.source || '');
  
  // Get the current source's data
  const currentSourceData = eldPowers.find(ep => ep.source === selectedSource) || eldPowers[0];
  
  if (!currentSourceData) {
    return (
      <div className="eld-powers-container">
        <h3 style={{ color: themeColor }}>Eld Powers</h3>
        <div className="empty-state">
          <p>No Eld Powers available.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="eld-powers-container">
      <div className="eld-powers-header">
        <h3 style={{ color: themeColor }}>Eld Powers</h3>
        <p className="eld-powers-description">
          The Ostilli bound to you has learned from absorbing the primal magic you naturally exude. 
          When you make your daily preparations, you can attune your Ostilli to a single source of 
          potent magic to which you have been exposed for at least half of the past 24 hours.
        </p>
      </div>
      
      {/* Source selector dropdown */}
      <div className="eld-source-selector">
        <label htmlFor="eld-source" style={{ color: themeColor }}>
          Attuned Source:
        </label>
        <select 
          id="eld-source"
          value={selectedSource}
          onChange={(e) => setSelectedSource(e.target.value)}
          style={{ borderColor: themeColor }}
        >
          {eldPowers.map(source => (
            <option key={source.source} value={source.source}>
              {source.source}
            </option>
          ))}
        </select>
      </div>
      
      {/* Display special property if it exists */}
      {currentSourceData.special && (
        <div className="eld-special-info" style={{ borderLeftColor: themeColor }}>
          <h4 style={{ color: themeColor }}>{currentSourceData.special.name}</h4>
          <p>{currentSourceData.special.description}</p>
        </div>
      )}
      
      {/* Display the powers for the selected source */}
      <div className="eld-powers-list">
        <h4 style={{ color: themeColor }}>Available Powers (Once per Hour)</h4>
        <div className="eld-powers-grid">
          {currentSourceData.powers.map((power, index) => {
            // Create header content
            const header = (
              <>
                <h3 style={{ color: themeColor }}>{power.name}</h3>
                {power.actions && (
                  <div className="power-actions-indicator">
                    <ActionIcon actionText={power.actions} color={themeColor} />
                  </div>
                )}
              </>
            );
            
            // Create content
            const content = (
              <>
                {/* Power Traits */}
                {power.traits && power.traits.length > 0 && (
                  <div className="power-traits">
                    {power.traits.map((trait, i) => (
                      <TraitTag key={i} trait={trait} />
                    ))}
                  </div>
                )}
                
                {/* Power Details */}
                <div className="power-details">
                  {power.actions && (
                    <div className="power-actions">
                      <span className="detail-label">Actions:</span>
                      <span className="detail-value">{power.actions}</span>
                    </div>
                  )}
                  
                  {power.range && (
                    <div className="power-range">
                      <span className="detail-label">Range:</span>
                      <span className="detail-value">{power.range}</span>
                    </div>
                  )}
                  
                  {power.area && (
                    <div className="power-area">
                      <span className="detail-label">Area:</span>
                      <span className="detail-value">{power.area}</span>
                    </div>
                  )}
                </div>
                
                {/* Power Description */}
                <div className="power-description">
                  {power.description}
                </div>
                
                {/* Degrees of Success if present */}
                {power.degrees && (
                  <div className="power-degrees">
                    <span className="degrees-label" style={{ color: themeColor }}>
                      Degrees of Success:
                    </span>
                    {Object.entries(power.degrees).map(([degree, effect], i) => (
                      <div key={i} className="degree-entry">
                        <span className="degree-level">{degree}:</span>
                        <span className="degree-effect">{effect}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
            
            return (
              <CollapsibleCard 
                key={`eld-power-${index}`}
                className="eld-power-card"
                header={header}
                themeColor={themeColor}
                initialExpanded={false}
              >
                {content}
              </CollapsibleCard>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default EldPowers;