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
        <SkillsList character={character} />
        <FeatsList character={character} />
      </div>
    </div>
  );
};

export default CharacterSheet;