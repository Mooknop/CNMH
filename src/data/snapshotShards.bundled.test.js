// Guards the sharded seed layout (one JSON file per collection under ./snapshot/,
// reassembled by ./index.js). Ensures the shards load, the named exports stay
// wired, and each shard keeps the id-sorted, duplicate-free contract that
// scripts/snapshotContent.js writes — so a no-op DO pull yields a zero diff.
import fs from 'fs';
import path from 'path';
import {
  sampleCharacters, loreEntries, quests, items, spells, effects,
  traits, calendarEvents, images, themeDocs, runes, reputation,
} from './index';

const shardDir = path.join(process.cwd(), 'src', 'data', 'snapshot');
const COLLECTIONS = [
  'quest', 'faction', 'calendar', 'lore', 'trait', 'character',
  'item', 'spell', 'effect', 'rune', 'image', 'theme',
];

describe('sharded bundled seed', () => {
  it('has one JSON file per collection', () => {
    for (const key of COLLECTIONS) {
      expect(fs.existsSync(path.join(shardDir, `${key}.json`))).toBe(true);
    }
  });

  it('the old monolithic snapshot.json is gone', () => {
    expect(fs.existsSync(path.join(shardDir, '..', 'snapshot.json'))).toBe(false);
  });

  it('index.js reassembles every collection into its named export', () => {
    expect(sampleCharacters.length).toBeGreaterThan(0);
    expect(quests.length).toBeGreaterThan(0);
    expect(items.length).toBeGreaterThan(0);
    expect(spells.length).toBeGreaterThan(0);
    expect(effects.length).toBeGreaterThan(0);
    expect(traits.length).toBeGreaterThan(0);
    expect(loreEntries.length).toBeGreaterThan(0);
    expect(calendarEvents.length).toBeGreaterThan(0);
    expect(images.length).toBeGreaterThan(0);
    expect(themeDocs.length).toBeGreaterThan(0);
    expect(runes.length).toBeGreaterThan(0);
    expect(Array.isArray(reputation.Factions)).toBe(true);
    expect(reputation.Factions.length).toBeGreaterThan(0);
  });

  it('each shard is a bare array, id-sorted, with no duplicate ids', () => {
    for (const key of COLLECTIONS) {
      const arr = JSON.parse(fs.readFileSync(path.join(shardDir, `${key}.json`), 'utf8'));
      expect(Array.isArray(arr)).toBe(true);
      const ids = arr.filter((d) => d && d.id != null).map((d) => String(d.id));
      expect(new Set(ids).size).toBe(ids.length); // no dupes
      const sorted = [...ids].sort();
      expect(ids).toEqual(sorted); // code-unit sorted, matching snapshotContent.js
    }
  });
});
