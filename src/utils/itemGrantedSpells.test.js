import { describe, it, expect } from 'vitest';
import { itemGrantedSpells, hasGrantedSpells, buildItemGrantedSpell } from './itemGrantedSpells';

const guidance = {
  id: 'guidance', name: 'Guidance', level: 0, baseLevel: 1,
  traits: ['Cantrip', 'Concentrate'], traditions: ['divine', 'occult', 'primal'],
};

describe('itemGrantedSpells (#914)', () => {
  it('returns the normalized grant list', () => {
    const item = { grantedSpells: [{ ref: 'guidance', tradition: 'occult' }] };
    expect(itemGrantedSpells(item)).toEqual([{ ref: 'guidance', tradition: 'occult' }]);
    expect(hasGrantedSpells(item)).toBe(true);
  });

  it('is empty for an item with no grants or malformed entries', () => {
    expect(itemGrantedSpells({})).toEqual([]);
    expect(itemGrantedSpells({ grantedSpells: 'nope' })).toEqual([]);
    expect(itemGrantedSpells({ grantedSpells: [{}, { ref: 5 }, null] })).toEqual([]);
    expect(hasGrantedSpells({})).toBe(false);
  });
});

describe('buildItemGrantedSpell (#914)', () => {
  it('builds a cast-ready innate cantrip with the item tradition + host-namespaced id', () => {
    const cast = buildItemGrantedSpell({ ref: 'guidance', tradition: 'occult' }, guidance, 'uid-1');
    expect(cast).toMatchObject({
      name: 'Guidance', innate: true, traditions: ['occult'],
      id: 'uid-1:granted:guidance', level: 0,
    });
    expect(cast.frequency).toBeUndefined(); // at-will — never gates
  });

  it('casts at a fixed rank and carries frequency when the grant is gated', () => {
    const invisibility = { id: 'invisibility', name: 'Invisibility', level: 2, traditions: ['arcane'] };
    const cast = buildItemGrantedSpell(
      { ref: 'invisibility', tradition: 'arcane', rank: 4, frequency: 'once per day' },
      invisibility, 'uid-2',
    );
    expect(cast).toMatchObject({
      level: 4, frequency: 'once per day', innate: true, id: 'uid-2:granted:invisibility',
    });
  });

  it('falls back to the spell id when no host uid is given', () => {
    const cast = buildItemGrantedSpell({ ref: 'guidance' }, guidance);
    expect(cast.id).toBe('guidance');
  });

  it('returns null on an unresolved ref or missing grant', () => {
    expect(buildItemGrantedSpell({ ref: 'nope' }, null, 'uid')).toBeNull();
    expect(buildItemGrantedSpell(null, guidance, 'uid')).toBeNull();
  });
});
