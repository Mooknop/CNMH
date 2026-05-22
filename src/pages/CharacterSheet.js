import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import { useLore } from '../contexts/LoreContext';
import { useContent } from '../contexts/ContentContext';
import StatsBlock from '../components/character-sheet/StatsBlock';
import SpellsList from '../components/spells/SpellsList';
import ActionsList from '../components/actions/ActionsList';
import ExplorationList from '../components/actions/ExplorationList';
import FamiliarModal from '../components/character-sheet/FamiliarModal';
import AnimalCompanionModal from '../components/character-sheet/AnimalCompanionModal';
import ItemModal from '../components/inventory/ItemModal';
import InventoryTab from '../components/inventory/InventoryTab';
import HandsPanel from '../components/character-sheet/HandsPanel';
import InitiativeEntry from '../components/encounter/InitiativeEntry';
import TurnTrackerPanel from '../components/encounter/TurnTrackerPanel';
import CombatLogPanel from '../components/encounter/CombatLogPanel';
import EffectsPanel from '../components/character-sheet/EffectsPanel';
import EffectsModal from '../components/character-sheet/EffectsModal';
import { useCharacter } from '../hooks/useCharacter';
import './CharacterSheet.css';

const CharacterSheet = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getCharacter, setActiveCharacter, activeCharacterColor } = useContext(CharacterContext);
  const [character, setCharacter] = useState(null);
  const [activeTab, setActiveTab] = useState('encounter');
  const [isFamiliarModalOpen, setIsFamiliarModalOpen] = useState(false);
  const [isAnimalCompanionOpen, setIsAnimalCompanionOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isEffectsModalOpen, setIsEffectsModalOpen] = useState(false);

  // characterColor is now derived by CharacterContext from the active character's index
  const characterColor = activeCharacterColor;
  const { openLore } = useLore();
  const { loreEntries, loading } = useContent();

  useEffect(() => {
    if (loading) return; // wait for server content before deciding to redirect
    const characterData = getCharacter(id);
    if (characterData) {
      setCharacter(characterData);
      setActiveCharacter(characterData);
    } else {
      navigate('/');
    }
  }, [id, loading, getCharacter, setActiveCharacter, navigate]);
  
  // Handle opening the item detail modal
  const handleItemClick = (item) => {
    setSelectedItem(item);
    setIsItemModalOpen(true);
  };
  
  // Handle closing the item detail modal
  const closeItemModal = () => {
    setIsItemModalOpen(false);
  };
  
  // Data layer — all character reads go through this hook
  const characterModel = useCharacter(character);

  if (!character || !characterModel) return <div>Loading character...</div>;

  const { flags, familiar, animalCompanion } = characterModel;
  const { hasFamiliar, hasAnimalCompanion, hasSpellcasting, hasFocusSpells } = flags;
  
  // Function to render the active tab content
  const renderTabContent = () => {
    switch(activeTab) {
      case 'encounter':
        return (
          <>
            <InitiativeEntry charId={character.id} />
            <TurnTrackerPanel charId={character.id} characterName={character.name} />
            <HandsPanel character={character} characterColor={characterColor} />
            <ActionsList character={character} characterColor={characterColor} />
            <CombatLogPanel />
          </>
        );
      case 'exploration':
        return <ExplorationList character={character} characterColor={characterColor} />;
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
    <div className="character-sheet-page">
    <div className="character-sheet">
      <div className="character-header">
        <h1 style={{ color: characterColor }}>{character.name}</h1>
        <p className="character-subtitle">
          Level {character.level} {character.ancestry} {character.background} {character.class}
        </p>
        
        {/* Add Familiar button if character has the Familiar feat */}
          <div className="character-actions">
            {character.loreEntryId && loreEntries.some(e => e.id === character.loreEntryId) && (
              <button
                className="familiar-button"
                onClick={() => openLore(character.loreEntryId)}
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
                <span role="img" aria-label="Lore">📖</span>
                Lore
              </button>
            )}

            {hasFamiliar && (
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
                {familiar.name}
              </button>
            )}

            {hasAnimalCompanion && (
              <button
                className="familiar-button"
                onClick={() => setIsAnimalCompanionOpen(true)}
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
                <span className="familiar-icon" role="img" aria-label="Animal Companion">🐾</span>
                {animalCompanion.name}
              </button>
            )}

            <button
              className="familiar-button"
              onClick={() => setIsEffectsModalOpen(true)}
              style={{
                backgroundColor: '#2e7d32',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              ✦ Apply Effect
            </button>
          </div>
      </div>
      
      <div className="character-content">
        <StatsBlock character={character} characterColor={characterColor} />
        <EffectsPanel charId={character.id} themeColor={characterColor} />
        
        <div className="character-tabs">
          <div className="tabs-header">
            <button
              className={`tab-button ${activeTab === 'encounter' ? 'active' : ''}`}
              onClick={() => setActiveTab('encounter')}
              style={{ backgroundColor: activeTab === 'encounter' ? characterColor : '' }}
            >
              Encounter
            </button>

            <button
              className={`tab-button ${activeTab === 'exploration' ? 'active' : ''}`}
              onClick={() => setActiveTab('exploration')}
              style={{ backgroundColor: activeTab === 'exploration' ? characterColor : '' }}
            >
              Exploration
            </button>

            {/* Combined spellcasting tab - only shown if character has spellcasting OR focus spells */}
            {(hasSpellcasting || hasFocusSpells) && (
              <button 
                className={`tab-button ${activeTab === 'spells' ? 'active' : ''}`}
                onClick={() => setActiveTab('spells')}
                style={{ backgroundColor: activeTab === 'spells' ? characterColor : '' }}
              >
                Magic
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

      {/* Animal Companion Modal */}
      <AnimalCompanionModal
        isOpen={isAnimalCompanionOpen}
        onClose={() => setIsAnimalCompanionOpen(false)}
        animalCompanion={animalCompanion}
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

      {/* Effects Modal */}
      <EffectsModal
        isOpen={isEffectsModalOpen}
        onClose={() => setIsEffectsModalOpen(false)}
        themeColor={characterColor}
        selfCharId={character.id}
        selfName={character.name}
      />
    </div>
    </div>
  );
};

export default CharacterSheet;