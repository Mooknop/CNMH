import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SnapshotRouteOverlay from './SnapshotRouteOverlay';

// An identity 1000x1000 capture over a 100 ft grid — every cell (col,row)
// centers at world ((col+0.5)*100, (row+0.5)*100), which normalizes straight
// through to nx/ny without any matrix math to second-guess.
const SNAPSHOT = {
  capture: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 1000, screenH: 1000 },
  worldRect: { x1: 0, y1: 0, x2: 1000, y2: 1000 },
  gridSize: 100,
};

const mount = (props) => render(<SnapshotRouteOverlay snapshot={SNAPSHOT} {...props} />);

// SVG `points` are built from floating-point division, so compare parsed,
// rounded numbers rather than the exact string (0.55*100 !== "55" bit-for-bit).
const parsePoints = (attr) => attr.split(' ').map((pair) => pair.split(',').map(Number));
const roundPoints = (attr) => parsePoints(attr).map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]);

describe('SnapshotRouteOverlay (#1744 S2)', () => {
  it('renders nothing without a snapshot', () => {
    const { container } = render(<SnapshotRouteOverlay snapshot={null} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('draws a polyline through the origin + route cell centers', () => {
    const { container } = mount({ origin: { col: 5, row: 5 }, cells: [{ col: 6, row: 5 }, { col: 7, row: 5 }] });
    const line = container.querySelector('.sro-line');
    expect(line).not.toBeNull();
    expect(roundPoints(line.getAttribute('points'))).toEqual([[55, 55], [65, 55], [75, 55]]);
  });

  it('omits the polyline when there is only one point on the route', () => {
    const { container } = mount({ origin: { col: 5, row: 5 }, cells: [] });
    expect(container.querySelector('.sro-line')).toBeNull();
  });

  it('highlights the destination cell, defaulting to the last route cell', () => {
    const { container } = mount({ origin: { col: 5, row: 5 }, cells: [{ col: 6, row: 5 }, { col: 7, row: 5 }] });
    const dest = container.querySelector('.sro-dest');
    expect(roundPoints(dest.getAttribute('points'))).toEqual([[70, 50], [80, 50], [80, 60], [70, 60]]);
  });

  it('an explicit destination overrides the last-cell default', () => {
    const { container } = mount({
      origin: { col: 5, row: 5 },
      cells: [{ col: 6, row: 5 }],
      destination: { col: 9, row: 9 },
    });
    const dest = container.querySelector('.sro-dest');
    expect(roundPoints(dest.getAttribute('points'))).toEqual([[90, 90], [100, 90], [100, 100], [90, 100]]);
  });

  it('highlights the mover\'s own origin cell', () => {
    const { container } = mount({ origin: { col: 5, row: 5 } });
    const origin = container.querySelector('.sro-origin');
    expect(roundPoints(origin.getAttribute('points'))).toEqual([[50, 50], [60, 50], [60, 60], [50, 60]]);
  });

  it('draws no destination or origin highlight without cells to anchor them', () => {
    const { container } = mount({});
    expect(container.querySelector('.sro-dest')).toBeNull();
    expect(container.querySelector('.sro-origin')).toBeNull();
    expect(container.querySelector('.sro-line')).toBeNull();
  });

  it('draws a lattice spanning the captured worldRect only when asked', () => {
    const { container: without } = mount({ origin: { col: 5, row: 5 } });
    expect(without.querySelectorAll('.sro-lattice').length).toBe(0);

    const { container: withLattice } = mount({ origin: { col: 5, row: 5 }, showLattice: true });
    // A 0..1000 rect on a 100-size grid spans 11 column lines + 11 row lines.
    expect(withLattice.querySelectorAll('.sro-lattice').length).toBe(22);
  });

  it('applies the ghost variant class for other movers\' routes', () => {
    const { container } = mount({ origin: { col: 5, row: 5 }, variant: 'ghost' });
    expect(container.querySelector('svg')).toHaveClass('sro--ghost');
  });

  it('defaults to the own variant class', () => {
    const { container } = mount({ origin: { col: 5, row: 5 } });
    expect(container.querySelector('svg')).toHaveClass('sro--own');
  });
});
