import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import CharacterCard from '../components/characters/CharacterCard';
import './Dashboard.css';

const Dashboard = () => {
  const { characters, setActiveCharacter } = useContext(CharacterContext);
  const navigate = useNavigate();
  
  const handleSelectCharacter = (character) => {
    setActiveCharacter(character);
    navigate(`/character/${character.id}`);
  };
  
  const navigateTo = (path) => {
    navigate(path);
  };
  
  return (
    <div className="dashboard">
      <h1>Unnamed Group of Adventurers from Osprey Cove</h1>
      
      <div className="dashboard-links">
        <button 
          className="dashboard-link-btn quest-btn"
          onClick={() => navigateTo('/quests')}
        >
          <span className="btn-icon">📜</span>
          <span className="btn-text">Quest Tracker</span>
        </button>
        <button 
          className="dashboard-link-btn lore-btn"
          onClick={() => navigateTo('/lore')}
        >
          <span className="btn-icon">📚</span>
          <span className="btn-text">Campaign Lore</span>
        </button>
      </div>
      
      <h2 className="characters-heading">Characters</h2>
      <div className="character-grid">
        {characters.map(character => (
          <CharacterCard 
            key={character.id}
            character={character}
            onSelect={() => handleSelectCharacter(character)}
          />
        ))}
      </div>
    </div>
  );
};

export default Dashboard;