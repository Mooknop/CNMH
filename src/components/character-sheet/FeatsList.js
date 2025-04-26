import React from 'react';
import './FeatsList.css';
import CollapsibleCard from '../shared/CollapsibleCard';

const FeatsList = ({ character, characterColor }) => {
  // Sort feats by level
  const sortedFeats = [...(character.feats || [])].sort((a, b) => a.level - b.level);
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';
  
  return (
    <div className="feats-list">     
      <div className="feats-grid">
        {sortedFeats.length > 0 ? (
          sortedFeats.map(feat => {
            // Create header content
            const header = (
              <>
                <h3 style={{ color: themeColor }}>{feat.name}</h3>
                <div className="feat-meta">
                  <span className="feat-level">Level {feat.level}</span>
                  {feat.source && <span className="feat-source">{feat.source}</span>}
                </div>
              </>
            );

            return (
              <CollapsibleCard 
                key={feat.id} 
                className="feat-card"
                header={header}
                themeColor={themeColor}
                initialExpanded={false}
              >
                <div className="feat-description">
                  {feat.description}
                </div>
              </CollapsibleCard>
            );
          })
        ) : (
          <div className="empty-state">
            <p>No feats or abilities.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FeatsList;