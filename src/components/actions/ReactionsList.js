// src/components/actions/ReactionsList.js
import React from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import TraitTag from '../shared/TraitTag';
import { getReactions, renderActionIcons } from '../../utils/ActionsUtils';

/**
 * Component to render character's reactions
 * @param {Object} props - Component props
 * @param {Object} props.character - Character data
 * @param {string} props.themeColor - Character color theme
 */
const ReactionsList = ({ character, themeColor }) => {
  // Get all reactions for the character
  const reactions = getReactions(character);
  
  // Helper function to render reaction icon
  const renderReactionIcon = () => {
    const actionInfo = renderActionIcons("Reaction", themeColor);
    
    return (
      <div className="reaction-icon" style={{ color: themeColor }}>
        {actionInfo.icon}
      </div>
    );
  };
  
  return (
    <div className="reactions-container">
      {reactions.length > 0 ? (
        <div className="reactions-grid">
          {reactions.map((reaction, index) => {
            // Create header content
            const header = (
              <>
                <h3 style={{ color: themeColor }}>{reaction.name}</h3>
                {renderReactionIcon()}
              </>
            );
            
            // Create content
            const content = (
              <>
                <div className="reaction-traits">
                  {reaction.traits && reaction.traits.map((trait, i) => (
                    <TraitTag key={i} trait={trait} />
                  ))}
                </div>
                
                {reaction.trigger && (
                  <div className="reaction-trigger">
                    <span className="trigger-label" style={{ color: themeColor }}>Trigger</span>
                    <span className="trigger-text">{reaction.trigger}</span>
                  </div>
                )}
                
                {reaction.description && (
                  <div className="reaction-description">
                    {reaction.description}
                  </div>
                )}
                
                {/* Display item source if it exists */}
                {reaction.source && (
                  <div className="reaction-source" style={{ 
                    fontSize: '0.8rem', 
                    color: '#666',
                    borderTop: '1px solid #eee',
                    padding: '0.5rem 1rem',
                    fontStyle: 'italic'
                  }}>
                    From: {reaction.source}
                  </div>
                )}
              </>
            );
            
            return (
              <CollapsibleCard 
                key={`reaction-${index}`}
                className="reaction-card"
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
          <p>No reactions available for this character.</p>
        </div>
      )}
    </div>
  );
};

export default ReactionsList;