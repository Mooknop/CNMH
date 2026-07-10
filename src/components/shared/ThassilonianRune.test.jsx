import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ThassilonianRune from './ThassilonianRune';

describe('ThassilonianRune', () => {
  it('renders a currentColor evenodd path for a known rune', () => {
    const { container } = render(<ThassilonianRune name="wrath" />);
    const svg = container.querySelector('svg.thassilonian-rune');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('game-glyph');
    expect(svg).toHaveAttribute('viewBox', '0 0 100 100');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    const path = svg.querySelector('path');
    expect(path).toHaveAttribute('fill', 'currentColor');
    expect(path).toHaveAttribute('fill-rule', 'evenodd');
    expect(path.getAttribute('d')?.length).toBeGreaterThan(40);
  });

  it('resolves names case-insensitively', () => {
    const { container } = render(<ThassilonianRune name="Temperance" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('carries a lowercased data-rune hook and opts into tint via class', () => {
    const { container } = render(<ThassilonianRune name="Pride" tint />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('data-rune', 'pride');
    expect(svg).toHaveClass('rune-tint');
  });

  it('stays untinted by default', () => {
    const { container } = render(<ThassilonianRune name="pride" />);
    expect(container.querySelector('svg')).not.toHaveClass('rune-tint');
  });

  it('is a labelled image when given a title', () => {
    const { container, getByTitle } = render(<ThassilonianRune name="love" title="Rune of Love" />);
    const svg = container.querySelector('svg.thassilonian-rune');
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).not.toHaveAttribute('aria-hidden');
    expect(getByTitle('Rune of Love')).toBeInTheDocument();
  });

  it('merges a passed className', () => {
    const { container } = render(<ThassilonianRune name="greed" className="sin-pip" />);
    expect(container.querySelector('svg')).toHaveClass('game-glyph', 'thassilonian-rune', 'sin-pip');
  });

  it('renders nothing for an unknown rune', () => {
    const { container } = render(<ThassilonianRune name="avarice" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
