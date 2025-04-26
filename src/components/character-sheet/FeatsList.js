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
                
                {/* Add actions associated with the feat if any */}
                {feat.actions && feat.actions.length > 0 && (
                  <div className="feat-actions">
                    <h4 style={{ color: themeColor }}>Actions</h4>
                    <ul className="actions-list">
                      {feat.actions.map((action, index) => (
                        <li key={index} className="feat-action">
                          <div className="action-header">
                            <span className="action-name">{action.name}</span>
                            {action.actionCount && (
                              <span className="action-count">
                                {Array(action.actionCount).fill().map((_, i) => (
                                  <span key={i} className="action-icon" style={{ color: themeColor }}>●</span>
                                ))}
                              </span>
                            )}
                          </div>
                          {action.traits && action.traits.length > 0 && (
                            <div className="action-traits">
                              {action.traits.map((trait, i) => (
                                <span key={i} className="trait-tag">{trait}</span>
                              ))}
                            </div>
                          )}
                          <span className="action-description">{action.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Add reactions associated with the feat if any */}
                {feat.reactions && feat.reactions.length > 0 && (
                  <div className="feat-reactions">
                    <h4 style={{ color: themeColor }}>Reactions</h4>
                    <ul className="reactions-list">
                      {feat.reactions.map((reaction, index) => (
                        <li key={index} className="feat-reaction">
                          <div className="reaction-header">
                            <span className="reaction-name">{reaction.name}</span>
                            <span className="reaction-icon" style={{ color: themeColor }}>⟳</span>
                          </div>
                          {reaction.traits && reaction.traits.length > 0 && (
                            <div className="reaction-traits">
                              {reaction.traits.map((trait, i) => (
                                <span key={i} className="trait-tag">{trait}</span>
                              ))}
                            </div>
                          )}
                          {reaction.trigger && (
                            <div className="reaction-trigger">
                              <span className="trigger-label" style={{ color: themeColor }}>Trigger</span>
                              <span className="trigger-text">{reaction.trigger}</span>
                            </div>
                          )}
                          <span className="reaction-description">{reaction.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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