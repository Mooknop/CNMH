// computeFlanking geometry unit tests.
// All scenarios use a 100px grid (10-foot squares). Tokens default to 1×1.
// Coordinates are pixel top-left corners: (col * 100, row * 100).

import { computeFlanking } from './flanking.js';

const G = 100; // gridSize

function tok(id, col, row, w = 1, h = 1) {
  return { id, x: col * G, y: row * G, document: { width: w, height: h } };
}

function pc(charId, col, row, w, h) {
  return { charId, token: tok(charId, col, row, w, h) };
}

// ── 1×1 enemy at (5,5). Adjacent = cols 4–6, rows 4–6. ──────────────────

describe('basic flanking: 1×1 enemy', () => {
  const enemy = tok('goblin', 5, 5);

  it('opposite sides (left vs right) → flanked, both charIds listed', () => {
    const res = computeFlanking([enemy], [pc('A', 4, 5), pc('B', 6, 5)], G);
    expect(res['goblin'].byCharIds.sort()).toEqual(['A', 'B']);
  });

  it('opposite sides (top vs bottom) → flanked', () => {
    const res = computeFlanking([enemy], [pc('A', 5, 4), pc('B', 5, 6)], G);
    expect(res['goblin'].byCharIds.sort()).toEqual(['A', 'B']);
  });

  it('diagonal opposite corners → flanked (line passes through target box)', () => {
    const res = computeFlanking([enemy], [pc('A', 4, 4), pc('B', 6, 6)], G);
    expect(res['goblin'].byCharIds.sort()).toEqual(['A', 'B']);
  });

  it('same side (both left) → not flanked', () => {
    const res = computeFlanking([enemy], [pc('A', 4, 4), pc('B', 4, 6)], G);
    expect(res['goblin']).toBeUndefined();
  });

  it('adjacent but same column (both above) → not flanked', () => {
    const res = computeFlanking([enemy], [pc('A', 4, 4), pc('B', 5, 4)], G);
    expect(res['goblin']).toBeUndefined();
  });

  it('not adjacent (far away) → not flanked even if line passes through', () => {
    // PC A is far to the left, PC B is far to the right — line passes through
    // target but adjacency check fails.
    const res = computeFlanking([enemy], [pc('A', 1, 5), pc('B', 9, 5)], G);
    expect(res['goblin']).toBeUndefined();
  });

  it('only one PC → no pair → not flanked', () => {
    const res = computeFlanking([enemy], [pc('A', 4, 5)], G);
    expect(res['goblin']).toBeUndefined();
  });

  it('three PCs, one valid pair → both valid pair charIds listed', () => {
    // A (left) + B (right) flank; C is far away (not adjacent) so neither pair
    // including C satisfies the adjacency check.
    const res = computeFlanking(
      [enemy],
      [pc('A', 4, 5), pc('B', 6, 5), pc('C', 1, 5)],
      G
    );
    expect(res['goblin'].byCharIds.sort()).toEqual(['A', 'B']);
  });

  it('no enemies → empty result', () => {
    expect(computeFlanking([], [pc('A', 4, 5), pc('B', 6, 5)], G)).toEqual({});
  });

  it('no PCs → empty result', () => {
    expect(computeFlanking([enemy], [], G)).toEqual({});
  });
});

// ── 2×2 enemy (ogre) at col 5, row 5 (pixel 500,500 → footprint 600–700) ──

describe('multi-square enemy (2×2)', () => {
  const ogre = tok('ogre', 5, 5, 2, 2);
  // ogre occupies cols 5–6, rows 5–6 (pixels 500–700, 500–700)

  it('flankers on opposite sides of a 2×2 token → flanked', () => {
    // Left of ogre at (4,5), right of ogre at (7,5)
    const res = computeFlanking([ogre], [pc('A', 4, 5), pc('B', 7, 5)], G);
    expect(res['ogre'].byCharIds.sort()).toEqual(['A', 'B']);
  });

  it('flankers on same side of a 2×2 token → not flanked', () => {
    const res = computeFlanking([ogre], [pc('A', 4, 5), pc('B', 4, 6)], G);
    expect(res['ogre']).toBeUndefined();
  });
});
