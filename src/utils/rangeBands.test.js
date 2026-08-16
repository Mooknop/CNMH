import { describe, it, expect } from 'vitest';
import { isoDistancePolygon, originWorldFromPosition, buildRangeBands } from './rangeBands';
import { gridDistanceFeet, MAX_RANGE_INCREMENTS } from './rangeIncrement';

// Identity transform, 100 px per grid square, a 1000x1000 world → normalized
// coordinates are simply world/1000.
const SNAPSHOT = {
  capture: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 1000, screenH: 1000 },
  worldRect: { x1: 0, y1: 0, x2: 1000, y2: 1000 },
  gridSize: 100,
};

const CENTER = { x: 500, y: 500 };

describe('rangeBands (#1749 S5)', () => {
  describe('isoDistancePolygon', () => {
    it('returns null without a usable snapshot grid or a positive distance', () => {
      expect(isoDistancePolygon(CENTER, 30, { snapshot: { gridSize: 0 } })).toBeNull();
      expect(isoDistancePolygon(CENTER, 0, { snapshot: SNAPSHOT })).toBeNull();
      expect(isoDistancePolygon(null, 30, { snapshot: SNAPSHOT })).toBeNull();
    });

    it('reaches exactly the stated distance along a cardinal direction', () => {
      // theta = 0 is the first sample: due east, 30 ft = 6 squares = 600 px.
      const poly = isoDistancePolygon(CENTER, 30, { snapshot: SNAPSHOT, samples: 8 });
      expect(poly[0].nx).toBeCloseTo((500 + 600) / 1000, 6);
      expect(poly[0].ny).toBeCloseTo(0.5, 6);
    });

    it('is an octagon, not a circle — the diagonal is SHORTER, matching 5-10-5', () => {
      // PF2e's alternating diagonals make a diagonal step cost 1.5 squares on
      // average, so along 45 degrees the contour reaches only 1/1.5 as many
      // SQUARES on each axis as it does due east: 6 squares east, 4 squares
      // north-east-and-north. A circle would over-promise there by 50%.
      const poly = isoDistancePolygon(CENTER, 30, { snapshot: SNAPSHOT, samples: 8 });
      const east = (poly[0].nx - 0.5) * 1000;
      const diag = poly[1];  // theta = 45 degrees
      expect(east).toBeCloseTo(600, 6);
      expect((diag.nx - 0.5) * 1000).toBeCloseTo(400, 6);
      expect((diag.ny - 0.5) * 1000).toBeCloseTo(400, 6);
      // …which is strictly inside the circle a naive ring would have drawn.
      expect(Math.hypot((diag.nx - 0.5) * 1000, (diag.ny - 0.5) * 1000)).toBeLessThan(600);
    });

    it('agrees with gridDistanceFeet on the cells it encloses, within one step', () => {
      // The drawn contour drops gridDistanceFeet's floor(), so a cell can sit
      // at most one 5-ft step on the wrong side of the line. Sample the
      // diagonal, where the disagreement is largest.
      const poly = isoDistancePolygon(CENTER, 30, { snapshot: SNAPSHOT, samples: 8 });
      const diag = poly[1];
      const squares = Math.abs((diag.nx - 0.5) * 1000) / 100;  // squares along one axis
      const cells = Math.round(squares);
      const measured = gridDistanceFeet({ col: 0, row: 0 }, { col: cells, row: cells });
      expect(Math.abs(measured - 30)).toBeLessThanOrEqual(5);
    });
  });

  describe('originWorldFromPosition', () => {
    it('centres on a 1x1 token cell', () => {
      expect(originWorldFromPosition({ col: 3, row: 4 }, 100)).toEqual({ x: 350, y: 450 });
    });

    it('centres on the whole footprint of a multi-square token', () => {
      // A 2x2 ogre anchored at (3,4) occupies 3..5 / 4..6 — its centre is the
      // rect's middle, not the anchor cell's.
      expect(originWorldFromPosition({ col: 3, row: 4, width: 2, height: 2 }, 100))
        .toEqual({ x: 400, y: 500 });
    });

    it('returns null without a position or a usable grid size', () => {
      expect(originWorldFromPosition(null, 100)).toBeNull();
      expect(originWorldFromPosition({ col: 1, row: 1 }, 0)).toBeNull();
      expect(originWorldFromPosition({ col: 'x', row: 1 }, 100)).toBeNull();
    });
  });

  describe('buildRangeBands', () => {
    it('builds one band per house-rule increment for a ranged weapon', () => {
      const bands = buildRangeBands({ incrementFt: 30 });
      expect(bands).toHaveLength(MAX_RANGE_INCREMENTS);
      expect(bands.map((b) => b.feet)).toEqual([30, 60, 90, 120]);
      expect(bands.map((b) => b.tone)).toEqual(['clear', 'penalty', 'penalty', 'max']);
    });

    it('labels each band with the penalty rangeIncrementResult would report', () => {
      const bands = buildRangeBands({ incrementFt: 30 });
      expect(bands[0].label).toBe('30 ft');
      expect(bands[1].label).toBe('60 ft · -2');
      expect(bands[2].label).toBe('90 ft · -4');
      expect(bands[3].label).toBe('120 ft · -6 · max');
    });

    it('falls back to a single reach ring, labelled a hint', () => {
      const bands = buildRangeBands({ incrementFt: null, reachFt: 10 });
      expect(bands).toHaveLength(1);
      expect(bands[0]).toMatchObject({ feet: 10, tone: 'reach', increment: null });
      expect(bands[0].label).toContain('hint');
    });

    it('draws nothing when there is neither an increment nor a reach', () => {
      expect(buildRangeBands({ incrementFt: null, reachFt: 0 })).toEqual([]);
    });
  });
});
