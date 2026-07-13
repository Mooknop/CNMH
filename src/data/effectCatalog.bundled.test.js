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

  it('Soothing Tonic tiers carry the fastHealing modifier (#899)', () => {
    const fh = (id) => (effects.find((e) => e.id === id)?.modifiers || []).find((m) => m.stat === 'fastHealing')?.amount;
    expect(fh('soothing-tonic-lesser')).toBe(1);
    expect(fh('soothing-tonic-moderate')).toBe(3);
    expect(fh('soothing-tonic-greater')).toBe(5);
    expect(fh('soothing-tonic-major')).toBe(10);
  });

  it('every entry has a normalized modifiers array with known kinds and numeric amounts', () => {
    effects.forEach((e) => {
      expect(Array.isArray(e.modifiers)).toBe(true);
      e.modifiers.forEach((m) => {
        expect(typeof m.stat).toBe('string');
        // `dexCap` (absolute Dex ceiling, #507), `resistance` (#900),
        // `weakness` (#918) and `immunity` (#919) are special non-bonus
        // modifiers — they carry no bonus `kind` and never net through
        // bestOfKind. Immunity is absolute, so it carries no `amount` either;
        // its only well-formedness gate is a truthy `vs`.
        const special = ['dexCap', 'resistance', 'weakness', 'immunity', 'fastHealing'];
        if (!special.includes(m.stat)) {
          expect(VALID_KINDS).toContain(m.kind);
        }
        if (m.stat === 'immunity') {
          expect(typeof m.vs === 'string' && m.vs.length > 0).toBe(true);
        } else {
          expect(typeof m.amount).toBe('number');
        }
      });
    });
  });
});
