import { describe, it, expect } from 'vitest';
import { suggestNow, affordable, usable } from './suggestNow';
import { buildActionCatalog } from './buildActionCatalog';

// Minimal tile factory — only the fields suggestNow reads.
const tile = (over) => ({
  id: over.name,
  name: over.name,
  origin: 'basic',
  cost: 1,
  cat: 'other',
  traits: [],
  needsTarget: false,
  inactive: false,
  ...over,
});

const strike = tile({ name: 'Dagger', origin: 'strike', cat: 'attack', needsTarget: true });
const maneuver = tile({ name: 'Trip', cat: 'skill', needsTarget: true });
const move = tile({ name: 'Stride', cat: 'move' });
const defense = tile({ name: 'Take Cover', cat: 'defense' });

describe('affordable / usable', () => {
  it('affordable compares cost to remaining actions', () => {
    expect(affordable(tile({ name: 'a', cost: 1 }), 1)).toBe(true);
    expect(affordable(tile({ name: 'b', cost: 2 }), 1)).toBe(false);
  });

  it('usable gates target-needing tiles on focus, and rejects inactive', () => {
    expect(usable(strike, true)).toBe(true);
    expect(usable(strike, false)).toBe(false);
    expect(usable(move, false)).toBe(true);
    expect(usable(tile({ name: 'off', inactive: true }), true)).toBe(false);
  });
});

describe('suggestNow', () => {
  it('foe focused → strikes rank first, then target skill maneuvers', () => {
    const out = suggestNow([move, defense, maneuver, strike], { actionsLeft: 3, hasFocus: true });
    expect(out[0].name).toBe('Dagger'); // strike +10
    expect(out[1].name).toBe('Trip');   // skill maneuver +8
  });

  it('no foe → move / defense surface; target-needing tiles are filtered out', () => {
    const out = suggestNow([strike, maneuver, move, defense], { actionsLeft: 3, hasFocus: false });
    expect(out.some((t) => t.origin === 'strike')).toBe(false);
    expect(out.some((t) => t.name === 'Trip')).toBe(false);
    expect(out[0].cat).toBe('move'); // move +8 outranks defense +7
  });

  it('filters out unaffordable actions', () => {
    const heavy = tile({ name: 'Big', cat: 'move', cost: 2 });
    const out = suggestNow([move, heavy], { actionsLeft: 1, hasFocus: false });
    expect(out.map((t) => t.name)).toContain('Stride');
    expect(out.map((t) => t.name)).not.toContain('Big');
  });

  it('drops inactive tiles', () => {
    const off = tile({ name: 'Broken', cat: 'move', inactive: true });
    const out = suggestNow([off, move], { actionsLeft: 3, hasFocus: false });
    expect(out.map((t) => t.name)).toEqual(['Stride']);
  });

  it('caps the shortlist at 4', () => {
    const many = Array.from({ length: 6 }, (_, i) => tile({ name: `M${i}`, cat: 'move' }));
    expect(suggestNow(many, { actionsLeft: 3, hasFocus: false })).toHaveLength(4);
  });

  it('works over a real catalog — a strike ranks first when a foe is focused', () => {
    const tiles = buildActionCatalog({
      strikes: [{ name: 'Longsword', actionCount: 1, traits: ['Attack'], targetDefense: 'ac', attackMod: 9, damage: '1d8+4' }],
      actions: [],
    });
    const out = suggestNow(tiles, { actionsLeft: 3, hasFocus: true });
    expect(out[0].origin).toBe('strike');
    expect(out.length).toBeLessThanOrEqual(4);
  });
});
