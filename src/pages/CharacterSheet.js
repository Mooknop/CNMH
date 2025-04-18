import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import StatsBlock from '../components/character-sheet/StatsBlock';
import SkillsList from '../components/character-sheet/SkillsList';
import FeatsList from '../components/character-sheet/FeatsList';
import './CharacterSheet.css';

const CharacterSheet = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getCharacter, setActiveCharacter } = useContext(CharacterContext);
  const [character, setCharacter] = useState(null);
  const [activeTab, setActiveTab] = useState('skills'); // Default tab
  
  useEffect(() => {
    const characterData = getCharacter(id);
    if (characterData) {
      setCharacter(characterData);
      setActiveCharacter(characterData);
    } else {
      navigate('/');
    }
  }, [id, getCharacter, setActiveCharacter, navigate]);
  
  if (!character) return <div>Loading character...</div>;
  
  // Function to render the active tab content
  const renderTabContent = () => {
    switch(activeTab) {
      case 'skills':
        return <SkillsList character={character} />;
      case 'feats':
        return <FeatsList character={character} />;
      case 'inventory':
        // We'll render the inventory directly here rather than navigating to a separate page
        return (
          <div className="inventory-tab">
            <h2>Inventory</h2>
            <div className="inventory-list">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Weight</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {character.inventory && character.inventory.length > 0 ? (
                    character.inventory.map(item => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.quantity}</td>
                        <td>{item.weight} lbs</td>
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
        return <SkillsList character={character} />;
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