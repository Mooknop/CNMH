import snapshot from './snapshot.json';

export const sampleCharacters = snapshot.character || [];
export const loreEntries      = snapshot.lore      || [];
export const quests           = snapshot.quest      || [];
export const items            = snapshot.item       || [];
export const spells           = snapshot.spell      || [];
export const effects          = snapshot.effect     || [];
export const traits           = snapshot.trait      || [];
export const calendarEvents   = snapshot.calendar   || [];
export const images           = snapshot.image      || [];
export const themeDocs        = snapshot.theme      || [];
export const runes            = snapshot.rune       || [];

// Preserve the { Factions: [...] } shape that contentUtils + ContentContext expect.
export const reputation = { Factions: snapshot.faction || [] };
