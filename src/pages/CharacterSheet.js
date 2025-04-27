import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import StatsBlock from '../components/character-sheet/StatsBlock';
import FeatsList from '../components/character-sheet/FeatsList';
import SpellsList from '../components/spells/SpellsList';
import ActionsList from '../components/character-sheet/ActionsList';
import FocusSpellsList from '../components/spells/FocusSpellsList';
import FamiliarModal from '../components/character-sheet/FamiliarModal';
import ItemModal from '../components/character-sheet/ItemModal';
import { 
  calculateBulkLimit, 
  calculateTotalBulk, 
  formatBulk, 
  poundsToBulk,
  getCharacterColor,
  hasFeat
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
  const [isFamiliarModalOpen, setIsFamiliarModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  
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
  
  // Handle opening the item detail modal
  const handleItemClick = (item) => {
    setSelectedItem(item);
    setIsItemModalOpen(true);
  };
  
  // Handle closing the item detail modal
  const closeItemModal = () => {
    setIsItemModalOpen(false);
  };
  
  if (!character) return <div>Loading character...</div>;
    
  // Define familiar data
  const hasFamiliar = hasFeat(character, 'Familiar');
  const familiar = hasFamiliar ? character.familiar : null;

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
  
  // Function to render the active tab content
  const renderTabContent = () => {
    switch(activeTab) {
      case 'actions':
        return <ActionsList character={character} characterColor={characterColor} />;
      case 'feats':
        return <FeatsList character={character} characterColor={characterColor} />;
      case 'focus-spells':
        return <FocusSpellsList character={character} characterColor={characterColor} />;
      case 'spells':
        return <SpellsList character={character} characterColor={characterColor} />;
      case 'inventory':
        return (
          <div className="inventory-tab">
            <h2 style={{ color: characterColor }}>Inventory</h2>
            
            <div className="bulk-management">
              <div className="bulk-status">
                <div className="bulk-labels">
                  <span>Bulk Used: <strong>{formatBulk(bulkUsed.toFixed(1))}</strong></span>
                  <span>Encumbered at: <strong>{formatBulk(encumberedThreshold)}</strong></span>
                  <span>Maximum: <strong>{formatBulk(bulkLimit)}</strong></span>
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
                  </tr>
                </thead>
                <tbody>
                  {character.inventory && character.inventory.length > 0 ? (
                    character.inventory.map(item => (
                      <tr key={item.id}>
                        <td>
                          <button 
                            className="item-name" 
                            onClick={() => handleItemClick(item)}
                            style={{ color: characterColor }}
                          >
                            {item.name}
                          </button>
                        </td>
                        <td>{item.quantity}</td>
                        <td>
                          {formatBulk(poundsToBulk(item.weight))}
                        </td>
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
        return <ActionsList character={character} characterColor={characterColor} />;
    }
  };
  
  return (
    <div className="character-sheet">
      <div className="character-header">
        <h1 style={{ color: characterColor }}>{character.name}</h1>
        <p className="character-subtitle">
          Level {character.level} {character.ancestry} {character.background} {character.class}
        </p>
        
        {/* Add Familiar button if character has the Familiar feat */}
        {hasFamiliar && (
          <div className="character-actions">
            <button 
              className="familiar-button" 
              onClick={() => setIsFamiliarModalOpen(true)}
              style={{ 
                backgroundColor: characterColor,
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <span className="familiar-icon" role="img" aria-label="Familiar">🐾</span>
              Familiar
            </button>
          </div>
        )}
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
            {hasFocusSpells() && (
              <button 
                className={`tab-button ${activeTab === 'focus-spells' ? 'active' : ''}`}
                onClick={() => setActiveTab('focus-spells')}
                style={{ backgroundColor: activeTab === 'focus-spells' ? characterColor : '' }}
              >
                {getFocusSpellsLabel()}
              </button>
            )}
            
            {/* Only show spellcasting tab if character has spellcasting */}
            {hasSpellcasting && (
              <button 
                className={`tab-button ${activeTab === 'spells' ? 'active' : ''}`}
                onClick={() => setActiveTab('spells')}
                style={{ backgroundColor: activeTab === 'spells' ? characterColor : '' }}
              >
                Spells
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
      
      {/* Familiar Modal */}
      <FamiliarModal 
        isOpen={isFamiliarModalOpen} 
        onClose={() => setIsFamiliarModalOpen(false)} 
        familiar={familiar}
        character={character}
        characterColor={characterColor}
      />
      
      {/* Item Detail Modal */}
      {selectedItem && (
        <ItemModal
          isOpen={isItemModalOpen}
          onClose={closeItemModal}
          item={selectedItem}
          characterColor={characterColor}
        />
      )}
    </div>
  );
};

export default CharacterSheet;