import { describe, it, expect } from 'vitest';
import { GAME_GLYPHS, focusGlyphForClass } from './gameGlyphs';

describe('GAME_GLYPHS', () => {
  it('carries a non-empty path for every named glyph', () => {
    ['attachment', 'spellSlot', 'focusBard', 'focusSorcerer', 'focusMonk', 'focusChampion'].forEach((k) => {
      expect(typeof GAME_GLYPHS[k]).toBe('string');
      expect(GAME_GLYPHS[k].length).toBeGreaterThan(10);
    });
  });
});

describe('focusGlyphForClass', () => {
  it('maps Bard, Sorcerer, Monk and Champion to their glyphs (case-insensitive)', () => {
    expect(focusGlyphForClass('Bard')).toBe('focusBard');
    expect(focusGlyphForClass('bard')).toBe('focusBard');
    expect(focusGlyphForClass('Sorcerer')).toBe('focusSorcerer');
    expect(focusGlyphForClass('Monk')).toBe('focusMonk');
    expect(focusGlyphForClass('Champion')).toBe('focusChampion');
  });

  it('returns null for a class with no bespoke glyph or bad input', () => {
    expect(focusGlyphForClass('Cleric')).toBeNull();
    expect(focusGlyphForClass('')).toBeNull();
    expect(focusGlyphForClass(undefined)).toBeNull();
  });
});
