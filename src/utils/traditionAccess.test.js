import { describe, it, expect } from 'vitest';
import { canActivateSpellItem, getCasterTraditions, TRADITIONS } from './traditionAccess';

const caster = (tradition) => ({ spellcasting: { tradition } });
const spell = (...traditions) => ({ name: 'Test', traditions });

describe('getCasterTraditions', () => {
  it('reads the singular spellcasting.tradition, lowercased', () => {
    expect(getCasterTraditions(caster('Occult'))).toEqual(['occult']);
  });

  it('accepts a future spellcasting.traditions array', () => {
    expect(getCasterTraditions({ spellcasting: { traditions: ['Arcane', 'Primal'] } }))
      .toEqual(['arcane', 'primal']);
  });

  it('returns [] for non-casters / missing data', () => {
    expect(getCasterTraditions({})).toEqual([]);
    expect(getCasterTraditions(null)).toEqual([]);
    expect(getCasterTraditions({ spellcasting: {} })).toEqual([]);
  });

  it('exports the canonical tradition list', () => {
    expect(TRADITIONS).toEqual(['arcane', 'divine', 'occult', 'primal']);
  });
});

describe('canActivateSpellItem', () => {
  it('allows when the spell shares a tradition with the caster', () => {
    expect(canActivateSpellItem(caster('Arcane'), spell('arcane', 'occult'))).toBe(true);
  });

  it('blocks when no tradition overlaps', () => {
    expect(canActivateSpellItem(caster('Divine'), spell('arcane', 'occult'))).toBe(false);
  });

  it('is case-insensitive on both sides', () => {
    expect(canActivateSpellItem(caster('OCCULT'), spell('Occult'))).toBe(true);
  });

  it('blocks a non-caster (no tradition) from a tradition-bearing spell', () => {
    expect(canActivateSpellItem({}, spell('arcane'))).toBe(false);
    expect(canActivateSpellItem(null, spell('arcane'))).toBe(false);
  });

  it('allows when the spell has no tradition data (graceful fallback)', () => {
    expect(canActivateSpellItem(caster('Arcane'), spell())).toBe(true);
    expect(canActivateSpellItem(caster('Arcane'), { name: 'NoField' })).toBe(true);
    // even a non-caster gets a traditionless spell (it isn't gated)
    expect(canActivateSpellItem({}, spell())).toBe(true);
  });

  it('accepts an itemType option without changing the result (S5 seam)', () => {
    expect(canActivateSpellItem(caster('Divine'), spell('divine'), { itemType: 'scroll' })).toBe(true);
    expect(canActivateSpellItem(caster('Divine'), spell('arcane'), { itemType: 'scroll' })).toBe(false);
  });
});
