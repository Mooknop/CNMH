// Seed content gate (#1314). Two layers:
//  1. Schema: every committed shard doc has the fields the app depends on,
//     with the right kinds (scripts/lib/contentSchema.js — the same specs
//     gate the DO pull in scripts/snapshotContent.js).
//  2. Cross-refs: run the REAL content pipeline (normalize + catalog
//     resolution, exactly as ContentProvider does) over the seed and assert
//     nothing resolved to an "(unknown item/spell: …)" stub — i.e. every
//     inventory ref, scroll/wand spellRef, and spellcasting ref points at a
//     doc that exists in the seed.
// A content PR that ships a malformed doc or a dangling ref fails here with a
// message naming the doc and field.
import fs from 'fs';
import path from 'path';
import { validateSnapshot } from '../../scripts/lib/contentSchema.js';
import {
  normalizeCharacters,
  normalizeItems,
  normalizeSpells,
  normalizeRunes,
  mergeArmorRunes,
  mergeFundamentalRunes,
  resolveCharacterItems,
} from '../utils/contentUtils';

const shardDir = path.join(process.cwd(), 'src', 'data', 'snapshot');
const load = (key) => JSON.parse(fs.readFileSync(path.join(shardDir, `${key}.json`), 'utf8'));

const COLLECTIONS = [
  'quest', 'faction', 'calendar', 'lore', 'trait', 'character',
  'item', 'spell', 'effect', 'rune', 'fxAnimations', 'image', 'theme',
];

describe('seed schema (#1314)', () => {
  it('every committed shard doc matches its collection schema', () => {
    const snapshot = Object.fromEntries(COLLECTIONS.map((k) => [k, load(k)]));
    expect(validateSnapshot(snapshot)).toEqual([]);
  });
});

describe('seed cross-references (#1314)', () => {
  it('every ref in the seed resolves — no "(unknown …)" stubs after the real pipeline', () => {
    const items = normalizeItems(load('item'));
    const spells = normalizeSpells(load('spell'));
    const runes = mergeFundamentalRunes(mergeArmorRunes(normalizeRunes(load('rune'))));
    const characters = normalizeCharacters(load('character')).map((c) =>
      resolveCharacterItems(c, items, spells, runes)
    );

    // Deep-scan the resolved tree for the pipeline's dangling-ref markers.
    const stubs = [];
    const walk = (node, where) => {
      if (Array.isArray(node)) {
        node.forEach((n, i) => walk(n, `${where}[${i}]`));
        return;
      }
      if (!node || typeof node !== 'object') return;
      if (typeof node.name === 'string' && node.name.startsWith('(unknown')) {
        stubs.push(`${where}: ${node.name}`);
      }
      for (const [k, v] of Object.entries(node)) walk(v, `${where}.${k}`);
    };
    characters.forEach((c) => walk(c, c.id));

    expect(stubs).toEqual([]);
  });
});
