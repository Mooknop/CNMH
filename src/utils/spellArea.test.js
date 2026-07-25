import { describe, it, expect } from 'vitest';
import {
  parseSpellArea, areaNeedsPlacement, areaComputesOccupancy, areaOccupants, areaLabel,
} from './spellArea';

const order = [
  { entryId: 'e-caster', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin' },
  { entryId: 'e-ogre', kind: 'enemy', name: 'Ogre' },
  { entryId: 'e-ally', kind: 'pc', charId: 'Ashka', name: 'Ashka' },
];

// Caster at (0,0); goblin 2 squares east (10 ft); ogre 5 east (25 ft);
// ally 1 diagonal (5 ft under the 5-10-5 rule).
const positions = {
  'e-caster': { col: 0, row: 0 },
  'e-gob': { col: 2, row: 0 },
  'e-ogre': { col: 5, row: 0 },
  'e-ally': { col: 1, row: 1 },
};

describe('parseSpellArea', () => {
  it('reads the free-text area content already authors', () => {
    expect(parseSpellArea({ area: '20-foot burst' })).toEqual({ shape: 'burst', feet: 20 });
    expect(parseSpellArea({ area: '15-foot cone' })).toEqual({ shape: 'cone', feet: 15 });
    expect(parseSpellArea({ area: '30-foot emanation' })).toEqual({ shape: 'emanation', feet: 30 });
    expect(parseSpellArea({ area: '60-foot line' })).toEqual({ shape: 'line', feet: 60 });
  });

  it('tolerates the spacing and unit variants in the wild', () => {
    expect(parseSpellArea({ area: '20 foot burst' })).toEqual({ shape: 'burst', feet: 20 });
    expect(parseSpellArea({ area: '10-ft. emanation' })).toEqual({ shape: 'emanation', feet: 10 });
    expect(parseSpellArea({ area: 'a 20-foot burst centered on a point' }))
      .toEqual({ shape: 'burst', feet: 20 });
  });

  it('lets an authored areaShape override unparseable prose', () => {
    expect(parseSpellArea({ area: 'special', areaShape: { shape: 'burst', feet: 15 } }))
      .toEqual({ shape: 'burst', feet: 15 });
  });

  it('returns null when there is no usable area', () => {
    expect(parseSpellArea({ area: 'special' })).toBeNull();
    expect(parseSpellArea({ area: '' })).toBeNull();
    expect(parseSpellArea({})).toBeNull();
    expect(parseSpellArea(null)).toBeNull();
  });
});

describe('shape classification', () => {
  it('bursts, cones and lines are placed; emanations are not', () => {
    expect(areaNeedsPlacement({ shape: 'burst', feet: 20 })).toBe(true);
    expect(areaNeedsPlacement({ shape: 'cone', feet: 15 })).toBe(true);
    expect(areaNeedsPlacement({ shape: 'line', feet: 60 })).toBe(true);
    // An emanation is always centred on the caster — nothing to place.
    expect(areaNeedsPlacement({ shape: 'emanation', feet: 30 })).toBe(false);
    expect(areaNeedsPlacement(null)).toBe(false);
  });

  it('only bursts and emanations compute occupancy (cones/lines need a facing)', () => {
    expect(areaComputesOccupancy({ shape: 'burst', feet: 20 })).toBe(true);
    expect(areaComputesOccupancy({ shape: 'emanation', feet: 30 })).toBe(true);
    expect(areaComputesOccupancy({ shape: 'cone', feet: 15 })).toBe(false);
    expect(areaComputesOccupancy({ shape: 'line', feet: 60 })).toBe(false);
  });
});

describe('areaOccupants', () => {
  const args = { positions, casterEntryId: 'e-caster', order };

  it('a burst catches everyone within its radius of the PLACED point', () => {
    // Placed on the goblin's square: goblin 0 ft, ally 5 ft, caster 10 ft,
    // ogre 15 ft (outside). The caster counts — see the next test.
    const inside = areaOccupants({ shape: 'burst', feet: 10 }, {
      ...args, originCell: { col: 2, row: 0 },
    });
    expect(inside.map((o) => o.entryId)).toEqual(['e-gob', 'e-ally', 'e-caster']);
    expect(inside[0]).toMatchObject({ name: 'Goblin', kind: 'enemy', feet: 0 });
    expect(inside.some((o) => o.entryId === 'e-ogre')).toBe(false);
  });

  it('a burst at your own feet catches YOU — no caster exemption', () => {
    const inside = areaOccupants({ shape: 'burst', feet: 10 }, {
      ...args, originCell: { col: 0, row: 0 },
    });
    expect(inside.map((o) => o.entryId)).toContain('e-caster');
    expect(inside.find((o) => o.entryId === 'e-caster').feet).toBe(0);
  });

  it('sorts nearest first and reports each distance', () => {
    const inside = areaOccupants({ shape: 'burst', feet: 30 }, {
      ...args, originCell: { col: 0, row: 0 },
    });
    expect(inside.map((o) => [o.entryId, o.feet]))
      .toEqual([['e-caster', 0], ['e-ally', 5], ['e-gob', 10], ['e-ogre', 25]]);
  });

  it('an emanation radiates from the caster, so the caster is its origin not its victim', () => {
    const inside = areaOccupants({ shape: 'emanation', feet: 10 }, args);
    expect(inside.map((o) => o.entryId)).toEqual(['e-ally', 'e-gob']);
    expect(inside.some((o) => o.entryId === 'e-caster')).toBe(false);
  });

  it('catches allies too — a burst does not discriminate', () => {
    const inside = areaOccupants({ shape: 'burst', feet: 5 }, {
      ...args, originCell: { col: 1, row: 1 },
    });
    expect(inside.map((o) => o.kind)).toContain('pc');
  });

  it('ignores combatants the encounter order does not know', () => {
    const withGhost = { ...positions, 'e-ghost': { col: 0, row: 1 } };
    const inside = areaOccupants({ shape: 'burst', feet: 30 }, {
      ...args, positions: withGhost, originCell: { col: 0, row: 0 },
    });
    expect(inside.some((o) => o.entryId === 'e-ghost')).toBe(false);
  });

  it('returns nothing for a cone/line, without positions, or without a placement', () => {
    expect(areaOccupants({ shape: 'cone', feet: 15 }, { ...args, originCell: { col: 1, row: 0 } }))
      .toEqual([]);
    expect(areaOccupants({ shape: 'burst', feet: 20 }, { ...args, positions: null, originCell: { col: 0, row: 0 } }))
      .toEqual([]);
    expect(areaOccupants({ shape: 'burst', feet: 20 }, args)).toEqual([]);
  });

  it('honors a non-default scene scale', () => {
    // 10 ft per square: the goblin 2 squares out is 20 ft, outside a 15-ft
    // burst — where at the default 5 ft/square it would have been caught.
    const inside = areaOccupants({ shape: 'burst', feet: 15 }, {
      ...args, originCell: { col: 0, row: 0 }, feetPerSquare: 10,
    });
    expect(inside.map((o) => o.entryId)).toEqual(['e-caster', 'e-ally']);
    expect(inside.some((o) => o.entryId === 'e-gob')).toBe(false);
  });
});

describe('areaLabel', () => {
  it('reads back as the content prose', () => {
    expect(areaLabel({ shape: 'burst', feet: 20 })).toBe('20-foot burst');
    expect(areaLabel(null)).toBe('');
  });
});
