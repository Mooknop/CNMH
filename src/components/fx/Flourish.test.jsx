import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import Flourish, { FLOURISHES } from './Flourish';
import { THASSILONIAN_RUNES } from '../../utils/thassilonianRunes';

const KNOWN_IDS = Object.keys(FLOURISHES);

afterEach(() => {
  delete window.matchMedia;
});

describe('Flourish registry', () => {
  it('ships the six signature flourishes plus a stamp per Thassilonian rune', () => {
    expect(KNOWN_IDS.sort()).toEqual(
      [
        'blood-swirl',
        'blood-swirl-loud',
        'composition-burst',
        'dragon-lightning',
        'rust-bloom',
        'shadow-tendrils',
        ...Object.keys(THASSILONIAN_RUNES).map((r) => `rune-${r}`),
      ].sort()
    );
  });

  it.each(KNOWN_IDS)('renders a decorative SVG overlay for %s', (id) => {
    const { container } = render(<Flourish id={id} />);
    const overlay = container.querySelector(`[data-flourish="${id}"]`);
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(overlay.querySelector('svg')).not.toBeNull();
  });

  it('an unknown id renders nothing (receivers fall back to the plain bloom)', () => {
    const { container } = render(<Flourish id="not-a-flourish" />);
    expect(container.firstChild).toBeNull();
  });

  it('a runestamp: id stamps the catalog rune glyph, keyed for the family tint (#1369 R7)', () => {
    const { container } = render(<Flourish id="runestamp:flaming-greater" />);
    const overlay = container.querySelector('[data-flourish="runestamp:flaming-greater"]');
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    const svg = overlay.querySelector('svg[data-runeicon="flaming"]');
    expect(svg).not.toBeNull();
    expect(svg.querySelector('.flx-rune-glow')).not.toBeNull();
    expect(svg.querySelector('.flx-rune-core')).not.toBeNull();
    // Greater tier = both cumulative layers, in the glow AND the core copy.
    expect(svg.querySelectorAll('.flx-rune-glow path')).toHaveLength(2);
    expect(svg.querySelectorAll('.flx-rune-core path')).toHaveLength(2);
  });

  it('a runestamp for an undrawn family renders nothing (plain bloom fallback)', () => {
    const { container } = render(<Flourish id="runestamp:unwritten" />);
    expect(container.firstChild).toBeNull();
  });

  it('a runestamp with a dangling id renders nothing', () => {
    const { container } = render(<Flourish id="runestamp:" />);
    expect(container.firstChild).toBeNull();
  });

  it('a missing id renders nothing', () => {
    const { container } = render(<Flourish />);
    expect(container.firstChild).toBeNull();
  });

  it('the loud blood swirl adds the shock ring on top of the swirl layers', () => {
    const { container } = render(<Flourish id="blood-swirl-loud" />);
    expect(container.querySelector('.flx-shockring')).not.toBeNull();
    const { container: quiet } = render(<Flourish id="blood-swirl" />);
    expect(quiet.querySelector('.flx-shockring')).toBeNull();
  });

  it('renders nothing under prefers-reduced-motion', () => {
    window.matchMedia = () => ({ matches: true });
    const { container } = render(<Flourish id="rust-bloom" />);
    expect(container.firstChild).toBeNull();
  });

  it('a rune stamp renders glow + core copies of the rune path, keyed for the sin tint', () => {
    const { container } = render(<Flourish id="rune-pride" />);
    const svg = container.querySelector('svg[data-rune="pride"]');
    expect(svg).not.toBeNull();
    const core = svg.querySelector('.flx-rune-core path');
    expect(core).toHaveAttribute('fill-rule', 'evenodd');
    expect(core.getAttribute('d')).toBe(THASSILONIAN_RUNES.pride.d);
    expect(svg.querySelector('.flx-rune-glow path')).not.toBeNull();
  });
});
