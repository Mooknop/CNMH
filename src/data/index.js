// Import sample character data
import sampleCharacter1 from './sample-character.json';
import sampleCharacter2 from './sample-character2.json';
import sampleCharacter3 from './sample-character3.json';
import sampleCharacter4 from './sample-character4.json';
import sampleCharacter5 from './sample-character5.json'; // New import for Pellias
import loreData from './lore.json';
import questsData from './quests.json';

// Export an array of all available character data
export const sampleCharacters = [
  sampleCharacter1,
  sampleCharacter2,
  sampleCharacter3,
  sampleCharacter4,
  sampleCharacter5
];

// Export the lore data
export const loreEntries = loreData.loreEntries;

// Export the quests data directly from the JSON
export const quests = questsData.quests;