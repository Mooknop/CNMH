// src/components/character-sheet/AnimalCompanionModal.js
import React from 'react';
import { getAbilityModifier, formatModifier } from '../../utils/CharacterUtils';
import './AnimalCompanionModal.css';

const AnimalCompanionModal = ({ isOpen, onClose, animalCompanion, character, characterColor }) => {
  if (!isOpen) return null;
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';

  // Use provided animal companion data or defaults
  const companionData = animalCompanion;

  // Calculate ability modifiers for the animal companion
  const getCompanionAbilityMod = (score) => {
    return formatModifier(getAbilityModifier(score || 10));
  };

  return (
    <div className="animal-companion-modal-overlay" onClick={onClose}>
      <div className="animal-companion-modal" onClick={(e) => e.stopPropagation()}>
        <div className="animal-companion-modal-header" style={{ backgroundColor: themeColor }}>
          <h2>{companionData.name}</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        
        <div className="animal-companion-modal-content">
          <div className="companion-basic-info">
            <div className="companion-traits">
              <span className="trait-label">Type:</span> 
              <span className="trait-value">{companionData.type}</span>
              
              <span className="trait-label">Size:</span> 
              <span className="trait-value">{companionData.size}</span>
              
              {companionData.senses && (
                <>
                  <span className="trait-label">Senses:</span> 
                  <span className="trait-value">{companionData.senses}</span>
                </>
              )}
            </div>
          </div>
          
          <div className="companion-stats">
            {/* Ability Scores */}
            <div className="companion-abilities">
              <h3 style={{ color: themeColor }}>Ability Scores</h3>
              <div className="ability-scores">
                <div className="ability">
                  <span className="ability-name">STR</span>
                  <span className="ability-score">{getCompanionAbilityMod(companionData.abilities?.strength)}</span>
                </div>
                <div className="ability">
                  <span className="ability-name">DEX</span>
                  <span className="ability-score">{getCompanionAbilityMod(companionData.abilities?.dexterity)}</span>
                </div>
                <div className="ability">
                  <span className="ability-name">CON</span>
                  <span className="ability-score">{getCompanionAbilityMod(companionData.abilities?.constitution)}</span>
                </div>
                <div className="ability">
                  <span className="ability-name">INT</span>
                  <span className="ability-score">{getCompanionAbilityMod(companionData.abilities?.intelligence)}</span>
                </div>
                <div className="ability">
                  <span className="ability-name">WIS</span>
                  <span className="ability-score">{getCompanionAbilityMod(companionData.abilities?.wisdom)}</span>
                </div>
                <div className="ability">
                  <span className="ability-name">CHA</span>
                  <span className="ability-score">{getCompanionAbilityMod(companionData.abilities?.charisma)}</span>
                </div>
              </div>
            </div>
            
            {/* Defenses */}
            <div className="companion-defenses">
              <div className="defense">
                <span className="defense-label">AC</span>
                <span className="defense-value">{companionData.ac}</span>
              </div>
              <div className="defense">
                <span className="defense-label">HP</span>
                <span className="defense-value">{companionData.hp}</span>
              </div>
              <div className="defense">
                <span className="defense-label">Speed</span>
                <span className="defense-value">{companionData.speed} feet</span>
              </div>
            </div>
            
            {/* Saves */}
            <div className="companion-saves">
              <div className="defense">
                <span className="defense-label">Fortitude</span>
                <span className="defense-value">+{companionData.saves?.fortitude || 0}</span>
              </div>
              <div className="defense">
                <span className="defense-label">Reflex</span>
                <span className="defense-value">+{companionData.saves?.reflex || 0}</span>
              </div>
              <div className="defense">
                <span className="defense-label">Will</span>
                <span className="defense-value">+{companionData.saves?.will || 0}</span>
              </div>
            </div>

            <div className="companion-details">
              {/* Skills */}
              {companionData.skills && (
                <div className="companion-section">
                  <h4 style={{ color: themeColor }}>Skills</h4>
                  <p>{companionData.skills.join(", ")}</p>
                </div>
              )}
              
              {/* Strikes */}
              {companionData.strikes && companionData.strikes.length > 0 && (
                <div className="companion-section">
                  <h4 style={{ color: themeColor }}>Strikes</h4>
                  <div className="companion-strikes-list">
                    {companionData.strikes.map((strike, index) => (
                      <div key={index} className="companion-strike">
                        <div className="strike-header">
                          <h5>{strike.name}</h5>
                          <h5 className="strike-details">{strike.damage} {getCompanionAbilityMod(companionData.abilities?.strength)}</h5>
                          <div className="strike-traits">
                            {strike.traits && strike.traits.map((trait, i) => (
                              <span key={i} className="trait-tag">{trait}</span>
                            ))}
                          </div>
                        </div>
                        
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Support Benefit */}
              {companionData.support && (
                <div className="companion-section">
                  <h4 style={{ color: themeColor }}>Support Benefit</h4>
                  <p>{companionData.support}</p>
                </div>
              )}
              
              {/* Special Abilities */}
              {companionData.abilities && companionData.abilities.length > 0 && (
                <div className="companion-section">
                  <h4 style={{ color: themeColor }}>Special Abilities</h4>
                  <div className="companion-abilities-list">
                    {companionData.abilities.map((ability, index) => (
                      <div key={index} className="companion-ability">
                        <h5>{ability.name}</h5>
                        <p>{ability.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Description */}
              {companionData.description && (
                <div className="companion-section">
                  <h4 style={{ color: themeColor }}>Description</h4>
                  <p>{companionData.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnimalCompanionModal;