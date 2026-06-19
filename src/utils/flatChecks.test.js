import { describe, it, expect } from 'vitest';
import { requiredFlatChecks, flatCheckPasses } from './flatChecks';

const spell = { name: 'Electric Arc', traits: ['Cantrip', 'Concentrate', 'Electricity', 'Manipulate'] };
const verbalSpell = { name: 'Bless', traits: ['Concentrate'] }; // no Manipulate
const manipulateAction = { name: 'Administer a Potion', traits: ['Manipulate'] };
const plainAction = { name: 'Stride', traits: ['Move'] };

describe('requiredFlatChecks (#262)', () => {
  it('returns nothing for an unconditioned actor', () => {
    expect(requiredFlatChecks(spell, [], { isCast: true })).toEqual([]);
  });

  it('returns nothing for a null ability', () => {
    expect(requiredFlatChecks(null, [{ id: 'stupefied', value: 2 }], { isCast: true })).toEqual([]);
  });

  describe('stupefied', () => {
    it('requires a DC 5 + value check on a spell cast', () => {
      const checks = requiredFlatChecks(spell, [{ id: 'stupefied', value: 2 }], { isCast: true });
      expect(checks).toHaveLength(1);
      expect(checks[0]).toMatchObject({ id: 'stupefied', dc: 7, label: 'Stupefied 2', fail: 'the spell is lost' });
    });

    it('treats a missing value as 0 → DC 5', () => {
      const checks = requiredFlatChecks(verbalSpell, [{ id: 'stupefied' }], { isCast: true });
      expect(checks).toEqual([
        expect.objectContaining({ id: 'stupefied', dc: 5, label: 'Stupefied 0' }),
      ]);
    });

    it('does NOT apply when the action is not a spell cast', () => {
      expect(requiredFlatChecks(manipulateAction, [{ id: 'stupefied', value: 3 }], { isCast: false }))
        .not.toContainEqual(expect.objectContaining({ id: 'stupefied' }));
    });
  });

  describe('grabbed / restrained', () => {
    it('requires a DC 5 check on a Manipulate action while grabbed', () => {
      const checks = requiredFlatChecks(manipulateAction, [{ id: 'grabbed' }], { isCast: false });
      expect(checks).toEqual([
        expect.objectContaining({ id: 'grabbed', dc: 5, label: 'Grabbed', fail: 'the action is disrupted' }),
      ]);
    });

    it('applies for restrained too', () => {
      const checks = requiredFlatChecks(manipulateAction, [{ id: 'restrained' }], { isCast: false });
      expect(checks[0]).toMatchObject({ id: 'restrained', dc: 5, label: 'Restrained' });
    });

    it('does NOT apply to a non-Manipulate action', () => {
      expect(requiredFlatChecks(plainAction, [{ id: 'grabbed' }], { isCast: false })).toEqual([]);
    });

    it('applies to a Manipulate spell cast (e.g. Electric Arc)', () => {
      const checks = requiredFlatChecks(spell, [{ id: 'grabbed' }], { isCast: true });
      expect(checks).toContainEqual(expect.objectContaining({ id: 'grabbed', dc: 5 }));
    });
  });

  it('stacks stupefied + grabbed for a Manipulate spell cast', () => {
    const checks = requiredFlatChecks(spell, [{ id: 'stupefied', value: 1 }, { id: 'grabbed' }], { isCast: true });
    expect(checks.map((c) => c.id)).toEqual(['stupefied', 'grabbed']);
    expect(checks.map((c) => c.dc)).toEqual([6, 5]);
  });
});

describe('flatCheckPasses', () => {
  it('passes when the d20 meets or beats the DC', () => {
    expect(flatCheckPasses(5, 5)).toBe(true);
    expect(flatCheckPasses(20, 7)).toBe(true);
  });
  it('fails below the DC', () => {
    expect(flatCheckPasses(4, 5)).toBe(false);
  });
  it('is false for non-finite inputs', () => {
    expect(flatCheckPasses(null, 5)).toBe(false);
    expect(flatCheckPasses(10, NaN)).toBe(false);
  });
});
