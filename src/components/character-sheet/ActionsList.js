import React, { useState } from 'react';
import './ActionsList.css';
import {
  getAbilityModifier, 
  getAttackBonus 
} from '../../utils/CharacterUtils';

const ActionsList = ({ character, characterColor }) => {
  const [activeSection, setActiveSection] = useState('strikes'); // Default section
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';
  
  // Function to render strikes section
  const renderStrikes = () => {
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
            description: item.description || ""
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
    
    return (
      <div className="strikes-container">
        {allStrikes.length > 0 ? (
          <div className="strikes-grid">
            {allStrikes.map((strike, index) => (
              <div key={`strike-${index}`} className="strike-card">
                <div className="strike-header">
                  <h3 style={{ color: themeColor }}>{strike.name}</h3>
                  <div className="action-count">
                    {Array(strike.actionCount || 1).fill().map((_, i) => (
                      <span key={i} className="action-icon">●</span>
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
                    <span className="detail-value">{strike.attackMod}</span>
                  </div>
                  
                  <div className="strike-damage">
                    <span className="detail-label">Damage</span>
                    <span className="detail-value">{strike.damage}</span>
                  </div>
                </div>
                
                {strike.description && (
                  <div className="strike-description">
                    {strike.description}
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
    return (
      <div className="actions-container">
        {(character.actions && character.actions.length > 0) ? (
          <div className="actions-grid">
            {character.actions.map((action, index) => (
              <div key={`action-${index}`} className="action-card">
                <div className="action-header">
                  <h3 style={{ color: themeColor }}>{action.name}</h3>
                  <div className="action-count">
                    {Array(action.actionCount || 1).fill().map((_, i) => (
                      <span key={i} className="action-icon">●</span>
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
    return (
      <div className="reactions-container">
        {(character.reactions && character.reactions.length > 0) ? (
          <div className="reactions-grid">
            {character.reactions.map((reaction, index) => (
              <div key={`reaction-${index}`} className="reaction-card">
                <div className="reaction-header">
                  <h3 style={{ color: themeColor }}>{reaction.name}</h3>
                  <div className="reaction-icon">⟳</div>
                </div>
                
                <div className="reaction-traits">
                  {reaction.traits && reaction.traits.map((trait, i) => (
                    <span key={i} className="trait-tag">{trait}</span>
                  ))}
                </div>
                
                {reaction.trigger && (
                  <div className="reaction-trigger">
                    <span className="trigger-label">Trigger</span>
                    <span className="trigger-text">{reaction.trigger}</span>
                  </div>
                )}
                
                {reaction.description && (
                  <div className="reaction-description">
                    {reaction.description}
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
    return (
      <div className="free-actions-container">
        {(character.freeActions && character.freeActions.length > 0) ? (
          <div className="free-actions-grid">
            {character.freeActions.map((freeAction, index) => (
              <div key={`free-action-${index}`} className="free-action-card">
                <div className="free-action-header">
                  <h3 style={{ color: themeColor }}>{freeAction.name}</h3>
                  <div className="free-action-icon">⟡</div>
                </div>
                
                <div className="free-action-traits">
                  {freeAction.traits && freeAction.traits.map((trait, i) => (
                    <span key={i} className="trait-tag">{trait}</span>
                  ))}
                </div>
                
                {freeAction.trigger && (
                  <div className="free-action-trigger">
                    <span className="trigger-label">Trigger</span>
                    <span className="trigger-text">{freeAction.trigger}</span>
                  </div>
                )}
                
                {freeAction.description && (
                  <div className="free-action-description">
                    {freeAction.description}
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
  
  return (
    <div className="actions-list">
      <div className="section-tabs">
        <button 
          className={`section-tab ${activeSection === 'strikes' ? 'active' : ''}`}
          onClick={() => setActiveSection('strikes')}
          style={{ backgroundColor: activeSection === 'strikes' ? themeColor : '' }}
        >
          Strikes
        </button>
        <button 
          className={`section-tab ${activeSection === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveSection('actions')}
          style={{ backgroundColor: activeSection === 'actions' ? themeColor : '' }}
        >
          Actions
        </button>
        <button 
          className={`section-tab ${activeSection === 'reactions' ? 'active' : ''}`}
          onClick={() => setActiveSection('reactions')}
          style={{ backgroundColor: activeSection === 'reactions' ? themeColor : '' }}
        >
          Reactions
        </button>
        <button 
          className={`section-tab ${activeSection === 'freeActions' ? 'active' : ''}`}
          onClick={() => setActiveSection('freeActions')}
          style={{ backgroundColor: activeSection === 'freeActions' ? themeColor : '' }}
        >
          Free Actions
        </button>
      </div>
      
      <div className="section-content">
        {activeSection === 'strikes' && renderStrikes()}
        {activeSection === 'actions' && renderActions()}
        {activeSection === 'reactions' && renderReactions()}
        {activeSection === 'freeActions' && renderFreeActions()}
      </div>
    </div>
  );
};

export default ActionsList;