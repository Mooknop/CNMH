import React from 'react';
import './FeatsList.css';

const FeatsList = ({ character, characterColor }) => {
  // Sort feats by level
  const sortedFeats = [...(character.feats || [])].sort((a, b) => a.level - b.level);
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';
  
  return (
    <div className="feats-list">
      <h2 style={{ color: themeColor }}>Feats & Abilities</h2>
      
      <div className="feats-grid">
        {sortedFeats.length > 0 ? (
          sortedFeats.map(feat => (
            <div key={feat.id} className="feat-card">
              <div className="feat-header" style={{ backgroundColor: '#f0f0f0' }}>
                <h3 style={{ color: themeColor }}>{feat.name}</h3>
                <div className="feat-meta">
                  <span className="feat-level">Level {feat.level}</span>
                  {feat.source && <span className="feat-source">{feat.source}</span>}
                </div>
              </div>
              <div className="feat-description">
                {feat.description}
              </div>
            </div>
          ))
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