import { describe, it, expect } from 'vitest';
import { worldPointFromTap, cellFromWorldPoint } from './snapshotGeometry';

// The capture matrix maps WORLD → SCREEN; these tests build screen coords from
// known world points with that forward transform, then assert the inverse
// recovers the original world point — so a sign error can't pass.
const forward = ({ a, b, c, d, tx, ty }, wx, wy) => ({
  sx: a * wx + c * wy + tx,
  sy: b * wx + d * wy + ty,
});

const snapshotWith = (capture, worldRect = null) => ({ capture, worldRect });

describe('worldPointFromTap', () => {
  it('inverts a zoom + translate capture (the common case)', () => {
    const capture = { a: 1.5, b: 0, c: 0, d: 1.5, tx: -300, ty: -150, screenW: 1200, screenH: 800 };
    const world = { x: 640, y: 480 };
    const { sx, sy } = forward(capture, world.x, world.y);

    const got = worldPointFromTap(snapshotWith(capture), sx / capture.screenW, sy / capture.screenH);
    expect(got.x).toBeCloseTo(world.x, 6);
    expect(got.y).toBeCloseTo(world.y, 6);
  });

  it('inverts a rotated/skewed capture (b and c non-zero)', () => {
    const capture = { a: 1.2, b: 0.4, c: -0.3, d: 1.1, tx: 40, ty: -20, screenW: 1000, screenH: 700 };
    const world = { x: 315, y: 210 };
    const { sx, sy } = forward(capture, world.x, world.y);

    const got = worldPointFromTap(snapshotWith(capture), sx / capture.screenW, sy / capture.screenH);
    expect(got.x).toBeCloseTo(world.x, 6);
    expect(got.y).toBeCloseTo(world.y, 6);
  });

  it('maps the corners of an identity capture to the viewport corners', () => {
    const capture = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 800, screenH: 600 };
    expect(worldPointFromTap(snapshotWith(capture), 0, 0)).toEqual({ x: 0, y: 0 });
    expect(worldPointFromTap(snapshotWith(capture), 1, 1)).toEqual({ x: 800, y: 600 });
    expect(worldPointFromTap(snapshotWith(capture), 0.5, 0.5)).toEqual({ x: 400, y: 300 });
  });

  it('falls back to worldRect interpolation when the matrix is singular', () => {
    // det = 0 — un-invertible, so the rect is the only usable mapping.
    const capture = { a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0, screenW: 100, screenH: 100 };
    const worldRect = { x1: 100, y1: 200, x2: 500, y2: 600 };
    expect(worldPointFromTap(snapshotWith(capture, worldRect), 0.5, 0.25))
      .toEqual({ x: 300, y: 300 });
  });

  it('falls back to worldRect when there is no capture at all', () => {
    const worldRect = { x1: 0, y1: 0, x2: 1000, y2: 500 };
    expect(worldPointFromTap({ worldRect }, 0.25, 0.5)).toEqual({ x: 250, y: 250 });
  });

  it('clamps taps outside the image instead of extrapolating off-map', () => {
    const capture = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 800, screenH: 600 };
    expect(worldPointFromTap(snapshotWith(capture), -0.5, 2)).toEqual({ x: 0, y: 600 });
  });

  it('returns null without any usable data', () => {
    expect(worldPointFromTap(null, 0.5, 0.5)).toBeNull();
    expect(worldPointFromTap({}, 0.5, 0.5)).toBeNull();
  });
});

describe('cellFromWorldPoint', () => {
  it('floors a world point into the bridge’s { col, row } vocabulary', () => {
    expect(cellFromWorldPoint({ x: 0, y: 0 }, 100)).toEqual({ col: 0, row: 0 });
    expect(cellFromWorldPoint({ x: 640, y: 480 }, 100)).toEqual({ col: 6, row: 4 });
    // A point exactly on a boundary belongs to the cell it opens.
    expect(cellFromWorldPoint({ x: 700, y: 500 }, 100)).toEqual({ col: 7, row: 5 });
  });

  it('returns null without a usable grid size', () => {
    expect(cellFromWorldPoint({ x: 10, y: 10 }, 0)).toBeNull();
    expect(cellFromWorldPoint(null, 100)).toBeNull();
  });
});
