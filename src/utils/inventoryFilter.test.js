import { describe, it, expect } from 'vitest';
import {
  matchesFilter,
  matchesQuery,
  sortItems,
  nextSort,
  SORTS,
} from './inventoryFilter';

const weapon = { name: 'Longsword', weight: 1, strikes: [{ damage: '1d8' }] };
const potion = { name: 'Healing Potion', weight: 0.1, consumable: { kind: 'healing' } };
const robe = { name: 'Mage Robe', weight: 0.5, traits: ['Magical'] };
const rope = { name: 'Rope', weight: 1 };
const pack = { name: 'Backpack', weight: 0.1, container: { contents: [] } };

describe('matchesFilter', () => {
  it('all matches everything', () => {
    [weapon, potion, robe, rope, pack].forEach((i) => expect(matchesFilter(i, 'all')).toBe(true));
  });
  it('weapon matches Strike-bearing items', () => {
    expect(matchesFilter(weapon, 'weapon')).toBe(true);
    expect(matchesFilter(rope, 'weapon')).toBe(false);
  });
  it('consumable matches potions/scrolls', () => {
    expect(matchesFilter(potion, 'consumable')).toBe(true);
    expect(matchesFilter(weapon, 'consumable')).toBe(false);
  });
  it('magic matches magical items', () => {
    expect(matchesFilter(robe, 'magic')).toBe(true);
    expect(matchesFilter({ name: 'Wand', wand: {} }, 'magic')).toBe(true);
    expect(matchesFilter(rope, 'magic')).toBe(false);
  });
  it('gear is the catch-all for non-weapon, non-consumable, non-container', () => {
    expect(matchesFilter(rope, 'gear')).toBe(true);
    expect(matchesFilter(robe, 'gear')).toBe(true); // a magical robe is still gear
    expect(matchesFilter(weapon, 'gear')).toBe(false);
    expect(matchesFilter(potion, 'gear')).toBe(false);
    expect(matchesFilter(pack, 'gear')).toBe(false);
  });
});

describe('matchesQuery', () => {
  it('is a case-insensitive name substring; empty matches all', () => {
    expect(matchesQuery(weapon, '')).toBe(true);
    expect(matchesQuery(weapon, 'sword')).toBe(true);
    expect(matchesQuery(weapon, 'SWORD')).toBe(true);
    expect(matchesQuery(weapon, 'bow')).toBe(false);
  });
});

describe('nextSort', () => {
  it('cycles name → type → bulk → name', () => {
    expect(nextSort('name')).toBe('type');
    expect(nextSort('type')).toBe('bulk');
    expect(nextSort('bulk')).toBe('name');
    expect(SORTS).toEqual(['name', 'type', 'bulk']);
  });
});

describe('sortItems', () => {
  it('sorts by name (A–Z) without mutating the input', () => {
    const input = [rope, weapon];
    const out = sortItems(input, 'name');
    expect(out.map((i) => i.name)).toEqual(['Longsword', 'Rope']);
    expect(input).toEqual([rope, weapon]); // unmutated
  });
  it('sorts by Bulk descending', () => {
    const out = sortItems([potion, weapon, rope], 'bulk');
    expect(out.map((i) => i.name)).toEqual(['Longsword', 'Rope', 'Healing Potion']);
  });
  it('groups by type then name', () => {
    // weapon→ember, potion→verdant, robe→arcane: arcane < ember < verdant
    const out = sortItems([weapon, potion, robe], 'type');
    expect(out.map((i) => i.name)).toEqual(['Mage Robe', 'Longsword', 'Healing Potion']);
  });
});
