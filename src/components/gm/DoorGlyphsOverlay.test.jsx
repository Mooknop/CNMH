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

  // REDUCED OPACITY (user-requested follow-up to #1804/#1822/#1831): the
  // lighter-than-solid default and the secret-door ghosting are both driven
  // by the `--dgo-opacity` CSS custom property (DoorGlyphsOverlay.css), not
  // an inline style or a JS-computed value — so this only asserts the
  // structural/class hooks that property keys off, never a computed opacity
  // (Vitest's default config doesn't process imported CSS, so a
  // `toHaveStyle`/`getComputedStyle` assertion here would pass or fail for
  // the wrong reason regardless of what the stylesheet actually says).
  it('carries no inline opacity style — the reduced-opacity treatment is CSS-only, keyed off the marker classes', () => {
    const { container } = render(<DoorGlyphsOverlay doors={[
      doorAt(0.1, 0.1, { wallId: 'w-regular' }),
      doorAt(0.2, 0.2, { wallId: 'w-secret', secret: true }),
    ]} />);
    expect(container.querySelector('[data-wall-id="w-regular"]').getAttribute('style')).toBeNull();
    const secret = container.querySelector('[data-wall-id="w-secret"]');
    expect(secret.getAttribute('style')).toBeNull();
    // The secret marker keeps BOTH its state class and the secret hook — the
    // ghosting is layered on top of the state tint via that second class,
    // never replacing it (see the file-header comment above).
    expect(secret).toHaveClass('dgo-marker--closed');
    expect(secret).toHaveClass('dgo-marker--secret');
  });
});
