// Import sample character data
import IzzyUncut from './IzzyUncut.json';
import AshkaBGosh from './AshkaBGosh.json';
import JadeInferno from './JadeInferno.json';
import Blu_Kakke from './Blu-Kakke.json';
import Pellias from './Pellias.json';
//import CarmaleighZ from './CarmaleighZuhnyons.json';
import locationEntries from './lore/locations.json';
import npcEntries from './lore/npcs.json';
import religionEntries from './lore/religions.json';
import historyEntries from './lore/history.json';
import factionEntries from './lore/factions.json';
import organizationEntries from './lore/organizations.json';
import questsData from './quests.json';
import reputationData from './reputation.json';

// Export an array of all available character data
export const sampleCharacters = [
  AshkaBGosh,
  Blu_Kakke,
  IzzyUncut,
  JadeInferno,
  Pellias
  //CarmaleighZ
];

// Export the lore data
export const loreEntries = [
  ...locationEntries,
  ...npcEntries,
  ...religionEntries,
  ...historyEntries,
  ...factionEntries,
  ...organizationEntries,
];

// Export the quests data directly from the JSON
export const quests = questsData.quests;

// Export the reputation data
export const reputation = reputationData;