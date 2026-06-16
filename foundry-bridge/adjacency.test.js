// computeAdjacency geometry unit tests (#430).
// 100px grid (10-foot squares); tokens default 1×1. Coordinates are pixel
// top-left corners: (col * 100, row * 100).

import { computeAdjacency } from './adjacency.js';

const G = 100;

function tok(id, col, row, w = 1, h = 1) {
  return { id, x: col * G, y: row * G, document: { width: w, height: h } };
}
function ct(combatantId, col, row, w, h) {
  return { combatantId, token: tok(combatantId, col, row, w, h) };
}

describe('computeAdjacency', () => {
  it('orthogonally adjacent tokens are mutually adjacent', () => {
    const res = computeAdjacency([ct('A', 5, 5), ct('B', 6, 5)], G);
    expect(res.A).toEqual(['B']);
    expect(res.B).toEqual(['A']);
  });

  it('diagonally adjacent (corner-touching) counts as adjacent', () => {
    const res = computeAdjacency([ct('A', 5, 5), ct('B', 6, 6)], G);
    expect(res.A).toEqual(['B']);
    expect(res.B).toEqual(['A']);
  });

  it('tokens a square apart are NOT adjacent (no entries)', () => {
    const res = computeAdjacency([ct('A', 5, 5), ct('B', 7, 5)], G);
    expect(res.A).toBeUndefined();
    expect(res.B).toBeUndefined();
  });

  it('keys by combatantId and lists every adjacent combatant', () => {
    // C in the middle, A left and B right — both adjacent to C, not each other.
    const res = computeAdjacency([ct('A', 4, 5), ct('C', 5, 5), ct('B', 6, 5)], G);
    expect(res.C.sort()).toEqual(['A', 'B']);
    expect(res.A).toEqual(['C']);
    expect(res.B).toEqual(['C']);
  });

  it('a large (2×2) token is adjacent to a token touching any of its cells', () => {
    // 2×2 ogre occupying cols 4–5, rows 4–5; PC at (6,4) touches its right edge.
    const res = computeAdjacency([ct('Ogre', 4, 4, 2, 2), ct('P', 6, 4)], G);
    expect(res.Ogre).toEqual(['P']);
    expect(res.P).toEqual(['Ogre']);
  });

  it('skips entries without a token', () => {
    const res = computeAdjacency([ct('A', 5, 5), { combatantId: 'B', token: null }], G);
    expect(res).toEqual({});
  });

  it('empty input → empty map', () => {
    expect(computeAdjacency([], G)).toEqual({});
  });
});
