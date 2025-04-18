import React, { createContext, useState, useEffect } from 'react';
// Import the character data from our data index
import { sampleCharacters } from '../data';

export const CharacterContext = createContext();

export const CharacterProvider = ({ children }) => {
  const [characters, setCharacters] = useState(sampleCharacters);
  const [activeCharacter, setActiveCharacter] = useState(null);
  
  // Function to get a character by ID
  const getCharacter = (id) => {
    return characters.find(char => char.id === id) || null;
  };
  
  return (
    <CharacterContext.Provider value={{
      characters,
      activeCharacter,
      setActiveCharacter,
      getCharacter
    }}>
      {children}
    </CharacterContext.Provider>
  );
};