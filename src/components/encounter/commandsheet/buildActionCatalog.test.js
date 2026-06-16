import { describe, it, expect } from 'vitest';
import {
  buildActionCatalog,
  filterTiles,
  categoriesPresent,
  drawCost,
} from './buildActionCatalog';

describe('buildActionCatalog', () => {
  it('includes strikes, custom actions, and all three basic action lists', () => {
    const tiles = buildActionCatalog({
      actions: [{ name: 'Custom Action', actionCount: 1, traits: [] }],
      strikes: [{ name: 'Longsword', type: 'melee', actionCount: 1, attackMod: 9, damage: '1d8+4' }],
    });
    const names = tiles.map((t) => t.name);
    expect(names).toContain('Longsword');
    expect(names).toContain('Custom Action');
    expect(names).toContain('Strike');     // offensive basic
    expect(names).toContain('Raise a Shield'); // defensive basic
    expect(names).toContain('Stride');     // movement basic
  });

  it('tags each tile with its origin (strike / custom / basic) for ranking', () => {
    const tiles = buildActionCatalog({
      actions: [{ name: 'Custom Action', actionCount: 1, traits: [] }],
      strikes: [{ name: 'Longsword', type: 'melee', actionCount: 1, attackMod: 9, damage: '1d8+4' }],
    });
    const byName = Object.fromEntries(tiles.map((t) => [t.name, t]));
    expect(byName.Longsword.origin).toBe('strike');
    expect(byName['Custom Action'].origin).toBe('custom');
    expect(byName.Stride.origin).toBe('basic');
  });

  it('groups by cost into 1/2/3, clamping higher costs into group 3', () => {
    const tiles = buildActionCatalog({
      actions: [
        { name: 'One', actionCount: 1, traits: [] },
        { name: 'Two', actionCount: 2, traits: [] },
        { name: 'Three', actionCount: 3, traits: [] },
      ],
    });
    const byName = Object.fromEntries(tiles.map((t) => [t.name, t]));
    expect(byName.One.costGroup).toBe('1');
    expect(byName.Two.costGroup).toBe('2');
    expect(byName.Three.costGroup).toBe('3');
  });

  it('groups a variable-cost action under its minimum', () => {
    const tiles = buildActionCatalog({
      actions: [{ name: 'Channel', actionCount: 1, variableActionCount: { min: 1, max: 3 }, traits: [] }],
    });
    const channel = tiles.find((t) => t.name === 'Channel');
    expect(channel.costGroup).toBe('1');
    expect(channel.variableActionCount).toEqual({ min: 1, max: 3 });
  });

  it('tags categories: strikes + Attack-trait basics are attack, defensive/movement bucketed', () => {
    const tiles = buildActionCatalog({
      strikes: [{ name: 'Fist', type: 'melee', actionCount: 1, attackMod: 5 }],
    });
    const cat = (n) => tiles.find((t) => t.name === n)?.cat;
    expect(cat('Fist')).toBe('attack');
    expect(cat('Grapple')).toBe('attack');   // BASIC_ACTIONS_OFFENSIVE, Attack trait
    expect(cat('Take Cover')).toBe('defense');
    expect(cat('Stride')).toBe('move');
    expect(cat('Feint')).toBe('skill');       // Mental + highlightSkill, no Attack trait
  });

  it('derives a stat line for strikes and maneuvers', () => {
    const tiles = buildActionCatalog({
      strikes: [{ name: 'Bow', type: 'ranged', actionCount: 1, attackMod: 11, damage: '1d8' }],
    });
    expect(tiles.find((t) => t.name === 'Bow').statLine).toBe('+11 · 1d8');
    expect(tiles.find((t) => t.name === 'Trip').statLine).toBe('vs Ref');   // targetDefense reflex
    expect(tiles.find((t) => t.name === 'Grapple').statLine).toBe('vs Fort');
  });

  it('marks inactive when active === false and preserves requiresTarget', () => {
    const tiles = buildActionCatalog({
      actions: [{ name: 'Stowed', actionCount: 1, active: false, traits: [] }],
    });
    expect(tiles.find((t) => t.name === 'Stowed').inactive).toBe(true);
    expect(tiles.find((t) => t.name === 'Stride').requiresTarget).toBe(false);
  });

  // ── Reactions & Free group (#424) ──────────────────────────────────────────
  it('emits reaction/free tiles in the rf cost group, never target-gated', () => {
    const tiles = buildActionCatalog({
      reactions: [{ name: 'Shield Block', traits: [] }],
      freeActions: [{ name: 'Quick Draw', traits: [] }],
    });
    const block = tiles.find((t) => t.name === 'Shield Block');
    const draw = tiles.find((t) => t.name === 'Quick Draw');
    expect(block).toMatchObject({ cost: 'reaction', costGroup: 'rf', needsTarget: false, origin: 'reaction' });
    expect(draw).toMatchObject({ cost: 'free', costGroup: 'rf', needsTarget: false, origin: 'free' });
  });

  it('includes the basic encounter free actions in the rf group', () => {
    const tiles = buildActionCatalog({});
    const rf = tiles.filter((t) => t.costGroup === 'rf');
    // BASIC_ENCOUNTER_FREE_ACTIONS are always appended (e.g. Delay / Release).
    expect(rf.length).toBeGreaterThan(0);
    expect(rf.every((t) => t.cost === 'reaction' || t.cost === 'free')).toBe(true);
  });
});

describe('filterTiles', () => {
  const tiles = buildActionCatalog({
    strikes: [{ name: 'Longsword', type: 'melee', actionCount: 1, attackMod: 9, damage: '1d8' }],
  });

  it('returns all tiles for cat "all" and empty query', () => {
    expect(filterTiles(tiles, { cat: 'all', query: '' }).length).toBe(tiles.length);
  });

  it('filters by category', () => {
    const moves = filterTiles(tiles, { cat: 'move' });
    expect(moves.every((t) => t.cat === 'move')).toBe(true);
    expect(moves.some((t) => t.name === 'Stride')).toBe(true);
  });

  it('matches the query against name and traits', () => {
    expect(filterTiles(tiles, { query: 'longsword' }).map((t) => t.name)).toEqual(['Longsword']);
    expect(filterTiles(tiles, { query: 'shield' }).some((t) => t.name === 'Raise a Shield')).toBe(true);
  });
});

describe('categoriesPresent', () => {
  it('lists "all" first then present categories in stable order', () => {
    const tiles = buildActionCatalog({
      strikes: [{ name: 'Fist', type: 'melee', actionCount: 1, attackMod: 5 }],
    });
    const cats = categoriesPresent(tiles);
    expect(cats[0]).toBe('all');
    expect(cats).toContain('attack');
    expect(cats).toContain('defense');
    expect(cats).toContain('move');
    // order: attack before defense before move
    expect(cats.indexOf('attack')).toBeLessThan(cats.indexOf('defense'));
  });
});

describe('consumables (#428)', () => {
  it('drawCost: held +0, worn +1, stowed +2, unknown → worn default', () => {
    expect(drawCost('held1')).toBe(0);
    expect(drawCost('held2')).toBe(0);
    expect(drawCost('worn')).toBe(1);
    expect(drawCost('stowed')).toBe(2);
    expect(drawCost(undefined)).toBe(1);
  });

  it('emits a consumable tile with effective cost (drink + draw/retrieve) and heals flag', () => {
    const tiles = buildActionCatalog({
      inventory: [
        { name: 'Held Potion', state: 'held1', consumable: { kind: 'healing' } },
        { name: 'Worn Potion', state: 'worn', consumable: { kind: 'healing' } },
        { name: 'Stowed Elixir', state: 'stowed', consumable: { kind: 'healing' } },
        { name: 'Mutagen', state: 'worn', consumable: { kind: 'effect' } },
      ],
    });
    const byName = Object.fromEntries(tiles.map((t) => [t.name, t]));
    expect(byName['Held Potion'].cost).toBe(1);
    expect(byName['Worn Potion'].cost).toBe(2);
    expect(byName['Stowed Elixir'].cost).toBe(3);
    expect(byName['Stowed Elixir'].costGroup).toBe('3');
    expect(byName['Held Potion'].heals).toBe(true);
    expect(byName['Mutagen'].heals).toBe(false);
    // Consumables are self-use this slice — never gate on a focused foe.
    expect(byName['Held Potion'].cat).toBe('item');
    expect(byName['Held Potion'].needsTarget).toBe(false);
  });

  it('skips dropped consumables and non-consumable inventory', () => {
    const tiles = buildActionCatalog({
      inventory: [
        { name: 'Dropped Potion', state: 'dropped', consumable: { kind: 'healing' } },
        { name: 'Longsword', state: 'held1' }, // no consumable meta
      ],
    });
    expect(tiles.some((t) => t.name === 'Dropped Potion')).toBe(false);
    expect(tiles.some((t) => t.kind === 'consumable')).toBe(false);
  });
});
