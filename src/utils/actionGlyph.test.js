import { describe, it, expect } from 'vitest';
import { getActionGlyph, getVariableActionGlyph, isGoldCost } from './actionGlyph';

describe('getActionGlyph', () => {
  it('maps numeric costs to pip characters', () => {
    expect(getActionGlyph(1)).toBe('1');
    expect(getActionGlyph(2)).toBe('2');
    expect(getActionGlyph(3)).toBe('3');
  });

  it('maps keyword costs', () => {
    expect(getActionGlyph('reaction')).toBe('R');
    expect(getActionGlyph('free')).toBe('F');
    expect(getActionGlyph(0)).toBe('F');
  });

  it('parses catalog word-strings', () => {
    expect(getActionGlyph('One Action')).toBe('1');
    expect(getActionGlyph('Two Actions')).toBe('2');
    expect(getActionGlyph('Three Actions')).toBe('3');
    expect(getActionGlyph('Reaction')).toBe('R');
    expect(getActionGlyph('Free Action')).toBe('F');
  });

  it('parses variable word-string ranges', () => {
    expect(getActionGlyph('One to Three Actions')).toBe('1 – 3');
    expect(getActionGlyph('1 to 3')).toBe('1 – 3');
  });

  it('returns empty for durations and unknown/empty costs', () => {
    expect(getActionGlyph('1 Minute')).toBe('');
    expect(getActionGlyph('10 Minutes')).toBe('');
    expect(getActionGlyph('passive')).toBe('');
    expect(getActionGlyph('')).toBe('');
    expect(getActionGlyph(null)).toBe('');
    expect(getActionGlyph(undefined)).toBe('');
  });
});

describe('getVariableActionGlyph', () => {
  it('joins two pip glyphs with a connector', () => {
    expect(getVariableActionGlyph(1, 3)).toBe('1 – 3');
    expect(getVariableActionGlyph(2, 3)).toBe('2 – 3');
  });

  it('returns empty when either bound has no glyph', () => {
    expect(getVariableActionGlyph(0, 3)).toBe('F – 3'); // 0 → free glyph, still a valid pair
    expect(getVariableActionGlyph(null, 3)).toBe('');
  });
});

describe('isGoldCost', () => {
  it('flags reaction and free costs (numeric, keyword, or word-string)', () => {
    expect(isGoldCost('reaction')).toBe(true);
    expect(isGoldCost('Reaction')).toBe(true);
    expect(isGoldCost('free')).toBe(true);
    expect(isGoldCost('Free Action')).toBe(true);
    expect(isGoldCost(0)).toBe(true);
  });

  it('does not flag standard action costs', () => {
    expect(isGoldCost(1)).toBe(false);
    expect(isGoldCost('Two Actions')).toBe(false);
    expect(isGoldCost('1 Minute')).toBe(false);
  });
});
