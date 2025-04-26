// src/components/character-sheet/FamiliarModal.js
import React from 'react';
import './FamiliarModal.css';

const FamiliarModal = ({ isOpen, onClose, familiar, character, characterColor }) => {
  if (!isOpen) return null;
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';

  

  // Use provided familiar data or defaults
  const familiarData = familiar;

  return (
    <div className="familiar-modal-overlay" onClick={onClose}>
      <div className="familiar-modal" onClick={(e) => e.stopPropagation()}>
        <div className="familiar-modal-header" style={{ backgroundColor: themeColor }}>
          <h2>{familiarData.name}</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        
        <div className="familiar-modal-content">
          <div className="familiar-basic-info">
            <div className="familiar-traits">
              <span className="trait-label">Type:</span> 
              <span className="trait-value">{familiarData.type}</span>
              
              <span className="trait-label">Size:</span> 
              <span className="trait-value">{familiarData.size}</span>
              
              {familiarData.traits && (
                <>
                  <span className="trait-label">Traits:</span> 
                  <span className="trait-value">{familiarData.traits.join(", ")}</span>
                </>
              )}
            </div>
          </div>
          
          <div className="familiar-stats">
            
            
            <div className="familiar-defenses">
              <div className="defense">
                <span className="defense-label">AC</span>
                <span className="defense-value">{familiarData.ac}</span>
              </div>
              <div className="defense">
                <span className="defense-label">HP</span>
                <span className="defense-value">{familiarData.hp}</span>
              </div>
              <div className="defense">
                <span className="defense-label">Speed</span>
                <span className="defense-value">{familiarData.speed}</span>
              </div>
            </div>
            <div className="familiar-defenses">
              <div className="defense">
                <span className="defense-label">Fortitude</span>
                <span className="defense-value">+{character.saves.fortitude}</span>
              </div>
              <div className="defense">
                <span className="defense-label">Reflex</span>
                <span className="defense-value">+{character.saves.reflex}</span>
              </div>
              <div className="defense">
                <span className="defense-label">Will</span>
                <span className="defense-value">+{character.saves.will}</span>
              </div>
            </div>

            <div className="familiar-details">
              {familiarData.skills && (
                <div className="familiar-section">
                  <h4 style={{ color: themeColor }}>Skills</h4>
                  <p>{familiarData.skills.join(", ")}: +7</p>
                  <p>All Other Skills: +3</p>
                </div>
              )}
              
              {familiarData.senses && (
                <div className="familiar-section">
                  <h4 style={{ color: themeColor }}>Senses</h4>
                  <p>{familiarData.senses.join(", ")}</p>
                </div>
              )}
              
              {familiarData.communication && (
                <div className="familiar-section">
                  <h4 style={{ color: themeColor }}>Communication</h4>
                  <p>{familiarData.communication}</p>
                </div>
              )}
              
              {familiarData.abilities && (
                <div className="familiar-section">
                  <h4 style={{ color: themeColor }}>Familiar Abilities</h4>
                  <div className="familiar-abilities-list">
                    {familiarData.abilities.map((ability, index) => (
                      <div key={index} className="familiar-ability">
                        <h5>{ability.name}</h5>
                        <p>{ability.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {familiarData.description && (
                <div className="familiar-section">
                  <h4 style={{ color: themeColor }}>Description</h4>
                  <p>{familiarData.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FamiliarModal;