import React from 'react';
import './FeatsList.css';

const FeatsList = ({ character }) => {
  // Sort feats by level
  const sortedFeats = [...(character.feats || [])].sort((a, b) => a.level - b.level);
  
  return (
    <div className="feats-list">
      <h2>Feats & Abilities</h2>
      
      <div className="feats-grid">
        {sortedFeats.length > 0 ? (
          sortedFeats.map(feat => (
            <div key={feat.id} className="feat-card">
              <div className="feat-header">
                <h3>{feat.name}</h3>
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