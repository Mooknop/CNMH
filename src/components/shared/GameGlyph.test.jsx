import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import GameGlyph from './GameGlyph';

describe('GameGlyph', () => {
  it('renders a currentColor path for a known glyph', () => {
    const { container } = render(<GameGlyph name="attachment" />);
    const svg = container.querySelector('svg.game-glyph');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    const path = svg.querySelector('path');
    expect(path).toHaveAttribute('fill', 'currentColor');
    expect(path.getAttribute('d')?.length).toBeGreaterThan(10);
  });

  it('is a labelled image when given a title', () => {
    const { container, getByTitle } = render(<GameGlyph name="spellSlot" title="Spell slot" />);
    const svg = container.querySelector('svg.game-glyph');
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).not.toHaveAttribute('aria-hidden');
    expect(getByTitle('Spell slot')).toBeInTheDocument();
  });

  it('merges a passed className', () => {
    const { container } = render(<GameGlyph name="focusBard" className="rank-slot-pip filled" />);
    expect(container.querySelector('svg')).toHaveClass('game-glyph', 'rank-slot-pip', 'filled');
  });

  it('renders nothing for an unknown glyph', () => {
    const { container } = render(<GameGlyph name="nope" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
