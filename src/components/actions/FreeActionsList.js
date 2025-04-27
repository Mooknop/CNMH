// src/components/character-sheet/FreeActionsList.js
import React from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import { getFreeActions } from '../../utils/ActionsUtils';

/**
 * Component to render character's free actions
 * @param {Object} props - Component props
 * @param {Object} props.character - Character data
 * @param {string} props.themeColor - Character color theme
 */
const FreeActionsList = ({ character, themeColor }) => {
  // Get all free actions for the character
  const freeActions = getFreeActions(character);
  
  return (
    <div className="free-actions-container">
      {freeActions.length > 0 ? (
        <div className="free-actions-grid">
          {freeActions.map((freeAction, index) => {
            // Create header content
            const header = (
              <>
                <h3 style={{ color: themeColor }}>{freeAction.name}</h3>
                <div className="free-action-icon" style={{ color: themeColor }}>⟡</div>
              </>
            );
            
            // Create content
            const content = (
              <>
                <div className="free-action-traits">
                  {freeAction.traits && freeAction.traits.map((trait, i) => (
                    <span key={i} className="trait-tag">{trait}</span>
                  ))}
                </div>
                
                {freeAction.trigger && (
                  <div className="free-action-trigger">
                    <span className="trigger-label" style={{ color: themeColor }}>Trigger</span>
                    <span className="trigger-text">{freeAction.trigger}</span>
                  </div>
                )}
                
                {freeAction.description && (
                  <div className="free-action-description">
                    {freeAction.description}
                  </div>
                )}
                
                {/* Display item source if it exists */}
                {freeAction.source && (
                  <div className="free-action-source" style={{ 
                    fontSize: '0.8rem', 
                    color: '#666',
                    borderTop: '1px solid #eee',
                    padding: '0.5rem 1rem',
                    fontStyle: 'italic'
                  }}>
                    From: {freeAction.source}
                  </div>
                )}
              </>
            );
            
            return (
              <CollapsibleCard 
                key={`free-action-${index}`}
                className="free-action-card"
                header={header}
                themeColor={themeColor}
                style={{ borderLeft: `4px solid ${themeColor}` }}
              >
                {content}
              </CollapsibleCard>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <p>No free actions available for this character.</p>
        </div>
      )}
    </div>
  );
};

export default FreeActionsList;