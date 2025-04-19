import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import StatsBlock from '../components/character-sheet/StatsBlock';
import EnhancedSkillsList from '../components/character-sheet/EnhancedSkillsList';
import FeatsList from '../components/character-sheet/FeatsList';
import SpellsList from '../components/character-sheet/SpellsList';
import { 
  calculateBulkLimit, 
  calculateTotalBulk, 
  formatBulk, 
  poundsToBulk 
} from '../utils/CharacterUtils';
import './CharacterSheet.css';

const CharacterSheet = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getCharacter, setActiveCharacter } = useContext(CharacterContext);
  const [character, setCharacter] = useState(null);
  const [activeTab, setActiveTab] = useState('skills'); // Default tab
  const [bulkUsed, setBulkUsed] = useState(0);
  
  useEffect(() => {
    const characterData = getCharacter(id);
    if (characterData) {
      setCharacter(characterData);
      setActiveCharacter(characterData);
      const totalBulk = calculateTotalBulk(characterData.inventory);
      setBulkUsed(totalBulk);
    } else {
      navigate('/');
    }
  }, [id, getCharacter, setActiveCharacter, navigate]);
  
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
    return '#5e2929'; // Default color from theme
  };
  
  // Check if character has spellcasting
  const hasSpellcasting = character.spellcasting && character.spellcasting.tradition;
  
  // Function to render the active tab content
  const renderTabContent = () => {
    switch(activeTab) {
      case 'skills':
        return <EnhancedSkillsList character={character} />;
      case 'feats':
        return <FeatsList character={character} />;
      case 'spells':
        return <SpellsList character={character} />;
      case 'inventory':
        return (
          <div className="inventory-tab">
            <h2>Inventory</h2>
            
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
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Bulk</th>
                    <th>Description</th>
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
        return <EnhancedSkillsList character={character} />;
    }
  };
  
  return (
    <div className="character-sheet">
      <div className="character-header">
        <h1>{character.name}</h1>
        <p className="character-subtitle">
          Level {character.level} {character.ancestry} {character.background} {character.class}
        </p>
      </div>
      
      <div className="character-content">
        <StatsBlock character={character} />
        
        <div className="character-tabs">
          <div className="tabs-header">
            <button 
              className={`tab-button ${activeTab === 'skills' ? 'active' : ''}`}
              onClick={() => setActiveTab('skills')}
            >
              Skills
            </button>
            <button 
              className={`tab-button ${activeTab === 'feats' ? 'active' : ''}`}
              onClick={() => setActiveTab('feats')}
            >
              Feats & Abilities
            </button>
            {/* Only show spellcasting tab if character has spellcasting */}
            {hasSpellcasting && (
              <button 
                className={`tab-button ${activeTab === 'spells' ? 'active' : ''}`}
                onClick={() => setActiveTab('spells')}
              >
                Spellcasting
              </button>
            )}
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
    </div>
  );
};

export default CharacterSheet;