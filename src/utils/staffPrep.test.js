import { highestCastableRank, staffPrepValue, listStaves } from './staffPrep';

describe('highestCastableRank', () => {
  const caster = (slots) => ({ spellcasting: { spell_slots: slots } });

  it('returns the greatest rank with at least one slot', () => {
    expect(highestCastableRank(caster({ 1: 4, 2: 4 }))).toBe(2);
    expect(highestCastableRank(caster({ 1: 4, 2: 3, 3: 2 }))).toBe(3);
  });

  it('ignores cantrips and ranks with zero slots', () => {
    expect(highestCastableRank(caster({ cantrips: 5, 1: 2 }))).toBe(1);
    expect(highestCastableRank(caster({ 1: 2, 2: 0, 3: 0 }))).toBe(1);
  });

  it('returns 0 for a non-caster, empty slots, or missing data', () => {
    expect(highestCastableRank(caster({}))).toBe(0);
    expect(highestCastableRank(caster({ cantrips: 5 }))).toBe(0);
    expect(highestCastableRank({})).toBe(0);
    expect(highestCastableRank(null)).toBe(0);
  });
});

describe('staffPrepValue', () => {
  const caster = { spellcasting: { spell_slots: { 1: 4, 2: 4 } } };

  it('prepares a staff with charges equal to the highest castable rank', () => {
    expect(staffPrepValue(caster, 'staff-x')).toEqual({ staffId: 'staff-x', charges: 2 });
  });

  it('returns null when no staff is chosen', () => {
    expect(staffPrepValue(caster, '')).toBeNull();
    expect(staffPrepValue(caster, null)).toBeNull();
  });
});

describe('listStaves', () => {
  it('returns only staff items, mapped to { id, name } via the item uid', () => {
    const inv = [
      { uid: 'u1', name: 'Staff of Fire', staff: { spells: [] } },
      { id: 'sword', name: 'Longsword' },
      { id: 'lute', name: 'Entertainer\'s Lute', staff: { name: 'Lute' } },
      null,
    ];
    expect(listStaves(inv)).toEqual([
      { id: 'u1', name: 'Staff of Fire' },
      { id: 'lute', name: "Entertainer's Lute" },
    ]);
  });

  it('falls back to the staff block name and handles non-arrays', () => {
    expect(listStaves([{ id: 's', staff: { name: 'Bare Staff' } }])).toEqual([
      { id: 's', name: 'Bare Staff' },
    ]);
    expect(listStaves(null)).toEqual([]);
    expect(listStaves(undefined)).toEqual([]);
  });
});
