import React from 'react';
import { render } from '@testing-library/react';
import ActionSymbol from './ActionSymbol';

// One component, two presentation APIs (#1316):
// - `cost`: bare .action-sym glyph span (the original ActionSymbol API)
// - `actionText`: wrapper + size class + optional tooltip (former ActionIcon)
// Both resolve glyph characters through getActionGlyph — the genuine
// Pathfinder2eActions font characters, never the Unicode diamond (#994).

describe('ActionSymbol — cost API', () => {
  it.each([
    [1, '1', '1 action'],
    [2, '2', '2 actions'],
    [3, '3', '3 actions'],
  ])('renders numeric cost %s as the "%s" font character', (cost, glyph, label) => {
    const { container } = render(<ActionSymbol cost={cost} />);
    const sym = container.querySelector('.action-sym');
    expect(sym).toHaveClass('pf2e-action-glyph');
    expect(sym).toHaveTextContent(glyph);
    expect(sym).toHaveAttribute('aria-label', label);
  });

  it('renders reaction as the gold "R" font character', () => {
    const { container } = render(<ActionSymbol cost="reaction" />);
    const sym = container.querySelector('.action-sym');
    expect(sym).toHaveClass('pf2e-action-glyph');
    expect(sym).toHaveClass('pf2e-action-glyph--gold');
    expect(sym).toHaveTextContent('R');
    expect(sym).toHaveAttribute('aria-label', 'reaction');
  });

  it('renders free as the gold "F" font character', () => {
    const { container } = render(<ActionSymbol cost="free" />);
    const sym = container.querySelector('.action-sym');
    expect(sym).toHaveClass('pf2e-action-glyph--gold');
    expect(sym).toHaveTextContent('F');
    expect(sym).toHaveAttribute('aria-label', 'free action');
  });

  it('parses catalog word-strings ("Two Actions") into the font character', () => {
    const { container } = render(<ActionSymbol cost="Two Actions" />);
    const sym = container.querySelector('.action-sym');
    expect(sym).toHaveClass('pf2e-action-glyph');
    expect(sym).toHaveTextContent('2');
  });

  it('falls back to text for costs with no glyph (durations, passive)', () => {
    const { container } = render(<ActionSymbol cost="1 minute" />);
    const sym = container.querySelector('.action-sym');
    expect(sym).toHaveClass('action-sym--text');
    expect(sym).not.toHaveClass('pf2e-action-glyph');
    expect(sym).toHaveTextContent('1 minute');
  });

  it('renders an em dash for a missing cost', () => {
    const { container } = render(<ActionSymbol />);
    expect(container.querySelector('.action-sym--text')).toHaveTextContent('—');
  });
});

describe('ActionSymbol — legacy actionText API (former ActionIcon)', () => {
  it('returns null when actionText is empty', () => {
    const { container } = render(<ActionSymbol actionText={null} />);
    expect(container.firstChild).toBeNull();
  });

  it.each([
    ['One Action', '1', '1 Action'],
    ['Two Actions', '2', '2 Actions'],
    ['Three Actions', '3', '3 Actions'],
  ])('renders "%s" as one glyph span carrying the "%s" font character', (text, glyph, label) => {
    const { container } = render(<ActionSymbol actionText={text} />);
    const icons = container.querySelectorAll('.action-icon');
    expect(icons).toHaveLength(1);
    expect(icons[0]).toHaveClass('pf2e-action-glyph');
    expect(icons[0].textContent).toBe(glyph);
    expect(container.querySelector('.action-icon-wrapper')).toHaveAttribute('aria-label', label);
  });

  it('renders the reaction wrapper with the gold "R" font character', () => {
    const { container } = render(<ActionSymbol actionText="Reaction" />);
    expect(container.querySelector('.reaction-icon')).toBeInTheDocument();
    const glyph = container.querySelector('.action-icon--reaction');
    expect(glyph).toHaveClass('pf2e-action-glyph');
    expect(glyph).toHaveTextContent('R');
  });

  it('renders the free-action wrapper with the gold "F" font character', () => {
    const { container } = render(<ActionSymbol actionText="Free Action" />);
    expect(container.querySelector('.free-action-icon')).toBeInTheDocument();
    const glyph = container.querySelector('.action-icon--free');
    expect(glyph).toHaveClass('pf2e-action-glyph');
    expect(glyph).toHaveTextContent('F');
  });

  it('renders a variable range ("One to Three Actions") as the connector glyph string', () => {
    const { container } = render(<ActionSymbol actionText="One to Three Actions" />);
    const wrapper = container.querySelector('.variable-action-count');
    expect(wrapper).toHaveAttribute('aria-label', '1–3 Actions');
    expect(wrapper.querySelector('.pf2e-action-glyph').textContent).toBe('1 – 3');
  });

  it('is case-insensitive', () => {
    const { container } = render(<ActionSymbol actionText="ONE ACTION" />);
    expect(container.querySelectorAll('.action-icon')).toHaveLength(1);
    expect(container.querySelector('.action-icon').textContent).toBe('1');
  });

  it.each(['small', 'medium', 'large'])('applies the %s size class', (size) => {
    const { container } = render(<ActionSymbol actionText="One Action" size={size} />);
    expect(container.querySelector(`.action-icon-${size}`)).toBeInTheDocument();
  });

  it('defaults to the medium size class', () => {
    const { container } = render(<ActionSymbol actionText="One Action" />);
    expect(container.querySelector('.action-icon-medium')).toBeInTheDocument();
  });

  it('shows the hover tooltip by default', () => {
    const { container } = render(<ActionSymbol actionText="Reaction" />);
    expect(container.querySelector('.action-tooltip')).toHaveTextContent('Reaction');
  });

  it('hides the tooltip when showTooltip is false', () => {
    const { container } = render(<ActionSymbol actionText="Reaction" showTooltip={false} />);
    expect(container.querySelector('.action-tooltip')).not.toBeInTheDocument();
  });

  it('falls back to plain text (display font, no glyph class) for unparseable text', () => {
    const { container } = render(<ActionSymbol actionText="Continuous" />);
    const wrapper = container.querySelector('.action-text');
    expect(wrapper).toBeInTheDocument();
    const icon = wrapper.querySelector('.action-icon');
    expect(icon).not.toHaveClass('pf2e-action-glyph');
    expect(icon).toHaveTextContent('Continuous');
  });
});
