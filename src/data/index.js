// Bundled campaign seed. The canonical content-of-record lives as one JSON file
// per collection under ./snapshot/ (sharded from the old monolithic snapshot.json
// so content PRs touch only the collection they change and stop colliding). This
// module reassembles them into the named exports the app consumes — the runtime
// contract is unchanged; only the on-disk layout moved. `scripts/snapshotContent.js`
// writes these files from the live Durable Object.
import quest from './snapshot/quest.json';
import faction from './snapshot/faction.json';
import calendar from './snapshot/calendar.json';
import lore from './snapshot/lore.json';
import trait from './snapshot/trait.json';
import character from './snapshot/character.json';
import item from './snapshot/item.json';
import spell from './snapshot/spell.json';
import effect from './snapshot/effect.json';
import rune from './snapshot/rune.json';
import fxAnimationsShard from './snapshot/fxAnimations.json';
import image from './snapshot/image.json';
import theme from './snapshot/theme.json';

export const sampleCharacters = character || [];
export const loreEntries      = lore      || [];
export const quests           = quest      || [];
export const items            = item       || [];
export const spells           = spell      || [];
export const effects          = effect     || [];
export const traits           = trait      || [];
export const calendarEvents   = calendar   || [];
export const images           = image      || [];
export const themeDocs        = theme      || [];
export const runes            = rune       || [];
export const fxAnimations     = fxAnimationsShard || [];

// Preserve the { Factions: [...] } shape that contentUtils + ContentContext expect.
export const reputation = { Factions: faction || [] };
