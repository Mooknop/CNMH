import React, { useState, useEffect } from 'react';
import './ActionsList.css';
import {
  getAbilityModifier, 
  getAttackBonus 
} from '../../utils/CharacterUtils';

const ActionsList = ({ character, characterColor }) => {
  const [availableSections, setAvailableSections] = useState([]);
  const [activeSection, setActiveSection] = useState(null); // Will be set after determining available sections
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';
  
  // Process character data to determine available sections
  useEffect(() => {
    const sections = [];
    
    // Check for strikes
    const hasStrikes = getStrikes().length > 0;
    if (hasStrikes) sections.push('strikes');
    
    // Check for actions
    const hasActions = getActions().length > 0;
    if (hasActions) sections.push('actions');
    
    // Check for reactions
    const hasReactions = getReactions().length > 0;
    if (hasReactions) sections.push('reactions');
    
    // Check for free actions
    const hasFreeActions = getFreeActions().length > 0;
    if (hasFreeActions) sections.push('freeActions');
    
    setAvailableSections(sections);
    
    // Set default active section to the first available one
    if (sections.length > 0 && !activeSection) {
      setActiveSection(sections[0]);
    }
  }, [character]);
  
  // Function to get all strikes for the character
  const getStrikes = () => {
    // Create array to hold all strikes
    let allStrikes = [];
    
    // Add defined strikes from character data if they exist
    if (character.strikes && character.strikes.length > 0) {
      // Process each predefined strike to calculate attack modifier
      const processedStrikes = character.strikes.map(strike => {
        // Determine ability modifier based on strike type and traits
        let abilityMod;
        const isMelee = strike.type === 'melee';
        const isFinesse = strike.traits && strike.traits.includes('Finesse');
        
        // Get relevant ability modifiers
        const strMod = getAbilityModifier(character.abilities?.strength || 10);
        const dexMod = getAbilityModifier(character.abilities?.dexterity || 10);
        
        // Use appropriate modifier based on weapon type and traits
        if (isFinesse) {
          abilityMod = Math.max(strMod, dexMod); // Finesse can use higher of STR or DEX
        } else if (isMelee) {
          abilityMod = strMod; // Melee weapons use STR
        } else {
          abilityMod = dexMod; // Ranged weapons use DEX
        }
        
        // Determine the proficiency value to use
        let proficiencyValue = 0;
        // Check for proficiency based on weapon category
        if (strike.category && character.proficiencies?.weapons?.[strike.category]) {
          proficiencyValue = character.proficiencies.weapons[strike.category].proficiency || 0;
        }
        // Special case for unarmed attacks
        else if (strike.traits && strike.traits.includes('Unarmed')) {
          proficiencyValue = character.proficiencies?.weapons?.unarmed?.proficiency || 0;
        }
        // Default to simple weapons proficiency
        else {
          proficiencyValue = character.proficiencies?.weapons?.simple?.proficiency || 0;
        }
        
        // Calculate attack bonus
        const attackBonus = getAttackBonus(abilityMod, proficiencyValue, character.level || 0);
        
        // Return the strike with calculated attack modifier
        return {
          ...strike,
          attackMod: attackBonus
        };
      });
      
      allStrikes = [...processedStrikes];
    }
    
    // Add strikes generated from inventory weapons
    if (character.inventory) {
      const weaponStrikes = character.inventory
        .filter(item => item.strikes) // Only items with strikes property
        .map(item => {
          const weapon = item.strikes;
          const isProficient = character.proficiencies?.weapons?.[weapon.proficiency || 'simple'];
          const proficiencyValue = isProficient?.proficiency || 0;
          
          // Determine ability modifier based on weapon traits
          let abilityMod;
          const isMelee = weapon.type === 'melee';
          const isFinesse = weapon.traits && weapon.traits.includes('Finesse');
          
          // Get relevant ability modifiers
          const strMod = getAbilityModifier(character.abilities?.strength || 10);
          const dexMod = getAbilityModifier(character.abilities?.dexterity || 10);
          
          // Use appropriate modifier based on weapon type and traits
          if (isFinesse) {
            abilityMod = Math.max(strMod, dexMod); // Finesse can use higher of STR or DEX
          } else if (isMelee) {
            abilityMod = strMod; // Melee weapons use STR
          } else {
            abilityMod = dexMod; // Ranged weapons use DEX
          }
          
          // Calculate attack bonus
          const attackBonus = getAttackBonus(abilityMod, proficiencyValue, character.level || 0);
          
          // Format damage string with ability modifier (for melee weapons)
          let damageString = weapon.damage || '1d6';
          if (isMelee && strMod !== 0) {
            damageString += (strMod > 0 ? '+' + strMod : strMod);
          }
          
          return {
            name: `${item.name} Strike`,
            type: weapon.type,
            actionCount: parseInt(weapon.action) || 1,
            traits: weapon.traits || [],
            attackMod: attackBonus,
            damage: damageString,
            description: item.description || "",
            source: item.name // Add source for reference
          };
        });
      
      // Add weapon strikes to the list
      allStrikes = [...allStrikes, ...weaponStrikes];
    }
    
    // Add unarmed strike if no strikes available
    if (allStrikes.length === 0) {
      const unarmedProficiency = character.proficiencies?.weapons?.unarmed?.proficiency || 0;
      const strMod = getAbilityModifier(character.abilities?.strength || 10);
      const attackBonus = getAttackBonus(strMod, unarmedProficiency, character.level || 0);
      
      allStrikes.push({
        name: "Unarmed Strike",
        type: "melee",
        actionCount: 1,
        traits: ["Attack", "Melee", "Unarmed"],
        attackMod: attackBonus,
        damage: `1d4${strMod !== 0 ? (strMod > 0 ? '+' + strMod : strMod) : ''}`,
        description: "A strike with your fist or another body part."
      });
    }
    
    return allStrikes;
  };
  
  // Function to get all actions for the character
  const getActions = () => {
    // Create array to hold all actions
    let allActions = [];
    
    // Add defined actions from character data if they exist
    if (character.actions && character.actions.length > 0) {
      allActions = [...character.actions];
    }
    
    // Add actions from inventory items
    if (character.inventory) {
      const inventoryActions = character.inventory
        .filter(item => item.actions && item.actions.length > 0) // Only items with actions property
        .flatMap(item => {
          // Map each action from this item and add a source property
          return item.actions.map(action => ({
            ...action,
            source: item.name // Add source for reference
          }));
        });
      
      // Add inventory actions to the list
      allActions = [...allActions, ...inventoryActions];
    }

    // Add actions from feats
    if (character.feats) {
      const featActions = character.feats
        .filter(feat => feat.actions && feat.actions.length > 0) // Only feats with actions property
        .flatMap(feat => {
          // Map each action from this feat and add a source property
          return feat.actions.map(action => ({
            ...action,
            source: feat.name // Add source for reference
          }));
        });
      
      // Add feat actions to the list
      allActions = [...allActions, ...featActions];
    }
    
    // Add standard actions if none exist (move, stride, etc.)
    if (allActions.length === 0) {
      allActions = [
        {
          name: "Stride",
          actionCount: 1,
          traits: ["Move"],
          description: "You move up to your Speed."
        },
        {
          name: "Step",
          actionCount: 1,
          traits: ["Move"],
          description: "You carefully move 5 feet. This movement doesn't trigger reactions that are normally triggered by movement."
        },
        {
          name: "Strike",
          actionCount: 1,
          traits: ["Attack"],
          description: "You attack with a weapon or unarmed attack."
        }
      ];
    }
    
    return allActions;
  };
  
  // Function to get all reactions for the character
  const getReactions = () => {
    // Create array to hold all reactions
    let allReactions = [];
    
    // Add defined reactions from character data if they exist
    if (character.reactions && character.reactions.length > 0) {
      allReactions = [...character.reactions];
    }
    
    // Add reactions from inventory items
    if (character.inventory) {
      const inventoryReactions = character.inventory
        .filter(item => item.reactions && item.reactions.length > 0) // Only items with reactions property
        .flatMap(item => {
          // Map each reaction from this item and add a source property
          return item.reactions.map(reaction => ({
            ...reaction,
            source: item.name // Add source for reference
          }));
        });
      
      // Add inventory reactions to the list
      allReactions = [...allReactions, ...inventoryReactions];
    }
    
    return allReactions;
  };
  
  // Function to get all free actions for the character
  const getFreeActions = () => {
    // Create array to hold all free actions
    let allFreeActions = [];
    
    // Add defined free actions from character data if they exist
    if (character.freeActions && character.freeActions.length > 0) {
      allFreeActions = [...character.freeActions];
    }
    
    // Add free actions from inventory items
    if (character.inventory) {
      const inventoryFreeActions = character.inventory
        .filter(item => item.freeActions && item.freeActions.length > 0) // Only items with freeActions property
        .flatMap(item => {
          // Map each free action from this item and add a source property
          return item.freeActions.map(freeAction => ({
            ...freeAction,
            source: item.name // Add source for reference
          }));
        });
      
      // Add inventory free actions to the list
      allFreeActions = [...allFreeActions, ...inventoryFreeActions];
    }
    
    return allFreeActions;
  };
  
  // Function to render strikes section
  const renderStrikes = () => {
    const strikes = getStrikes();
    
    return (
      <div className="strikes-container">
        {strikes.length > 0 ? (
          <div className="strikes-grid">
            {strikes.map((strike, index) => (
              <div key={`strike-${index}`} className="strike-card" style={{ borderLeftColor: themeColor }}>
                <div className="strike-header" style={{ backgroundColor: '#f0f0f0' }}>
                  <h3 style={{ color: themeColor }}>{strike.name}</h3>
                  <div className="action-count">
                    {Array(strike.actionCount || 1).fill().map((_, i) => (
                      <span key={i} className="action-icon" style={{ color: themeColor }}>●</span>
                    ))}
                  </div>
                </div>
                
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
                </div>
                
                {strike.description && (
                  <div className="strike-description">
                    {strike.description}
                  </div>
                )}
                
                {/* Display item source if it exists */}
                {strike.source && (
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
              </div>
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
  
  // Function to render actions section
  const renderActions = () => {
    const actions = getActions();
    
    return (
      <div className="actions-container">
        {actions.length > 0 ? (
          <div className="actions-grid">
            {actions.map((action, index) => (
              <div key={`action-${index}`} className="action-card" style={{ borderLeftColor: themeColor }}>
                <div className="action-header" style={{ backgroundColor: '#f0f0f0' }}>
                  <h3 style={{ color: themeColor }}>{action.name}</h3>
                  <div className="action-count">
                    {Array(action.actionCount || 1).fill().map((_, i) => (
                      <span key={i} className="action-icon" style={{ color: themeColor }}>●</span>
                    ))}
                  </div>
                </div>
                
                <div className="action-traits">
                  {action.traits && action.traits.map((trait, i) => (
                    <span key={i} className="trait-tag">{trait}</span>
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
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No actions available for this character.</p>
          </div>
        )}
      </div>
    );
  };
  
  // Function to render reactions section
  const renderReactions = () => {
    const reactions = getReactions();
    
    return (
      <div className="reactions-container">
        {reactions.length > 0 ? (
          <div className="reactions-grid">
            {reactions.map((reaction, index) => (
              <div key={`reaction-${index}`} className="reaction-card" style={{ borderLeftColor: themeColor }}>
                <div className="reaction-header" style={{ backgroundColor: '#f0f0f0' }}>
                  <h3 style={{ color: themeColor }}>{reaction.name}</h3>
                  <div className="reaction-icon" style={{ color: themeColor }}>⟳</div>
                </div>
                
                <div className="reaction-traits">
                  {reaction.traits && reaction.traits.map((trait, i) => (
                    <span key={i} className="trait-tag">{trait}</span>
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
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No reactions available for this character.</p>
          </div>
        )}
      </div>
    );
  };
  
  // Function to render free actions section
  const renderFreeActions = () => {
    const freeActions = getFreeActions();
    
    return (
      <div className="free-actions-container">
        {freeActions.length > 0 ? (
          <div className="free-actions-grid">
            {freeActions.map((freeAction, index) => (
              <div key={`free-action-${index}`} className="free-action-card" style={{ borderLeftColor: themeColor }}>
                <div className="free-action-header" style={{ backgroundColor: '#f0f0f0' }}>
                  <h3 style={{ color: themeColor }}>{freeAction.name}</h3>
                  <div className="free-action-icon" style={{ color: themeColor }}>⟡</div>
                </div>
                
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
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No free actions available for this character.</p>
          </div>
        )}
      </div>
    );
  };
  
  // If no sections are available, show a message
  if (availableSections.length === 0) {
    return (
      <div className="actions-list">
        <div className="empty-state">
          <p>No actions available for this character.</p>
        </div>
      </div>
    );
  }
  
  // Function to map section ID to label
  const getSectionLabel = (sectionId) => {
    switch(sectionId) {
      case 'strikes': return 'Strikes';
      case 'actions': return 'Actions';
      case 'reactions': return 'Reactions';
      case 'freeActions': return 'Free Actions';
      default: return '';
    }
  };
  
  // Function to render the active section content
  const renderActiveSection = () => {
    switch(activeSection) {
      case 'strikes': return renderStrikes();
      case 'actions': return renderActions();
      case 'reactions': return renderReactions();
      case 'freeActions': return renderFreeActions();
      default: return null;
    }
  };
  
  return (
    <div className="actions-list">
      <div className="section-tabs">
        {availableSections.map(section => (
          <button 
            key={section}
            className={`section-tab ${activeSection === section ? 'active' : ''}`}
            onClick={() => setActiveSection(section)}
            style={{ backgroundColor: activeSection === section ? themeColor : '' }}
          >
            {getSectionLabel(section)}
          </button>
        ))}
      </div>
      
      <div className="section-content">
        {renderActiveSection()}
      </div>
    </div>
  );
};

export default ActionsList;