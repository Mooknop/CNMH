import { buildPartyMarkers, buildTokenMarkers, footprintCorners, tintFor } from './tokenMarkers';

// A 1000x1000 world captured edge-to-edge, gridSize 100 (10x10 cells) — no
// `capture` matrix, so normalizedFromWorld falls back to the plain worldRect
// interpolation (exercised directly by snapshotGeometry's own tests).
const snapshot = { gridSize: 100, worldRect: { x1: 0, y1: 0, x2: 1000, y2: 1000 } };

const order = [
  { entryId: 'e-pc', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
  { entryId: 'e-goblin', kind: 'enemy', name: 'Goblin Warrior', disposition: -1 },
  { entryId: 'e-ally', kind: 'enemy', name: 'Hired Blade', disposition: 1 },
  { entryId: 'e-ghost', kind: 'enemy', name: 'Skulking Assassin', disposition: -1, hidden: true },
];

describe('footprintCorners', () => {
  it('returns the four corners of a 1x1 cell in normalized space', () => {
    const corners = footprintCorners(2, 3, 1, 1, snapshot);
    expect(corners).toEqual([
      { nx: 0.2, ny: 0.3 },
      { nx: 0.3, ny: 0.3 },
      { nx: 0.3, ny: 0.4 },
      { nx: 0.2, ny: 0.4 },
    ]);
  });

  it('spans multiple cells for a multi-square footprint', () => {
    const corners = footprintCorners(2, 3, 2, 2, snapshot);
    expect(corners).toEqual([
      { nx: 0.2, ny: 0.3 },
      { nx: 0.4, ny: 0.3 },
      { nx: 0.4, ny: 0.5 },
      { nx: 0.2, ny: 0.5 },
    ]);
  });

  it('returns null without a usable gridSize', () => {
    expect(footprintCorners(0, 0, 1, 1, { worldRect: snapshot.worldRect })).toBeNull();
  });
});

describe('tintFor', () => {
  it('classifies pc / enemy / ally(disposition 1) / summon', () => {
    expect(tintFor({ kind: 'pc' })).toBe('pc');
    expect(tintFor({ kind: 'enemy', disposition: -1 })).toBe('enemy');
    expect(tintFor({ kind: 'enemy', disposition: 0 })).toBe('enemy');
    expect(tintFor({ kind: 'enemy', disposition: 1 })).toBe('ally');
    expect(tintFor({ kind: 'summon' })).toBe('summon');
    expect(tintFor(null)).toBeNull();
  });
});

describe('buildTokenMarkers', () => {
  const positions = {
    gridSize: 100,
    positions: {
      'e-pc': { col: 0, row: 0 },
      'e-goblin': { col: 2, row: 2, width: 2, height: 2 },
      'e-ally': { col: 5, row: 5 },
      'e-ghost': { col: 6, row: 6 }, // not hidden on the pos entry itself
    },
  };

  it('builds a marker per visible position, joined to the order', () => {
    const markers = buildTokenMarkers({ positions, order, snapshot });
    const byId = Object.fromEntries(markers.map((m) => [m.entryId, m]));

    expect(byId['e-pc']).toMatchObject({ name: 'Pellias', kind: 'pc', tint: 'pc', width: 1, height: 1 });
    expect(byId['e-goblin']).toMatchObject({
      name: 'Goblin Warrior', kind: 'enemy', tint: 'enemy', width: 2, height: 2,
    });
    expect(byId['e-ally']).toMatchObject({ name: 'Hired Blade', tint: 'ally' });
  });

  it('excludes an entry hidden on the ORDER side even when positions omits `hidden`', () => {
    const markers = buildTokenMarkers({ positions, order, snapshot });
    expect(markers.find((m) => m.entryId === 'e-ghost')).toBeUndefined();
  });

  it('excludes an entry hidden on the POSITIONS side (defense in depth)', () => {
    const hiddenOnWire = {
      gridSize: 100,
      positions: { 'e-pc': { col: 0, row: 0, hidden: true } },
    };
    const markers = buildTokenMarkers({ positions: hiddenOnWire, order, snapshot });
    expect(markers).toEqual([]);
  });

  it('defaults width/height to 1 for an older bridge (no footprint fields)', () => {
    const bare = { gridSize: 100, positions: { 'e-pc': { col: 1, row: 1 } } };
    const [marker] = buildTokenMarkers({ positions: bare, order, snapshot });
    expect(marker).toMatchObject({ width: 1, height: 1 });
  });

  it('ignores a non-positive-integer width/height rather than throwing', () => {
    const weird = { gridSize: 100, positions: { 'e-pc': { col: 1, row: 1, width: 0, height: -2 } } };
    const [marker] = buildTokenMarkers({ positions: weird, order, snapshot });
    expect(marker).toMatchObject({ width: 1, height: 1 });
  });

  it('computes a normalized center at the footprint midpoint', () => {
    const [marker] = buildTokenMarkers({
      positions: { gridSize: 100, positions: { 'e-pc': { col: 2, row: 2, width: 2, height: 2 } } },
      order,
      snapshot,
    });
    expect(marker.center).toEqual({ nx: 0.3, ny: 0.3 }); // (2..4) cells → midpoint 3 → 300/1000
  });

  it('an entryId with no matching order entry still renders (name/kind null)', () => {
    const [marker] = buildTokenMarkers({
      positions: { gridSize: 100, positions: { 'cbt-unknown': { col: 0, row: 0 } } },
      order,
      snapshot,
    });
    expect(marker).toMatchObject({ entryId: 'cbt-unknown', name: null, kind: null, tint: null });
  });

  it('returns nothing without a positions payload or a snapshot', () => {
    expect(buildTokenMarkers({ positions: null, order, snapshot })).toEqual([]);
    expect(buildTokenMarkers({ positions, order, snapshot: null })).toEqual([]);
  });

  it('drops an entry whose gridSize makes the geometry unusable', () => {
    const noGrid = { ...snapshot, gridSize: 0 };
    expect(buildTokenMarkers({ positions, order, snapshot: noGrid })).toEqual([]);
  });
});

// The party-framed capture's own join (#1808): world-space token centres off
// the wire, joined against the ROSTER (exploration has no encounter order).
describe('buildPartyMarkers', () => {
  const characters = [
    { id: 'Pellias', name: 'Pellias' },
    { id: 'Ashka', name: 'Ashka B. Gosh' },
  ];
  const tokens = [
    { moverId: 'Pellias', x: 550, y: 550 },
    { moverId: 'Ashka', x: 250, y: 850 },
  ];

  it('projects each world-space token centre and its own grid cell', () => {
    const [pellias, ashka] = buildPartyMarkers({ tokens, snapshot, characters });
    expect(pellias).toMatchObject({
      moverId: 'Pellias',
      charId: 'Pellias',
      name: 'Pellias',
      world: { x: 550, y: 550 },
      cell: { col: 5, row: 5 },
      center: { nx: 0.55, ny: 0.55 },
    });
    // The footprint is the token's own cell, so a tap ON a PC is a direct hit.
    expect(pellias.footprint).toEqual([
      { nx: 0.5, ny: 0.5 }, { nx: 0.6, ny: 0.5 },
      { nx: 0.6, ny: 0.6 }, { nx: 0.5, ny: 0.6 },
    ]);
    expect(ashka).toMatchObject({ name: 'Ashka B. Gosh', cell: { col: 2, row: 8 } });
  });

  it('asks the caller for each PC accent, by charId and roster index', () => {
    const accentFor = vi.fn((charId, index) => `${charId}:${index}`);
    const markers = buildPartyMarkers({ tokens, snapshot, characters, accentFor });
    expect(markers.map((m) => m.accent)).toEqual(['Pellias:0', 'Ashka:1']);
  });

  it('still draws a token with no roster match, falling back to the mover id', () => {
    const [marker] = buildPartyMarkers({
      tokens: [{ moverId: 'tok-stranger', x: 150, y: 150 }],
      snapshot,
      characters,
    });
    expect(marker).toMatchObject({ moverId: 'tok-stranger', charId: null, name: 'tok-stranger' });
  });

  it('skips malformed tokens and returns nothing without tokens or a snapshot', () => {
    const mixed = buildPartyMarkers({
      tokens: [{ moverId: 'Pellias' }, { x: 1, y: 2 }, { moverId: 'Ashka', x: 250, y: 850 }],
      snapshot,
      characters,
    });
    expect(mixed.map((m) => m.moverId)).toEqual(['Ashka']);
    expect(buildPartyMarkers({ tokens: null, snapshot })).toEqual([]);
    expect(buildPartyMarkers({ tokens, snapshot: null })).toEqual([]);
  });
});
