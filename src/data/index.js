// Import sample character data
import IzzyUncut from './IzzyUncut.json';
import AshkaBGosh from './AshkaBGosh.json';
import JadeInferno from './JadeInferno.json';
import Blu_Kakke from './Blu-Kakke.json';
import Pellias from './Pellias.json';
import loreData from './lore.json';
import questsData from './quests.json';

// Export an array of all available character data
export const sampleCharacters = [
  AshkaBGosh,
  Blu_Kakke,
  IzzyUncut,
  JadeInferno,
  Pellias
];

// Export the lore data
export const loreEntries = loreData.loreEntries;

// Export the quests data directly from the JSON
export const quests = questsData.quests;