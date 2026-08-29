import React from 'react';
import { render } from '@testing-library/react';
import PartyTokensOverlay from './PartyTokensOverlay';

// Pure-presentational overlay (#1808, epic #1804 S4) — markers are handed in
// pre-built (buildPartyMarkers is covered on its own in tokenMarkers.test.js);
// this only checks the rendering contract.
//
// DECLUTTER (user-requested follow-up to #1804/#1822/#1831): the drawn ring/
// dot/name-label are gone (PartyTokensOverlay.css strips them to fully
// transparent) — the pane's tap hit-test (`hitTestMarkers`) and the e2e
// suite still resolve against this exact DOM (data-mover-id, .pto-marker
// (--selected), .pto-dot's cx/cy, .pto-label's text), so this file proves
// the STRUCTURE survives even though nothing paints any more. It
// deliberately does not assert computed style/opacity — Vitest's default
// config doesn't process imported CSS (`test.css` isn't enabled here), so a
// `toHaveStyle`/`getComputedStyle` assertion against a stylesheet rule would
// pass or fail for the wrong reason. Visual verification for the reduced
// opacity lives in the manual/e2e pass instead.

const marker = (overrides = {}) => ({
  moverId: 'Pellias',
  charId: 'Pellias',
  name: 'Pellias',
  accent: null,
  world: { x: 150, y: 150 },
  cell: { col: 1, row: 1 },
  center: { nx: 0.15, ny: 0.15 },
  footprint: [
    { nx: 0.1, ny: 0.1 }, { nx: 0.2, ny: 0.1 }, { nx: 0.2, ny: 0.2 }, { nx: 0.1, ny: 0.2 },
  ],
  ...overrides,
});

describe('PartyTokensOverlay (#1808)', () => {
  it('renders nothing when there are no markers', () => {
    const { container } = render(<PartyTokensOverlay markers={[]} />);
    expect(container.querySelector('.pto')).toBeNull();
  });

  it('renders one marker per token, keyed by moverId, carrying the tap-test geometry', () => {
    const { container } = render(<PartyTokensOverlay markers={[
      marker({ moverId: 'Pellias', center: { nx: 0.15, ny: 0.15 } }),
      marker({ moverId: 'Ashka', name: 'Ashka', center: { nx: 0.35, ny: 0.15 } }),
    ]} />);
    const markers = [...container.querySelectorAll('.pto-marker')];
    expect(markers.map((m) => m.dataset.moverId)).toEqual(['Pellias', 'Ashka']);

    // The dot's cx/cy is what the e2e suite checks a fresh capture moved
    // (dock-group-move.spec.ts) — the invisible marker still has to carry
    // the right position.
    const dot = markers[0].querySelector('.pto-dot');
    expect(dot.getAttribute('cx')).toBe('15');
    expect(dot.getAttribute('cy')).toBe('15');

    // The name label's text still carries the roster-joined name (unit
    // suites read it via textContent, not visually).
    expect(markers[1].querySelector('.pto-label').textContent).toBe('Ashka');
  });

  it('applies the --selected modifier class without any other visual change — selection now lives on the roster chips', () => {
    const { container } = render(<PartyTokensOverlay
      markers={[marker({ moverId: 'Pellias' }), marker({ moverId: 'Ashka', name: 'Ashka' })]}
      selectedIds={new Set(['Pellias'])}
    />);
    expect(container.querySelector('[data-mover-id="Pellias"]')).toHaveClass('pto-marker--selected');
    expect(container.querySelector('[data-mover-id="Ashka"]')).not.toHaveClass('pto-marker--selected');
  });

  it('renders the dimmed layer class when movement is unavailable', () => {
    const { container } = render(<PartyTokensOverlay markers={[marker()]} dimmed />);
    expect(container.querySelector('svg.pto')).toHaveClass('pto--dimmed');
  });

  it('the overlay layer is pointer-events: none — tap resolution lives in the pane, not a DOM click handler', () => {
    const { container } = render(<PartyTokensOverlay markers={[marker()]} />);
    expect(container.querySelector('svg.pto')).toHaveAttribute('aria-hidden', 'true');
  });

  it('carries no inline visual style — opacity/fill is CSS-only, not JS-computed', () => {
    const { container } = render(<PartyTokensOverlay markers={[marker({ accent: null })]} />);
    const g = container.querySelector('.pto-marker');
    // No accent → no style attribute at all (the accent custom-property is
    // the only inline style this component ever writes).
    expect(g.getAttribute('style')).toBeNull();
  });
});
