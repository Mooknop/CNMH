// src/components/actions/CharacterActionsList.js
import React from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import TraitTag from '../shared/TraitTag';
import ActionIcon from '../shared/ActionIcon';
import ThaumaturgeExploitsDisplay from './ThaumaturgeExploitsDisplay';
import { getActions } from '../../utils/ActionsUtils';

/**
 * Component to render character's standard actions
 * @param {Object} props - Component props
 * @param {Object} props.character - Character data
 * @param {string} props.themeColor - Character color theme
 */
const CharacterActionsList = ({ character, themeColor }) => {
  // Get all actions for the character
  const actions = getActions(character);
  
  // Check if character is a Thaumaturge
  const isThaumaturge = character.class === 'Thaumaturge' && character.thaumaturge;
  
  // Helper function to format action text for display and for ActionIcon
  const getActionText = (action) => {
    const count = action.actionCount || 1;
    
    // Handle variable action ranges
    if (action.variableActionCount) {
      const { min, max } = action.variableActionCount;
      return `${min} to ${max} Actions`;
    }
    
    return `${count} Action${count !== 1 ? 's' : ''}`;
  };
  
  return (
    <div className="actions-container">
      {/* Display Thaumaturge exploits if character is a Thaumaturge */}
      {isThaumaturge && (
        <ThaumaturgeExploitsDisplay character={character} themeColor={themeColor} />
      )}
      
      {actions.length > 0 ? (
        <div className="actions-grid">
          {actions.map((action, index) => {
            // Format action text
            const actionText = getActionText(action);
            
            // Create header content
            const header = (
              <>
                <h3 style={{ color: themeColor }}>{action.name}</h3>
                <div className="action-icons">
                  <ActionIcon 
                    actionText={action.actions || actionText} 
                    color={themeColor} 
                  />
                </div>
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
                
                {/* Display action count in text form */}
                <div className="action-count-text">
                  <span className="detail-label">Actions:</span>
                  <span className="detail-value">{actionText}</span>
                </div>
                
                {action.description && (
                  <div className="action-description">
                    {action.description}
                  </div>
                )}
                
                {/* Display degrees of success if present */}
                {action.degrees && (
                  <div className="action-degrees">
                    <span className="degrees-label" style={{ 
                      color: themeColor,
                      fontWeight: 'bold',
                      display: 'block',
                      marginTop: '0.75rem',
                      marginBottom: '0.5rem'
                    }}>
                      Degrees of Success:
                    </span>
                    {Object.entries(action.degrees).map(([degree, effect], i) => (
                      <div key={i} className="degree-entry" style={{
                        marginBottom: '0.5rem',
                        paddingLeft: '1rem'
                      }}>
                        <span className="degree-level" style={{
                          fontWeight: 'bold',
                          color: degree.includes('Critical Success') ? '#2e7d32' :
                                 degree.includes('Success') ? '#1976d2' :
                                 degree.includes('Failure') && !degree.includes('Critical') ? '#f57c00' :
                                 '#c62828'
                        }}>
                          {degree}:
                        </span>
                        <span className="degree-effect" style={{ marginLeft: '0.5rem' }}>
                          {effect}
                        </span>
                      </div>
                    ))}
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