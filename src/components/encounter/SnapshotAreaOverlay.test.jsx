import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SnapshotAreaOverlay from './SnapshotAreaOverlay';

// An identity 1000x1000 capture over a 100px grid (5 ft/square), so world
// (200,0) normalizes straight through to nx=0.2, ny=0 without any matrix
// math to second-guess.
const SNAPSHOT = {
  capture: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 1000, screenH: 1000 },
  worldRect: { x1: 0, y1: 0, x2: 1000, y2: 1000 },
  gridSize: 100,
};

const mount = (props) => render(<SnapshotAreaOverlay snapshot={SNAPSHOT} {...props} />);

const parsePoints = (attr) => attr.split(' ').map((pair) => pair.split(',').map(Number));
const roundPoints = (attr) => parsePoints(attr).map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]);

describe('SnapshotAreaOverlay (#1751 S2)', () => {
  it('renders nothing without a snapshot', () => {
    const { container } = render(<SnapshotAreaOverlay snapshot={null} shape="burst" feet={20} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('draws a burst as a true circle centred on the snapped intersection', () => {
    const { container } = mount({ shape: 'burst', feet: 20, origin: { x: 200, y: 0 } });
    const outline = container.querySelector('.sao-outline');
    expect(outline).not.toBeNull();
    const points = roundPoints(outline.getAttribute('points'));
    // 20 ft / 5 ft-per-square * 100px = 400px radius. First sample (angle 0)
    // sits at world (200+400, 0) = (600,0) → nx 0.6 → 60.
    expect(points[0]).toEqual([60, 0]);
    // Every sample is equidistant (400px) from the center in world space —
    // spot-check a quarter turn around (angle 90°, world (200, 400)).
    const quarter = points[12];
    expect(quarter).toEqual([20, 40]);
  });

  it('draws an emanation as a rounded rectangle expanded from the caster rect', () => {
    const { container } = mount({
      shape: 'emanation', feet: 10, casterRect: { col: 0, row: 0, width: 2, height: 2 },
    });
    const outline = container.querySelector('.sao-outline');
    expect(outline).not.toBeNull();
    const points = roundPoints(outline.getAttribute('points'));
    // 10 ft / 5 ft-per-square * 100px = 200px radius. First sample is the
    // top-right arc's start (world (200, -200)) → (20, -20).
    expect(points[0]).toEqual([20, -20]);
  });

  it('draws no outline for a burst with no placed origin yet', () => {
    const { container } = mount({ shape: 'burst', feet: 20, origin: null });
    expect(container.querySelector('.sao-outline')).toBeNull();
  });

  it('draws no outline for a cone/line — that geometry is #1735\'s', () => {
    const { container } = mount({ shape: 'cone', feet: 15, origin: { x: 200, y: 0 } });
    expect(container.querySelector('.sao-outline')).toBeNull();
  });

  it('shades the counted occupant cells', () => {
    const { container } = mount({
      shape: 'burst', feet: 20, origin: { x: 200, y: 0 },
      occupantCells: [{ col: 2, row: 0 }, { col: 0, row: 0 }],
    });
    expect(container.querySelectorAll('.sao-cell').length).toBe(2);
  });

  it('draws a direction hint arrow for a cone once a rosette direction is chosen', () => {
    const { container } = mount({
      shape: 'cone', feet: 15, origin: { x: 200, y: 0 }, direction: { dc: 1, dr: 0 },
    });
    const shaft = container.querySelector('.sao-direction-shaft');
    const head = container.querySelector('.sao-direction-head');
    expect(shaft).not.toBeNull();
    expect(head).not.toBeNull();
    expect(Number(shaft.getAttribute('x1'))).toBeCloseTo(20);
    expect(Number(shaft.getAttribute('x2'))).toBeCloseTo(31);
    expect(roundPoints(head.getAttribute('points'))[0]).toEqual([35, 0]);
  });

  it('draws no direction arrow before a facing is chosen', () => {
    const { container } = mount({ shape: 'line', feet: 30, origin: { x: 200, y: 0 }, direction: null });
    expect(container.querySelector('.sao-direction-shaft')).toBeNull();
  });

  it('draws a lattice only when asked', () => {
    const { container: without } = mount({ shape: 'burst', feet: 20, origin: { x: 200, y: 0 } });
    expect(without.querySelectorAll('.sao-lattice').length).toBe(0);

    const { container: withLattice } = mount({
      shape: 'burst', feet: 20, origin: { x: 200, y: 0 }, showLattice: true,
    });
    // A 0..1000 rect on a 100-size grid spans 11 column lines + 11 row lines.
    expect(withLattice.querySelectorAll('.sao-lattice').length).toBe(22);
  });

  it('applies a shape-specific class', () => {
    const { container } = mount({ shape: 'emanation', feet: 10, casterRect: { col: 0, row: 0, width: 1, height: 1 } });
    expect(container.querySelector('svg')).toHaveClass('sao--emanation');
  });
});
