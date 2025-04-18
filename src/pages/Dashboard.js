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
  
  return (
    <div className="dashboard">
      <h1>Pathfinder 2E Characters</h1>
      
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