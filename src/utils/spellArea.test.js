import { describe, it, expect } from 'vitest';
import {
  parseSpellArea, areaNeedsPlacement, areaComputesOccupancy, areaOccupants, areaLabel,
  snapToGridIntersection, intersectionFromWorld, casterRectFromPosition, casterRectCenterWorld,
  normalizeCompassDeg, coneCells, lineCells,
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

// ─────────────────────────────────────────────────────────────────────────────
// Cones and lines (#1735 S1)
// ─────────────────────────────────────────────────────────────────────────────
//
// These assert the shapes as ASCII pictures rather than cell lists, because
// the ground truth IS a picture: the Player Core "Areas" cone templates. A
// reviewer can hold the art below next to the book and count.
//
//   #  a cell the area covers        @  a cell the caster occupies
//   .  empty        north is up, east is right (row grows SOUTH)
//
// Every window is centred on the caster unless noted.

const CASTER = { col: 0, row: 0 };
const BIG = { col: 0, row: 0, width: 2, height: 2 };

/** Render a cell list as the ASCII above, over the window `[±n, ±n]`. */
const draw = (cells, rect, window) => {
  const covered = new Set(cells.map((c) => `${c.col},${c.row}`));
  const lines = [];
  for (let row = window.rowMin; row <= window.rowMax; row += 1) {
    let line = '';
    for (let col = window.colMin; col <= window.colMax; col += 1) {
      const onCaster = col >= rect.col && col < rect.col + (rect.width || 1)
        && row >= rect.row && row < rect.row + (rect.height || 1);
      line += covered.has(`${col},${row}`) ? '#' : (onCaster ? '@' : '.');
    }
    lines.push(line);
  }
  return lines.join('\n');
};

/** A square window of half-size `n` centred on the origin cell. */
const box = (n) => ({ colMin: -n, colMax: n, rowMin: -n, rowMax: n });

/** Strip the indentation off an inline picture so it lines up with `draw`. */
const art = (picture) => picture.trim().split('\n').map((l) => l.trim()).join('\n');

const COMPASS = [0, 45, 90, 135, 180, 225, 270, 315];
const key = (cells) => cells.map((c) => `${c.col},${c.row}`).sort().join(' ');
// Reflections through the 1x1 caster at (0,0): its square spans [0,1] on both
// axes, so reflecting about its centre maps cell index n to -n.
const mirrorNS = (cells) => cells.map((c) => ({ col: c.col, row: -c.row }));
const mirrorEW = (cells) => cells.map((c) => ({ col: -c.col, row: c.row }));

describe('normalizeCompassDeg (#1735 S1)', () => {
  it('accepts the eight rosette points', () => {
    COMPASS.forEach((deg) => expect(normalizeCompassDeg(deg)).toBe(deg));
  });

  it('wraps out-of-range multiples of 45', () => {
    expect(normalizeCompassDeg(360)).toBe(0);
    expect(normalizeCompassDeg(405)).toBe(45);
    expect(normalizeCompassDeg(-90)).toBe(270);
    expect(normalizeCompassDeg(-45)).toBe(315);
  });

  it('rejects anything that is not one of the eight', () => {
    expect(normalizeCompassDeg(30)).toBeNull();
    expect(normalizeCompassDeg(22.5)).toBeNull();
    expect(normalizeCompassDeg('north')).toBeNull();
  });

  it('a MISSING facing is null, never north — Number(null) is 0 and 0 is due north', () => {
    expect(normalizeCompassDeg(null)).toBeNull();
    expect(normalizeCompassDeg(undefined)).toBeNull();
    expect(normalizeCompassDeg('')).toBeNull();
    expect(normalizeCompassDeg([])).toBeNull();
    expect(coneCells(CASTER, null, 30)).toEqual([]);
    expect(lineCells(CASTER, undefined, 30)).toEqual([]);
  });

  it('reads a stringified facing off the wire', () => {
    expect(normalizeCompassDeg('90')).toBe(90);
  });
});

describe('coneCells — 30-foot cone at all eight compass points (#1735 S1)', () => {
  // The cardinal cones originate at the caster's EDGE midpoint, the diagonal
  // ones at its CORNER (the epic's ruling, and the rules text: "the first
  // square … must share an edge with your space if you're aiming orthogonally,
  // or … touch a corner … if you're aiming diagonally").
  //
  // Note the lumpiness — rank 5 is seven squares wide, rank 6 only three.
  // That is the 5-10-5 alternating-diagonal rule, not a rounding bug, and the
  // book's printed cones are lumpy in the same way.
  const at = (deg) => draw(coneCells(CASTER, deg, 30), CASTER, box(6));

  it('north (0°)', () => {
    expect(at(0)).toBe(art(`
      .....###.....
      ...#######...
      ...#######...
      ....#####....
      .....###.....
      ......#......
      ......@......
      .............
      .............
      .............
      .............
      .............
      .............
    `));
  });

  it('northeast (45°)', () => {
    expect(at(45)).toBe(art(`
      .......#.....
      .......###...
      .......####..
      .......#####.
      .......#####.
      .......######
      ......@......
      .............
      .............
      .............
      .............
      .............
      .............
    `));
  });

  it('east (90°)', () => {
    expect(at(90)).toBe(art(`
      .............
      .............
      .............
      ..........##.
      .........###.
      ........#####
      ......@######
      ........#####
      .........###.
      ..........##.
      .............
      .............
      .............
    `));
  });

  it('southeast (135°)', () => {
    expect(at(135)).toBe(art(`
      .............
      .............
      .............
      .............
      .............
      .............
      ......@......
      .......######
      .......#####.
      .......#####.
      .......####..
      .......###...
      .......#.....
    `));
  });

  it('south (180°)', () => {
    expect(at(180)).toBe(art(`
      .............
      .............
      .............
      .............
      .............
      .............
      ......@......
      ......#......
      .....###.....
      ....#####....
      ...#######...
      ...#######...
      .....###.....
    `));
  });

  it('southwest (225°)', () => {
    expect(at(225)).toBe(art(`
      .............
      .............
      .............
      .............
      .............
      .............
      ......@......
      ######.......
      .#####.......
      .#####.......
      ..####.......
      ...###.......
      .....#.......
    `));
  });

  it('west (270°)', () => {
    expect(at(270)).toBe(art(`
      .............
      .............
      .............
      .##..........
      .###.........
      #####........
      ######@......
      #####........
      .###.........
      .##..........
      .............
      .............
      .............
    `));
  });

  it('northwest (315°)', () => {
    expect(at(315)).toBe(art(`
      .....#.......
      ...###.......
      ..####.......
      .#####.......
      .#####.......
      ######.......
      ......@......
      .............
      .............
      .............
      .............
      .............
      .............
    `));
  });
});

describe('coneCells — 15-foot cone, the breathe-fire template (#1735 S1)', () => {
  // These two ARE the published diagrams, cell for cell: the 15-ft cardinal
  // cone is the book's 7-square template and the 15-ft diagonal cone is its
  // 6-square one.
  it('east is the 7-square cardinal template (1 / 3 / 3 by rank)', () => {
    expect(draw(coneCells(CASTER, 90, 15), CASTER, box(3))).toBe(art(`
      .......
      .......
      .....##
      ...@###
      .....##
      .......
      .......
    `));
  });

  it('north is the same template rotated', () => {
    expect(draw(coneCells(CASTER, 0, 15), CASTER, box(3))).toBe(art(`
      ..###..
      ..###..
      ...#...
      ...@...
      .......
      .......
      .......
    `));
  });

  it('northeast is the 6-square diagonal template (3 / 2 / 1 by rank)', () => {
    expect(draw(coneCells(CASTER, 45, 15), CASTER, box(3))).toBe(art(`
      ....#..
      ....##.
      ....###
      ...@...
      .......
      .......
      .......
    `));
  });

  it('southwest mirrors it', () => {
    expect(draw(coneCells(CASTER, 225, 15), CASTER, box(3))).toBe(art(`
      .......
      .......
      .......
      ...@...
      ###....
      .##....
      ..#....
    `));
  });
});

describe('coneCells — cell counts against the printed templates (#1735 S1)', () => {
  // RAW counts from the Player Core "Areas" diagrams: 15-ft cone 7 squares
  // cardinal / 6 diagonal, 30-ft 28 / 24, 60-ft 96 diagonal.
  it('matches the book exactly for every diagonal cone, and for the 15-ft cardinal one', () => {
    [45, 135, 225, 315].forEach((deg) => {
      expect(coneCells(CASTER, deg, 15)).toHaveLength(6);
      expect(coneCells(CASTER, deg, 30)).toHaveLength(24);
      expect(coneCells(CASTER, deg, 60)).toHaveLength(96);
    });
    [0, 90, 180, 270].forEach((deg) => {
      expect(coneCells(CASTER, deg, 15)).toHaveLength(7);
    });
  });

  it('DIVERGES from the book at 30 ft cardinal: 26, not 28 — the origin, not the math', () => {
    // The book draws its 15-ft cardinal cone from a square EDGE but its 30-ft
    // and 60-ft cardinal cones from a CORNER, which is a known inconsistency
    // in the diagrams (a corner-drawn cardinal cone has a base square that
    // only touches your space at a corner, contradicting the cone rules text).
    // We take the edge origin for every cardinal facing; the 30-ft cone loses
    // the two 45°-boundary squares the corner construction keeps.
    [0, 90, 180, 270].forEach((deg) => {
      expect(coneCells(CASTER, deg, 30)).toHaveLength(26);
      expect(coneCells(CASTER, deg, 60)).toHaveLength(100);
    });
  });

  it('is consistent within each family — all four cardinals and all four diagonals agree', () => {
    const cardinals = [0, 90, 180, 270].map((d) => coneCells(CASTER, d, 30).length);
    const diagonals = [45, 135, 225, 315].map((d) => coneCells(CASTER, d, 30).length);
    expect(new Set(cardinals).size).toBe(1);
    expect(new Set(diagonals).size).toBe(1);
  });
});

describe('coneCells — symmetry properties (#1735 S1)', () => {
  it('a north cone mirrored across the caster IS the south cone', () => {
    [15, 30, 60].forEach((feet) => {
      expect(key(mirrorNS(coneCells(CASTER, 0, feet))))
        .toBe(key(coneCells(CASTER, 180, feet)));
    });
  });

  it('an east cone mirrored across the caster IS the west cone', () => {
    [15, 30, 60].forEach((feet) => {
      expect(key(mirrorEW(coneCells(CASTER, 90, feet))))
        .toBe(key(coneCells(CASTER, 270, feet)));
    });
  });

  it('a northeast cone mirrored twice IS the southwest cone', () => {
    expect(key(mirrorEW(mirrorNS(coneCells(CASTER, 45, 30)))))
      .toBe(key(coneCells(CASTER, 225, 30)));
    expect(key(mirrorNS(coneCells(CASTER, 45, 30))))
      .toBe(key(coneCells(CASTER, 135, 30)));
  });

  it('never covers the caster\'s own square — "you can\'t aim a cone so that it overlaps your space"', () => {
    COMPASS.forEach((deg) => {
      expect(coneCells(CASTER, deg, 60).some((c) => c.col === 0 && c.row === 0)).toBe(false);
      const inside = coneCells(BIG, deg, 60)
        .some((c) => c.col >= 0 && c.col <= 1 && c.row >= 0 && c.row <= 1);
      expect(inside).toBe(false);
    });
  });
});

describe('coneCells — a 2x2 caster shifts the origin to its own edge (#1735 S1)', () => {
  // A 2x2 caster's east face midpoint lands ON a grid line, so its cardinal
  // cone is corner-derived — which is exactly the construction the book uses
  // for its 30-ft cardinal cone. This 28-square shape IS the printed template.
  it('the 30-ft east cone is the book\'s 28-square cardinal template', () => {
    const cells = coneCells(BIG, 90, 30);
    expect(cells).toHaveLength(28);
    expect(draw(cells, BIG, { colMin: -1, colMax: 8, rowMin: -4, rowMax: 5 })).toBe(art(`
      ..........
      ......#...
      .....###..
      ....####..
      .@@######.
      .@@######.
      ....####..
      .....###..
      ......#...
      ..........
    `));
  });

  it('the 15-ft east cone starts one column further out and is 8 squares', () => {
    const cells = coneCells(BIG, 90, 15);
    expect(cells).toHaveLength(8);
    expect(draw(cells, BIG, { colMin: -1, colMax: 4, rowMin: -2, rowMax: 3 })).toBe(art(`
      ......
      ....#.
      .@@###
      .@@###
      ....#.
      ......
    `));
  });

  it('the north cone leaves from the north face, not the anchor cell', () => {
    expect(draw(coneCells(BIG, 0, 30), BIG, { colMin: -4, colMax: 5, rowMin: -6, rowMax: 2 }))
      .toBe(art(`
        ....##....
        ..######..
        .########.
        ..######..
        ...####...
        ....##....
        ....@@....
        ....@@....
        ..........
      `));
  });
});

describe('coneCells — scene scale and bad input (#1735 S1)', () => {
  it('honours feetPerSquare: a 30-ft cone on a 10-ft grid is the 3-square template', () => {
    expect(draw(coneCells(CASTER, 90, 30, { feetPerSquare: 10 }), CASTER, box(3))).toBe(art(`
      .......
      .......
      .....##
      ...@###
      .....##
      .......
      .......
    `));
  });

  it('returns [] without a rect, a rosette facing, or a positive length', () => {
    expect(coneCells(null, 90, 30)).toEqual([]);
    expect(coneCells(CASTER, 30, 30)).toEqual([]);
    expect(coneCells(CASTER, 90, 0)).toEqual([]);
    expect(coneCells(CASTER, 90, -15)).toEqual([]);
    expect(coneCells(CASTER, 90, 30, { feetPerSquare: 0 })).toEqual([]);
  });

  it('is row-major and deterministic', () => {
    const cells = coneCells(CASTER, 90, 30);
    const sorted = [...cells].sort((a, b) => (a.row - b.row) || (a.col - b.col));
    expect(cells).toEqual(sorted);
    expect(cells).toEqual(coneCells(CASTER, 90, 30));
  });
});

describe('lineCells — length counting (#1735 S1)', () => {
  it('a 60-ft east line is twelve squares in the caster\'s own row', () => {
    const cells = lineCells(CASTER, 90, 60);
    expect(cells).toHaveLength(12);
    expect(draw(cells, CASTER, { colMin: -1, colMax: 13, rowMin: -1, rowMax: 1 })).toBe(art(`
      ...............
      .@############.
      ...............
    `));
  });

  it('a 60-ft NORTHEAST line is only eight squares — 5-10-5 diagonals', () => {
    // Eight diagonal squares cost 8 + floor(8/2) = 12 squares of movement =
    // 60 ft. A ninth would be 65.
    const cells = lineCells(CASTER, 45, 60);
    expect(cells).toHaveLength(8);
    expect(draw(cells, CASTER, { colMin: -1, colMax: 9, rowMin: -9, rowMax: 1 })).toBe(art(`
      ...........
      .........#.
      ........#..
      .......#...
      ......#....
      .....#.....
      ....#......
      ...#.......
      ..#........
      .@.........
      ...........
    `));
  });

  it('a 30-ft north line is six squares; a 30-ft southwest line is four', () => {
    expect(draw(lineCells(CASTER, 0, 30), CASTER, { colMin: -1, colMax: 1, rowMin: -6, rowMax: 0 }))
      .toBe(art(`
        .#.
        .#.
        .#.
        .#.
        .#.
        .#.
        .@.
      `));
    expect(draw(lineCells(CASTER, 225, 30), CASTER, { colMin: -4, colMax: 1, rowMin: 0, rowMax: 4 }))
      .toBe(art(`
        ....@.
        ...#..
        ..#...
        .#....
        #.....
      `));
  });

  it('honours feetPerSquare', () => {
    expect(lineCells(CASTER, 90, 60, 5, { feetPerSquare: 10 })).toHaveLength(6);
  });
});

describe('lineCells — width widens perpendicular (#1735 S1)', () => {
  it('a 10-ft-wide east line from a 1x1 caster leans counter-clockwise', () => {
    // Two cells cannot centre on one cell's middle, so the extra cell goes to
    // the left of the facing (north, for an east line) — documented, not
    // arbitrary: the same tie-break every width uses.
    const cells = lineCells(CASTER, 90, 30, 10);
    expect(cells).toHaveLength(12);
    expect(draw(cells, CASTER, { colMin: -1, colMax: 7, rowMin: -2, rowMax: 2 })).toBe(art(`
      .........
      ..######.
      .@######.
      .........
      .........
    `));
  });

  it('a 10-ft-wide east line from a 2x2 caster is symmetric — its face midpoint is a grid line', () => {
    const cells = lineCells(BIG, 90, 30, 10);
    expect(cells).toHaveLength(12);
    expect(draw(cells, BIG, { colMin: -1, colMax: 8, rowMin: -2, rowMax: 3 })).toBe(art(`
      ..........
      ..........
      .@@######.
      .@@######.
      ..........
      ..........
    `));
  });

  it('a 15-ft-wide east line straddles the caster\'s row', () => {
    const cells = lineCells(CASTER, 90, 30, 15);
    expect(cells).toHaveLength(18);
    expect(draw(cells, CASTER, { colMin: -1, colMax: 7, rowMin: -2, rowMax: 2 })).toBe(art(`
      .........
      ..######.
      .@######.
      ..######.
      .........
    `));
  });

  it('a wide DIAGONAL line is a contiguous swathe, not a checkerboard', () => {
    // Chains a full diagonal apart would touch only at corners and leave
    // creature-sized holes; they step one cardinal square apart instead.
    const cells = lineCells(CASTER, 45, 30, 15);
    expect(cells).toHaveLength(12);
    expect(draw(cells, CASTER, { colMin: -1, colMax: 6, rowMin: -5, rowMax: 1 })).toBe(art(`
      ........
      ....###.
      ...###..
      ..###...
      .###....
      .@......
      ........
    `));
  });

  it('a 10-ft-wide northeast line is two adjacent diagonal runs', () => {
    expect(draw(lineCells(CASTER, 45, 30, 10), CASTER, { colMin: -1, colMax: 5, rowMin: -5, rowMax: 1 }))
      .toBe(art(`
        .......
        ....##.
        ...##..
        ..##...
        .##....
        .@.....
        .......
      `));
  });

  it('defaults to 5 feet wide, and treats junk width as 5', () => {
    expect(lineCells(CASTER, 90, 30)).toEqual(lineCells(CASTER, 90, 30, 5));
    expect(lineCells(CASTER, 90, 30, null)).toEqual(lineCells(CASTER, 90, 30, 5));
    expect(lineCells(CASTER, 90, 30, 'wide')).toEqual(lineCells(CASTER, 90, 30, 5));
  });
});

describe('lineCells — symmetry and bad input (#1735 S1)', () => {
  it('a north line mirrored across the caster IS the south line', () => {
    expect(key(mirrorNS(lineCells(CASTER, 0, 60)))).toBe(key(lineCells(CASTER, 180, 60)));
    expect(key(mirrorEW(lineCells(CASTER, 90, 60)))).toBe(key(lineCells(CASTER, 270, 60)));
  });

  it('every facing produces the same cell count for a given length and width', () => {
    const cardinal = new Set([0, 90, 180, 270].map((d) => lineCells(CASTER, d, 60, 10).length));
    const diagonal = new Set([45, 135, 225, 315].map((d) => lineCells(CASTER, d, 60, 10).length));
    expect(cardinal.size).toBe(1);
    expect(diagonal.size).toBe(1);
  });

  it('returns [] without a rect, a rosette facing, or a usable length', () => {
    expect(lineCells(null, 90, 60)).toEqual([]);
    expect(lineCells(CASTER, 22, 60)).toEqual([]);
    expect(lineCells(CASTER, 90, 0)).toEqual([]);
    // Shorter than one square: nothing to draw.
    expect(lineCells(CASTER, 90, 4)).toEqual([]);
    expect(lineCells(CASTER, 45, 4)).toEqual([]);
  });

  it('is row-major and deterministic', () => {
    const cells = lineCells(CASTER, 45, 60, 15);
    const sorted = [...cells].sort((a, b) => (a.row - b.row) || (a.col - b.col));
    expect(cells).toEqual(sorted);
  });
});
