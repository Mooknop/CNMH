// src/components/actions/CharacterActionsList.js
import React from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import TraitTag from '../shared/TraitTag';
import { getActions, renderActionIcons } from '../../utils/ActionsUtils';

/**
 * Component to render character's standard actions
 * @param {Object} props - Component props
 * @param {Object} props.character - Character data
 * @param {string} props.themeColor - Character color theme
 */
const CharacterActionsList = ({ character, themeColor }) => {
  // Get all actions for the character
  const actions = getActions(character);
  
  // Helper function to render action icons
  const renderActionCount = (action) => {
    const count = action.actionCount || 1;
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
  
  return (
    <div className="actions-container">
      {actions.length > 0 ? (
        <div className="actions-grid">
          {actions.map((action, index) => {
            // Create header content
            const header = (
              <>
                <h3 style={{ color: themeColor }}>{action.name}</h3>
                {renderActionCount(action)}
              </>
            );
            
            // Create content
            const content = (
              <>
                <div className="action-traits">
                  {action.traits && action.traits.map((trait, i) => (
                    <TraitTag key={i} trait={trait} />
                  ))}
                </div>
                
                {action.description && (
                  <div className="action-description">
                    {action.description}
                  </div>
                )}
                
                {/* Display item source if it exists */}
                {action.source && (
                  <div className="action-source" style={{ 
                    fontSize: '0.8rem', 
                    color: '#666',
                    borderTop: '1px solid #eee',
                    padding: '0.5rem 1rem',
                    fontStyle: 'italic'
                  }}>
                    From: {action.source}
                  </div>
                )}
              </>
            );
            
            return (
              <CollapsibleCard 
                key={`action-${index}`}
                className="action-card"
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
          <p>No actions available for this character.</p>
        </div>
      )}
    </div>
  );
};

export default CharacterActionsList;