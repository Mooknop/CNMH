// Effects-catalog integrity gate (#202/#263): the catalog migrated to the DO,
// seeded from defaultContent(). Verifies the bundled bootstrap (pf2eEffects.js
// until the snapshot carries an effect collection) survives normalization with
// the invariants the resolution layer (EffectUtils, GmEffects) relies on.
import { defaultContent } from '../utils/contentUtils';

const VALID_KINDS = ['status', 'circumstance', 'item'];

describe('bundled effect catalog', () => {
  const effects = defaultContent().effect;

  it('is non-empty with unique, named ids', () => {
    expect(effects.length).toBeGreaterThan(0);
    expect(new Set(effects.map((e) => e.id)).size).toBe(effects.length);
    expect(
      effects.every((e) => typeof e.id === 'string' && e.id && typeof e.name === 'string' && e.name)
    ).toBe(true);
  });

  it('every entry has a normalized modifiers array with known kinds and numeric amounts', () => {
    effects.forEach((e) => {
      expect(Array.isArray(e.modifiers)).toBe(true);
      e.modifiers.forEach((m) => {
        expect(typeof m.stat).toBe('string');
        expect(VALID_KINDS).toContain(m.kind);
        expect(typeof m.amount).toBe('number');
      });
    });
  });
});
