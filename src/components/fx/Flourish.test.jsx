import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import Flourish, { FLOURISHES } from './Flourish';

const KNOWN_IDS = Object.keys(FLOURISHES);

afterEach(() => {
  delete window.matchMedia;
});

describe('Flourish registry', () => {
  it('ships all six signature flourishes', () => {
    expect(KNOWN_IDS.sort()).toEqual(
      [
        'blood-swirl',
        'blood-swirl-loud',
        'composition-burst',
        'dragon-lightning',
        'rust-bloom',
        'shadow-tendrils',
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
});
