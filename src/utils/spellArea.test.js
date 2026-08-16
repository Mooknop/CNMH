import { describe, it, expect } from 'vitest';
import {
  parseSpellArea, areaNeedsPlacement, areaComputesOccupancy, areaOccupants, areaLabel,
  snapToGridIntersection, intersectionFromWorld, casterRectFromPosition, casterRectCenterWorld,
} from './spellArea';

const order = [
  { entryId: 'e-caster', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin' },
  { entryId: 'e-ogre', kind: 'enemy', name: 'Ogre' },
  { entryId: 'e-ally', kind: 'pc', charId: 'Ashka', name: 'Ashka' },
];

// Caster at (0,0); goblin 2 squares east; ogre 5 east; ally 1 diagonal.
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

describe('snapToGridIntersection / intersectionFromWorld (#1751 OQ-1)', () => {
  it('rounds a world point to the nearest grid line crossing', () => {
    expect(snapToGridIntersection({ x: 240, y: 260 }, 100)).toEqual({ x: 200, y: 300 });
    expect(snapToGridIntersection({ x: 149, y: 51 }, 100)).toEqual({ x: 100, y: 100 });
  });

  it('a point already on a grid line snaps to itself', () => {
    expect(snapToGridIntersection({ x: 200, y: 0 }, 100)).toEqual({ x: 200, y: 0 });
  });

  it('addresses the same snap in corner-index space for occupancy math', () => {
    expect(intersectionFromWorld({ x: 240, y: 260 }, 100)).toEqual({ col: 2, row: 3 });
  });

  it('is null without a usable point or grid size', () => {
    expect(snapToGridIntersection(null, 100)).toBeNull();
    expect(snapToGridIntersection({ x: 1, y: 1 }, 0)).toBeNull();
    expect(intersectionFromWorld({ x: 1, y: 1 }, null)).toBeNull();
  });
});

describe('casterRectFromPosition / casterRectCenterWorld (#1751 OQ-1)', () => {
  it('reads width/height off a positions entry', () => {
    expect(casterRectFromPosition({ col: 3, row: 4, width: 2, height: 2 }))
      .toEqual({ col: 3, row: 4, width: 2, height: 2 });
  });

  it('is shape-tolerant: a payload with no width/height defaults to 1x1', () => {
    expect(casterRectFromPosition({ col: 3, row: 4 }))
      .toEqual({ col: 3, row: 4, width: 1, height: 1 });
  });

  it('is null without a usable position', () => {
    expect(casterRectFromPosition(null)).toBeNull();
  });

  it('centers on the rectangle, not the anchor cell', () => {
    expect(casterRectCenterWorld({ col: 0, row: 0, width: 1, height: 1 }, 100))
      .toEqual({ x: 50, y: 50 });
    // A 2x2 creature's own square is (0,0)-(1,1) in cells — center at (100,100).
    expect(casterRectCenterWorld({ col: 0, row: 0, width: 2, height: 2 }, 100))
      .toEqual({ x: 100, y: 100 });
  });
});

describe('areaOccupants — burst, measured from a grid intersection (#1751 OQ-1)', () => {
  const args = { positions, casterEntryId: 'e-caster', order };

  // A burst originates at a grid INTERSECTION (a point), and each candidate
  // cell's distance is measured to its NEAREST edge, not its center — the
  // same "measure from the near edge" idiom PF2e uses between two tokens.
  // This is a deliberate behavior change from the old cell-center-to-cell-
  // center math: placed on the goblin's own corner (2,0), the caster (whose
  // cell shares that corner's opposite edge) is now 5 ft away, not 10 — and
  // ties with the diagonal ally, which is also 5 ft under both schemes.
  it('a burst catches everyone within its radius of the PLACED intersection', () => {
    const inside = areaOccupants({ shape: 'burst', feet: 10 }, {
      ...args, originIntersection: { col: 2, row: 0 },
    });
    expect(inside.map((o) => [o.entryId, o.feet])).toEqual([
      ['e-gob', 0], ['e-caster', 5], ['e-ally', 5],
    ]);
    expect(inside.some((o) => o.entryId === 'e-ogre')).toBe(false);
  });

  it('a burst at your own feet catches YOU — no caster exemption', () => {
    const inside = areaOccupants({ shape: 'burst', feet: 10 }, {
      ...args, originIntersection: { col: 0, row: 0 },
    });
    expect(inside.map((o) => o.entryId)).toContain('e-caster');
    expect(inside.find((o) => o.entryId === 'e-caster').feet).toBe(0);
  });

  it('sorts nearest first and reports each distance', () => {
    // Placed at the caster's own top-left corner: this intersection is the
    // same point the OLD cell-floor convention addressed the caster's cell
    // by, so these distances happen to match the pre-#1751 numbers exactly.
    const inside = areaOccupants({ shape: 'burst', feet: 30 }, {
      ...args, originIntersection: { col: 0, row: 0 },
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
      ...args, originIntersection: { col: 1, row: 1 },
    });
    expect(inside.map((o) => o.kind)).toContain('pc');
  });

  it('ignores combatants the encounter order does not know', () => {
    const withGhost = { ...positions, 'e-ghost': { col: 0, row: 1 } };
    const inside = areaOccupants({ shape: 'burst', feet: 30 }, {
      ...args, positions: withGhost, originIntersection: { col: 0, row: 0 },
    });
    expect(inside.some((o) => o.entryId === 'e-ghost')).toBe(false);
  });

  it('returns nothing for a cone/line, without positions, or without a placement', () => {
    expect(areaOccupants({ shape: 'cone', feet: 15 }, { ...args, originIntersection: { col: 1, row: 0 } }))
      .toEqual([]);
    expect(areaOccupants({ shape: 'burst', feet: 20 }, { ...args, positions: null, originIntersection: { col: 0, row: 0 } }))
      .toEqual([]);
    expect(areaOccupants({ shape: 'burst', feet: 20 }, args)).toEqual([]);
  });

  it('honors a non-default scene scale', () => {
    // 10 ft per square: the goblin 2 squares out is 20 ft, outside a 15-ft
    // burst — where at the default 5 ft/square it would have been caught.
    const inside = areaOccupants({ shape: 'burst', feet: 15 }, {
      ...args, originIntersection: { col: 0, row: 0 }, feetPerSquare: 10,
    });
    expect(inside.map((o) => o.entryId)).toEqual(['e-caster', 'e-ally']);
    expect(inside.some((o) => o.entryId === 'e-gob')).toBe(false);
  });
});

describe('areaOccupants — emanation, token-size-aware (#1751 OQ-1)', () => {
  const args = { positions, casterEntryId: 'e-caster', order };

  it('a 1x1 caster (no width/height on the payload) matches the old single-cell math', () => {
    const inside = areaOccupants({ shape: 'emanation', feet: 30 }, args);
    expect(inside.map((o) => [o.entryId, o.feet]))
      .toEqual([['e-ally', 5], ['e-gob', 10], ['e-ogre', 25]]);
  });

  it('a 2x2 caster covers more squares — the emanation extends from the rectangle EDGE', () => {
    const big = { ...positions, 'e-caster': { col: 0, row: 0, width: 2, height: 2 } };
    const inside = areaOccupants({ shape: 'emanation', feet: 30 }, { ...args, positions: big });
    // Ally at (1,1) is now INSIDE the caster's own 2x2 rectangle — 0 ft, not 5.
    // Goblin at (2,0) is adjacent to the rectangle's east edge — 5 ft, not 10.
    expect(inside.map((o) => [o.entryId, o.feet]))
      .toEqual([['e-ally', 0], ['e-gob', 5], ['e-ogre', 20]]);
  });
});

describe('areaLabel', () => {
  it('reads back as the content prose', () => {
    expect(areaLabel({ shape: 'burst', feet: 20 })).toBe('20-foot burst');
    expect(areaLabel(null)).toBe('');
  });
});
