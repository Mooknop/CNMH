import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import { useLore } from '../contexts/LoreContext';
import { useContent } from '../contexts/ContentContext';
import StatsBlock from '../components/character-sheet/StatsBlock';
import ActionsList from '../components/actions/ActionsList';
import ExplorationList from '../components/actions/ExplorationList';
import FamiliarModal from '../components/character-sheet/FamiliarModal';
import AnimalCompanionModal from '../components/character-sheet/AnimalCompanionModal';
import ItemModal from '../components/inventory/ItemModal';
import InventoryTab from '../components/inventory/InventoryTab';
import HandsPanel from '../components/character-sheet/HandsPanel';
import InitiativeEntry from '../components/encounter/InitiativeEntry';
import TurnTrackerPanel from '../components/encounter/TurnTrackerPanel';
import SavePrompt from '../components/encounter/SavePrompt';

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
    // Wait for the server snapshot before deciding to redirect — otherwise the
    // initial render runs while characters=FALLBACK and would push us to '/'
    // every time a direct deep-link landed on a character not in the bundled
    // defaults (e.g., a freshly-seeded character on staging).
    if (loading) return;
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

  if (!character || !characterModel) return <div data-testid="character-loading">Loading character...</div>;

  const { flags, familiar, animalCompanion } = characterModel;
  const { hasFamiliar, hasAnimalCompanion } = flags;
  
  // Function to render the active tab content
  const renderTabContent = () => {
    switch(activeTab) {
      case 'encounter':
        return (
          <>
            <SavePrompt charId={character.id} characterName={character.name} saves={characterModel.saves} />
            <InitiativeEntry charId={character.id} />
            <TurnTrackerPanel charId={character.id} characterName={character.name} inventory={characterModel.inventory} />
            <HandsPanel character={character} characterColor={characterColor} />
            <ActionsList character={character} characterColor={characterColor} />
            <CombatLogPanel />
          </>
        );
      case 'exploration':
        return <ExplorationList character={character} characterColor={characterColor} />;
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
    <div className="character-sheet-page" style={{ '--color-theme': characterColor }}>
    <div className="character-sheet">
      <div className="character-header">
        {character.image && (
          <img src={`/api/images/${character.image}`} alt="" className="entity-image" style={character.imagePosition ? { objectPosition: `${character.imagePosition.x}% ${character.imagePosition.y}%` } : undefined} />
        )}
        <h1>{character.name}</h1>
        <p className="character-subtitle">
          Level {character.level} {character.ancestry} {character.background} {character.class}
        </p>
        
        {/* Add Familiar button if character has the Familiar feat */}
          <div className="character-actions">
            {character.loreEntryId && loreEntries.some(e => e.id === character.loreEntryId) && (
              <button
                className="familiar-button"
                onClick={() => openLore(character.loreEntryId)}
              >
                <span role="img" aria-label="Lore">📖</span>
                Lore
              </button>
            )}

            {hasFamiliar && (
              <button
                className="familiar-button"
                onClick={() => setIsFamiliarModalOpen(true)}
              >
                <span className="familiar-icon" role="img" aria-label="Familiar">🐾</span>
                {familiar.name}
              </button>
            )}

            {hasAnimalCompanion && (
              <button
                className="familiar-button"
                onClick={() => setIsAnimalCompanionOpen(true)}
              >
                <span className="familiar-icon" role="img" aria-label="Animal Companion">🐾</span>
                {animalCompanion.name}
              </button>
            )}

            <button
              className="familiar-button"
              onClick={() => setIsEffectsModalOpen(true)}
              style={{ backgroundColor: '#2e7d32' }}
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
            >
              Encounter
            </button>

            <button
              className={`tab-button ${activeTab === 'exploration' ? 'active' : ''}`}
              onClick={() => setActiveTab('exploration')}
            >
              Exploration
            </button>

            <button
              className={`tab-button ${activeTab === 'inventory' ? 'active' : ''}`}
              onClick={() => setActiveTab('inventory')}
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