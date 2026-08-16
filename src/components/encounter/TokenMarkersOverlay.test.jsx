import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TokenMarkersOverlay from './TokenMarkersOverlay';

const SNAPSHOT = {
  capture: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 1000, screenH: 1000 },
  worldRect: { x1: 0, y1: 0, x2: 1000, y2: 1000 },
  gridSize: 100,
};

const order = [
  { entryId: 'e-pc', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
  { entryId: 'e-goblin', kind: 'enemy', name: 'Goblin Warrior', disposition: -1 },
  { entryId: 'e-ghost', kind: 'enemy', name: 'Skulker', disposition: -1, hidden: true },
];

const positions = {
  gridSize: 100,
  positions: {
    'e-pc': { col: 1, row: 1 },
    'e-goblin': { col: 5, row: 5, width: 2, height: 2 },
    'e-ghost': { col: 8, row: 8 },
  },
};

describe('TokenMarkersOverlay (#1749 wave 1)', () => {
  it('renders nothing without a snapshot', () => {
    const { container } = render(<TokenMarkersOverlay snapshot={null} positions={positions} order={order} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders nothing without any positions data', () => {
    const { container } = render(<TokenMarkersOverlay snapshot={SNAPSHOT} positions={null} order={order} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders one marker group per visible combatant', () => {
    const { container } = render(<TokenMarkersOverlay snapshot={SNAPSHOT} positions={positions} order={order} />);
    const groups = container.querySelectorAll('.tmo-marker');
    expect(groups.length).toBe(2); // pc + goblin, ghost excluded
  });

  it('never renders a marker for a hidden combatant', () => {
    const { container } = render(<TokenMarkersOverlay snapshot={SNAPSHOT} positions={positions} order={order} />);
    const names = Array.from(container.querySelectorAll('.tmo-label')).map((n) => n.textContent);
    expect(names).not.toContain('Skulker');
  });

  it('tints markers by disposition and labels them by name', () => {
    const { container } = render(<TokenMarkersOverlay snapshot={SNAPSHOT} positions={positions} order={order} />);
    expect(container.querySelector('.tmo-marker--pc')).not.toBeNull();
    expect(container.querySelector('.tmo-marker--enemy')).not.toBeNull();
    const labels = Array.from(container.querySelectorAll('.tmo-label')).map((n) => n.textContent);
    expect(labels.sort()).toEqual(['Goblin Warrior', 'Pellias']);
  });

  it('rings the markers whose entryIds are in the target set (#1749 S4)', () => {
    const { container } = render(
      <TokenMarkersOverlay snapshot={SNAPSHOT} positions={positions} order={order} selectedIds={['e-goblin']} />
    );
    const selected = container.querySelectorAll('.tmo-marker--selected');
    expect(selected).toHaveLength(1);
    expect(selected[0].getAttribute('data-entry-id')).toBe('e-goblin');
    expect(container.querySelectorAll('.tmo-select')).toHaveLength(1);
  });

  it('badges a flanked marker with ⚔ and dims one out of reach (#1749 S5)', () => {
    const { container } = render(
      <TokenMarkersOverlay
        snapshot={SNAPSHOT}
        positions={positions}
        order={order}
        flankedIds={['e-goblin']}
        outOfReachIds={['e-pc']}
      />
    );
    const badges = container.querySelectorAll('.tmo-flank');
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe('⚔');
    expect(badges[0].closest('.tmo-marker').getAttribute('data-entry-id')).toBe('e-goblin');
    expect(container.querySelector('.tmo-marker--far').getAttribute('data-entry-id')).toBe('e-pc');
  });

  it('marks the attacker as the origin', () => {
    const { container } = render(
      <TokenMarkersOverlay snapshot={SNAPSHOT} positions={positions} order={order} originId="e-pc" />
    );
    expect(container.querySelector('.tmo-marker--origin').getAttribute('data-entry-id')).toBe('e-pc');
  });

  it('draws a caller-supplied marker list verbatim, so the picture and the hit test agree', () => {
    // The tap surface hit-tests a FILTERED list (only what the chips could
    // target); passing that same list in is what keeps "where is this marker"
    // to one answer.
    const { container } = render(
      <TokenMarkersOverlay
        snapshot={SNAPSHOT}
        markers={[{
          entryId: 'e-only',
          name: 'Only',
          tint: 'enemy',
          center: { nx: 0.5, ny: 0.5 },
          footprint: [
            { nx: 0.4, ny: 0.4 }, { nx: 0.6, ny: 0.4 },
            { nx: 0.6, ny: 0.6 }, { nx: 0.4, ny: 0.6 },
          ],
        }]}
        positions={positions}
        order={order}
      />
    );
    const drawn = Array.from(container.querySelectorAll('.tmo-marker'))
      .map((g) => g.getAttribute('data-entry-id'));
    expect(drawn).toEqual(['e-only']);
  });

  it('draws a multi-cell footprint rectangle for a 2x2 token', () => {
    const { container } = render(<TokenMarkersOverlay snapshot={SNAPSHOT} positions={positions} order={order} />);
    const goblinGroup = Array.from(container.querySelectorAll('.tmo-marker')).find((g) =>
      Array.from(g.querySelectorAll('.tmo-label')).some((n) => n.textContent === 'Goblin Warrior')
    );
    const footprint = goblinGroup.querySelector('.tmo-footprint');
    const points = footprint.getAttribute('points').split(' ').map((p) => p.split(',').map(Number));
    expect(points).toEqual([[50, 50], [70, 50], [70, 70], [50, 70]]);
  });
});
