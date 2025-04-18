import React from 'react';
import './CharacterCard.css';

const CharacterCard = ({ character, onSelect }) => {
  return (
    <div className="character-card" onClick={onSelect}>
      <div className="character-portrait">
        {character.avatar ? (
          <img src={character.avatar} alt={character.name} />
        ) : (
          <div className="avatar-placeholder">{character.name.charAt(0)}</div>
        )}
      </div>
      <div className="character-details">
        <h3>{character.name}</h3>
        <p>{character.ancestry} {character.background} {character.class}</p>
        <p>Level {character.level}</p>
      </div>
    </div>
  );
};

export default CharacterCard;