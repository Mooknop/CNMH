import React, { useState } from 'react';
import './FeatsList.css';

const FeatsList = ({ character, characterColor }) => {
  // Sort feats by level
  const sortedFeats = [...(character.feats || [])].sort((a, b) => a.level - b.level);
  
  // State to track which section is expanded (feats or focus spells)
  const [activeSection, setActiveSection] = useState('feats');
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';
  
  // Check if character has focus spells
  const hasFocusSpells = () => {
    // Check each character class for focus spells
    if (character.champion && character.champion.devotion_spells) {
      return true;
    }
    if (character.spellcasting && character.spellcasting.focus) {
      return true;
    }
    if (character.monk && character.monk.ki_spells) {
      return true;
    }
    return false;
  };
  
  // Get the label for focus spells based on character class
  const getFocusSpellsLabel = () => {
    if (character.champion) {
      return 'Devotion Spells';
    }
    if (character.monk) {
      return 'Qi Spells';
    }
    if (character.class === 'Bard') {
      return 'Compositions';
    }
    if (character.spellcasting && character.spellcasting.bloodline) {
      return 'Focus Spells';
    }
    return 'Focus Spells';
  };
  
  // Get focus spells for the character
  const getFocusSpells = () => {
    if (character.champion && character.champion.devotion_spells) {
      return character.champion.devotion_spells;
    }
    if (character.monk && character.monk.ki_spells) {
      return character.monk.ki_spells;
    }
    if (character.spellcasting && character.spellcasting.bloodline && character.spellcasting.bloodline.focus_spells) {
      return character.spellcasting.bloodline.focus_spells;
    }
    if (character.focus_spells) {
      return character.focus_spells;
    }
    return [];
  };
  
  // Get focus points for the character
  const getFocusPoints = () => {
    if (character.champion && character.champion.focus_points !== undefined) {
      return character.champion.focus_points;
    }
    if (character.monk && character.monk.focus_points !== undefined) {
      return character.monk.focus_points;
    }
    if (character.spellcasting && character.spellcasting.focus && character.spellcasting.focus.max !== undefined) {
      return character.spellcasting.focus.max;
    }
    return null;
  };
  
  // Focus spells and focus pool info
  const focusSpellsLabel = getFocusSpellsLabel();
  const focusSpells = getFocusSpells();
  const focusPoints = getFocusPoints();
  
  return (
    <div className="feats-list">
      <h2 style={{ color: themeColor }}>Feats & Abilities</h2>
      
      {/* Section tabs - only display if character has focus spells */}
      {hasFocusSpells() && (
        <div className="ability-section-tabs">
          <button 
            className={`section-tab ${activeSection === 'feats' ? 'active' : ''}`}
            onClick={() => setActiveSection('feats')}
            style={{ 
              backgroundColor: activeSection === 'feats' ? themeColor : '',
              borderColor: activeSection === 'feats' ? themeColor : '' 
            }}
          >
            Feats
          </button>
          <button 
            className={`section-tab ${activeSection === 'focus' ? 'active' : ''}`}
            onClick={() => setActiveSection('focus')}
            style={{ 
              backgroundColor: activeSection === 'focus' ? themeColor : '',
              borderColor: activeSection === 'focus' ? themeColor : '' 
            }}
          >
            {focusSpellsLabel}
          </button>
        </div>
      )}
      
      {/* Feats Section */}
      {activeSection === 'feats' && (
        <div className="feats-grid">
          {sortedFeats.length > 0 ? (
            sortedFeats.map(feat => (
              <div key={feat.id} className="feat-card">
                <div className="feat-header" style={{ backgroundColor: '#f0f0f0' }}>
                  <h3 style={{ color: themeColor }}>{feat.name}</h3>
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
      )}
      
      {/* Focus Spells Section */}
      {activeSection === 'focus' && (
        <div className="focus-spells-section">
          {/* Focus Points Display */}
          {focusPoints !== null && (
            <div className="focus-points-display" style={{ borderColor: themeColor }}>
              <span className="focus-points-label">Focus Points:</span>
              <span className="focus-points-value">{focusPoints}</span>
            </div>
          )}
          
          {/* Focus Spells Grid */}
          <div className="focus-spells-grid">
            {focusSpells.length > 0 ? (
              focusSpells.map((spell, index) => (
                <div key={spell.id || `focus-spell-${index}`} className="focus-spell-card">
                  <div className="focus-spell-header" style={{ backgroundColor: '#f0f0f0' }}>
                    <h3 style={{ color: themeColor }}>{spell.name}</h3>
                    {spell.level !== undefined && (
                      <span className="focus-spell-level" style={{ backgroundColor: themeColor }}>
                        Level {Math.ceil(character.level/2)}
                      </span>
                    )}
                  </div>
                  
                  {/* Spell Traits */}
                  {spell.traits && spell.traits.length > 0 && (
                    <div className="focus-spell-traits">
                      {spell.traits.map((trait, i) => (
                        <span key={i} className="focus-spell-trait">{trait}</span>
                      ))}
                    </div>
                  )}
                  
                  {/* Spell Details */}
                  <div className="focus-spell-details">
                    {spell.actions && (
                      <div className="focus-spell-actions">
                        <span className="detail-label">Actions:</span>
                        <span className="detail-value">{spell.actions}</span>
                      </div>
                    )}
                    
                    {spell.range && (
                      <div className="focus-spell-range">
                        <span className="detail-label">Range:</span>
                        <span className="detail-value">{spell.range}</span>
                      </div>
                    )}
                    
                    {spell.targets && (
                      <div className="focus-spell-targets">
                        <span className="detail-label">Targets:</span>
                        <span className="detail-value">{spell.targets}</span>
                      </div>
                    )}
                    
                    {spell.area && (
                      <div className="focus-spell-area">
                        <span className="detail-label">Area:</span>
                        <span className="detail-value">{spell.area}</span>
                      </div>
                    )}
                    
                    {spell.duration && (
                      <div className="focus-spell-duration">
                        <span className="detail-label">Duration:</span>
                        <span className="detail-value">{spell.duration}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Spell Description */}
                  <div className="focus-spell-description">
                    {spell.description}
                  </div>
                  
                  {/* Heightened Effects */}
                  {spell.heightened && (
                    <div className="focus-spell-heightened">
                      <div className="heightened-label" style={{ color: themeColor }}>Heightened:</div>
                      {Object.entries(spell.heightened).map(([level, effect], i) => (
                        <div key={i} className="heightened-entry">
                          <span className="heightened-level">{level}:</span>
                          <span className="heightened-effect">{effect}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>No {focusSpellsLabel.toLowerCase()} available.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FeatsList;