import { shieldCategory } from './shieldCategory';

describe('shieldCategory', () => {
  describe('numeric Bulk', () => {
    it('Bulk < 1 → light', () => {
      expect(shieldCategory(0.1)).toBe('light');
      expect(shieldCategory(0.5)).toBe('light');
    });
    it('negligible (0) Bulk → light', () => {
      expect(shieldCategory(0)).toBe('light');
    });
    it('Bulk exactly 1 → medium', () => {
      expect(shieldCategory(1)).toBe('medium');
    });
    it('Bulk > 1 → heavy', () => {
      expect(shieldCategory(2)).toBe('heavy');
      expect(shieldCategory(4)).toBe('heavy');
      expect(shieldCategory(5)).toBe('heavy');
    });
  });

  describe('string Bulk forms', () => {
    it("'L' (any case) → light", () => {
      expect(shieldCategory('L')).toBe('light');
      expect(shieldCategory('l')).toBe('light');
    });
    it("'—' / '-' / '' (negligible) → light", () => {
      expect(shieldCategory('—')).toBe('light');
      expect(shieldCategory('-')).toBe('light');
      expect(shieldCategory('')).toBe('light');
    });
    it('numeric strings map like numbers', () => {
      expect(shieldCategory('1')).toBe('medium');
      expect(shieldCategory('2')).toBe('heavy');
      expect(shieldCategory('0.5')).toBe('light');
    });
  });

  describe('unreadable Bulk', () => {
    it('returns null for nullish / garbage', () => {
      expect(shieldCategory(null)).toBeNull();
      expect(shieldCategory(undefined)).toBeNull();
      expect(shieldCategory('heavy')).toBeNull();
      expect(shieldCategory({})).toBeNull();
    });
  });
});
