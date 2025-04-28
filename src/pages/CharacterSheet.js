import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import StatsBlock from '../components/character-sheet/StatsBlock';
import FeatsList from '../components/character-sheet/FeatsList';
import SpellsList from '../components/spells/SpellsList';
import ActionsList from '../components/actions/ActionsList';
import FamiliarModal from '../components/character-sheet/FamiliarModal';
import ItemModal from '../components/inventory/ItemModal';
import InventoryTab from '../components/inventory/InventoryTab';
import { 
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

  // Check if character has spellcasting
  const hasSpellcasting = character.spellcasting && character.spellcasting.tradition;
  
  // Function to render the active tab content
  const renderTabContent = () => {
    switch(activeTab) {
      case 'actions':
        return <ActionsList character={character} characterColor={characterColor} />;
      case 'feats':
        return <FeatsList character={character} characterColor={characterColor} />;
      case 'spells':
        return <SpellsList character={character} characterColor={characterColor} />;
      case 'inventory':
        return (
          <InventoryTab 
            character={character} 
            characterColor={characterColor} 
            onItemClick={handleItemClick} 
          />
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
            
            {/* Combined spellcasting tab - only shown if character has spellcasting OR focus spells */}
            {(hasSpellcasting || character.focus_spells || character.champion?.devotion_spells || character.monk?.ki_spells) && (
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