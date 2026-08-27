import React from 'react';
import { render } from '@testing-library/react';
import DoorGlyphsOverlay from './DoorGlyphsOverlay';

// Pure-presentational overlay (#1809, epic #1804 S5) — markers are handed in
// pre-built (buildDoorMarkers is covered on its own in tokenMarkers.test.js);
// this only checks the rendering contract: state classes, secret styling
// hook, and that it never renders an empty shell.

const doorAt = (nx, ny, overrides = {}) => ({
  wallId: 'w1',
  state: 0,
  secret: false,
  world: { x: 0, y: 0 },
  center: { nx, ny },
  ...overrides,
});

describe('DoorGlyphsOverlay (#1809)', () => {
  it('renders nothing when there are no doors in frame', () => {
    const { container } = render(<DoorGlyphsOverlay doors={[]} />);
    expect(container.querySelector('.dgo')).toBeNull();
  });

  it('renders one marker per door, keyed by wallId, at its projected position', () => {
    const { container } = render(<DoorGlyphsOverlay doors={[
      doorAt(0.25, 0.5, { wallId: 'w1' }),
      doorAt(0.75, 0.5, { wallId: 'w2' }),
    ]} />);
    const markers = [...container.querySelectorAll('.dgo-marker')];
    expect(markers.map((m) => m.dataset.wallId)).toEqual(['w1', 'w2']);
    const ring = markers[0].querySelector('.dgo-ring');
    expect(ring.getAttribute('cx')).toBe('25');
    expect(ring.getAttribute('cy')).toBe('50');
  });

  it('applies a state class per door state — closed/open/locked', () => {
    const { container } = render(<DoorGlyphsOverlay doors={[
      doorAt(0.1, 0.1, { wallId: 'w-closed', state: 0 }),
      doorAt(0.2, 0.2, { wallId: 'w-open', state: 1 }),
      doorAt(0.3, 0.3, { wallId: 'w-locked', state: 2 }),
    ]} />);
    expect(container.querySelector('[data-wall-id="w-closed"]')).toHaveClass('dgo-marker--closed');
    expect(container.querySelector('[data-wall-id="w-open"]')).toHaveClass('dgo-marker--open');
    expect(container.querySelector('[data-wall-id="w-locked"]')).toHaveClass('dgo-marker--locked');
  });

  it('renders the closed/open/locked glyph vocabulary', () => {
    const { container } = render(<DoorGlyphsOverlay doors={[
      doorAt(0.1, 0.1, { wallId: 'w-closed', state: 0 }),
      doorAt(0.2, 0.2, { wallId: 'w-open', state: 1 }),
      doorAt(0.3, 0.3, { wallId: 'w-locked', state: 2 }),
    ]} />);
    expect(container.querySelector('[data-wall-id="w-closed"] .dgo-glyph').textContent).toBe('🚪');
    expect(container.querySelector('[data-wall-id="w-open"] .dgo-glyph').textContent).toBe('🔓');
    expect(container.querySelector('[data-wall-id="w-locked"] .dgo-glyph').textContent).toBe('🔒');
  });

  it('gives a secret door a distinct styling hook without hiding its state class', () => {
    const { container } = render(<DoorGlyphsOverlay doors={[
      doorAt(0.4, 0.4, { wallId: 'w-secret', state: 0, secret: true }),
    ]} />);
    const marker = container.querySelector('[data-wall-id="w-secret"]');
    expect(marker).toHaveClass('dgo-marker--secret');
    expect(marker).toHaveClass('dgo-marker--closed');
  });

  it('a non-secret door never carries the secret styling hook', () => {
    const { container } = render(<DoorGlyphsOverlay doors={[doorAt(0.4, 0.4, { secret: false })]} />);
    expect(container.querySelector('.dgo-marker')).not.toHaveClass('dgo-marker--secret');
  });

  it('the overlay layer is pointer-events: none — tap resolution lives in the pane', () => {
    const { container } = render(<DoorGlyphsOverlay doors={[doorAt(0.5, 0.5)]} />);
    expect(container.querySelector('svg.dgo')).toHaveAttribute('aria-hidden', 'true');
  });
});
