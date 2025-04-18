// This file will handle importing all character data files

// Import sample character data
import sampleCharacter1 from './sample-character.json';
import sampleCharacter2 from './sample-character2.json';
import loreData from './lore.json';

// Export an array of all available character data
export const sampleCharacters = [
  sampleCharacter1,
  sampleCharacter2
];

// Export the lore data
export const loreEntries = loreData.loreEntries;