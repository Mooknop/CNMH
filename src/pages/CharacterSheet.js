import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import StatsBlock from '../components/character-sheet/StatsBlock';
import FeatsList from '../components/character-sheet/FeatsList';
import SpellsList from '../components/character-sheet/SpellsList';
import ActionsList from '../components/character-sheet/ActionsList';
import { 
  calculateBulkLimit, 
  calculateTotalBulk, 
  formatBulk, 
  poundsToBulk,
  getCharacterColor
} from '../utils/CharacterUtils';
import './CharacterSheet.css';

const CharacterSheet = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getCharacter, setActiveCharacter, characters } = useContext(CharacterContext);
  const [character, setCharacter] = useState(null);
  const [activeTab, setActiveTab] = useState('actions'); // Default tab
  const [bulkUsed, setBulkUsed] = useState(0);
  const [characterColor, setCharacterColor] = useState('#5e2929'); // Default theme color
  
  useEffect(() => {
    const characterData = getCharacter(id);
    if (characterData) {
      setCharacter(characterData);
      setActiveCharacter(characterData);
      
      // Find character's index in the characters array for color
      const characterIndex = characters.findIndex(char => char.id === id);
      if (characterIndex !== -1) {
        setCharacterColor(getCharacterColor(characterIndex));
      }
      
      const totalBulk = calculateTotalBulk(characterData.inventory);
      setBulkUsed(totalBulk);
    } else {
      navigate('/');
    }
  }, [id, getCharacter, setActiveCharacter, navigate, characters]);
  
  if (!character) return <div>Loading character...</div>;
  
  // Bulk calculations
  const { bulkLimit, encumberedThreshold } = calculateBulkLimit(character);
  const bulkPercentage = (bulkUsed / bulkLimit) * 100;
  const isEncumbered = bulkUsed > encumberedThreshold && bulkUsed <= bulkLimit;
  const isOverencumbered = bulkUsed > bulkLimit;
  
  // Determine the color of the bulk bar
  const getBulkBarColor = () => {
    if (isOverencumbered) return '#b71c1c'; // Red for overencumbered
    if (isEncumbered) return '#f57c00'; // Orange for encumbered
    if (bulkPercentage > 75) return '#ffc107'; // Yellow when getting close
    return characterColor; // Use character's color theme
  };
  
  // Check if character has spellcasting
  const hasSpellcasting = character.spellcasting && character.spellcasting.tradition;
  
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
    if (character.focus_spells && character.focus_spells.length > 0) {
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
      return 'Ki Spells';
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
  const hasFocusSpellsAvailable = hasFocusSpells();
  const focusSpellsLabel = getFocusSpellsLabel();
  const focusSpells = getFocusSpells();
  const focusPoints = getFocusPoints();
  
  // Function to render the active tab content
  const renderTabContent = () => {
    switch(activeTab) {
      case 'actions':
        return <ActionsList character={character} characterColor={characterColor} />;
      case 'feats':
        return <FeatsList character={character} characterColor={characterColor} />;
      case 'focus-spells':
        return (
          <div className="focus-spells-section">
            {/* Focus Points Display */}
            {focusPoints !== null && (
              <div className="focus-points-display" style={{ borderColor: characterColor }}>
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
                      <h3 style={{ color: characterColor }}>{spell.name}</h3>
                      {spell.level !== undefined && (
                        <span className="focus-spell-level" style={{ backgroundColor: characterColor }}>
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
                        <div className="heightened-label" style={{ color: characterColor }}>Heightened:</div>
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
        );
      case 'spells':
        return <SpellsList character={character} characterColor={characterColor} />;
      case 'inventory':
        return (
          <div className="inventory-tab">
            <h2 style={{ color: characterColor }}>Inventory</h2>
            
            <div className="bulk-management">
              <div className="bulk-status">
                <div className="bulk-labels">
                  <span>Bulk Used: <strong>{formatBulk(bulkUsed)}</strong></span>
                  <span>Encumbered at: <strong>{encumberedThreshold}</strong></span>
                  <span>Maximum: <strong>{bulkLimit}</strong></span>
                </div>
                
                <div className="bulk-progress-container">
                  <div 
                    className="bulk-progress-bar" 
                    style={{ 
                      width: `${Math.min(bulkPercentage, 100)}%`,
                      backgroundColor: getBulkBarColor()
                    }}
                  />
                </div>
                
                {isEncumbered && !isOverencumbered && (
                  <div className="bulk-warning">
                    Encumbered: -10 feet to Speed and take a -1 penalty to Strength- and Dexterity-based checks
                  </div>
                )}
                
                {isOverencumbered && (
                  <div className="bulk-warning severe">
                    Overencumbered: -15 feet to Speed, take a -2 penalty to Strength- and Dexterity-based checks, and can't move if your Bulk exceeds twice your Bulk limit
                  </div>
                )}
              </div>
            </div>
            
            <div className="inventory-list">
              <table>
                <thead>
                  <tr>
                    <th style={{ backgroundColor: characterColor }}>Item</th>
                    <th style={{ backgroundColor: characterColor }}>Qty</th>
                    <th style={{ backgroundColor: characterColor }}>Bulk</th>
                    <th style={{ backgroundColor: characterColor }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {character.inventory && character.inventory.length > 0 ? (
                    character.inventory.map(item => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.quantity}</td>
                        <td>
                          {formatBulk(poundsToBulk(item.weight))}
                          {item.quantity > 1 && poundsToBulk(item.weight) > 0 && ` (total: ${formatBulk(poundsToBulk(item.weight) * item.quantity)})`}
                        </td>
                        <td>{item.description}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="empty-inventory">
                        No items in inventory
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      default:
        return <FeatsList character={character} characterColor={characterColor} />;
    }
  };
  
  return (
    <div className="character-sheet">
      <div className="character-header">
        <h1 style={{ color: characterColor }}>{character.name}</h1>
        <p className="character-subtitle">
          Level {character.level} {character.ancestry} {character.background} {character.class}
        </p>
      </div>
      
      <div className="character-content">
        <StatsBlock character={character} characterColor={characterColor} />
        
        <div className="character-tabs">
          <div className="tabs-header">
            <button 
              className={`tab-button ${activeTab === 'actions' ? 'active' : ''}`}
              onClick={() => setActiveTab('actions')}
              style={{ backgroundColor: activeTab === 'actions' ? characterColor : '' }}
            >
              Actions
            </button>
            
            <button 
              className={`tab-button ${activeTab === 'feats' ? 'active' : ''}`}
              onClick={() => setActiveTab('feats')}
              style={{ backgroundColor: activeTab === 'feats' ? characterColor : '' }}
            >
              Feats
            </button>
            
            {/* Focus Spells tab - only shown if character has focus spells */}
            {hasFocusSpellsAvailable && (
              <button 
                className={`tab-button ${activeTab === 'focus-spells' ? 'active' : ''}`}
                onClick={() => setActiveTab('focus-spells')}
                style={{ backgroundColor: activeTab === 'focus-spells' ? characterColor : '' }}
              >
                {focusSpellsLabel}
              </button>
            )}
            
            {/* Only show spellcasting tab if character has spellcasting */}
            {hasSpellcasting && (
              <button 
                className={`tab-button ${activeTab === 'spells' ? 'active' : ''}`}
                onClick={() => setActiveTab('spells')}
                style={{ backgroundColor: activeTab === 'spells' ? characterColor : '' }}
              >
                Spellcasting
              </button>
            )}
            
            <button 
              className={`tab-button ${activeTab === 'inventory' ? 'active' : ''}`}
              onClick={() => setActiveTab('inventory')}
              style={{ backgroundColor: activeTab === 'inventory' ? characterColor : '' }}
            >
              Inventory
            </button>
          </div>
          
          <div className="tab-content">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CharacterSheet;