import React, { createContext, useState, useMemo } from 'react';
import { sampleCharacters } from '../data';
import { getCharacterColor } from '../utils/CharacterUtils';

export const CharacterContext = createContext();

export const CharacterProvider = ({ children }) => {
  const [characters, setCharacters] = useState(sampleCharacters);
  const [activeCharacter, setActiveCharacter] = useState(null);

  const getCharacter = (id) => {
    return characters.find(char => char.id === id) || null;
  };

  // Derive the active character's theme color from its position in the characters array.
  // Components can read this from context instead of receiving it as a prop.
  const activeCharacterColor = useMemo(() => {
    if (!activeCharacter) return 'var(--color-primary)';
    const index = characters.findIndex(c => c.id === activeCharacter.id);
    return index !== -1 ? getCharacterColor(index) : 'var(--color-primary)';
  }, [activeCharacter, characters]);

  return (
    <CharacterContext.Provider value={{
      characters,
      activeCharacter,
      setActiveCharacter,
      getCharacter,
      activeCharacterColor,
    }}>
      {children}
    </CharacterContext.Provider>
  );
};
