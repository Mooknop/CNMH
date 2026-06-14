import { toList, normalizeTraitName, findTraitDef } from './traitRefs';

describe('toList', () => {
  it('splits, trims and de-blanks a CSV string', () => {
    expect(toList('Fire, Cold ,, Electricity')).toEqual(['Fire', 'Cold', 'Electricity']);
  });

  it('tolerates non-string input', () => {
    expect(toList(undefined)).toEqual([]);
    expect(toList(null)).toEqual([]);
    expect(toList(0)).toEqual([]);
  });
});

describe('normalizeTraitName', () => {
  it('trims and lower-cases', () => {
    expect(normalizeTraitName('  Fire ')).toBe('fire');
    expect(normalizeTraitName(undefined)).toBe('');
  });
});

describe('findTraitDef', () => {
  const defs = [
    { id: 'fire', name: 'Fire' },
    { id: 'manipulate', name: 'Manipulate' },
  ];

  it('matches by name, case-insensitively', () => {
    expect(findTraitDef('fire', defs)).toEqual({ id: 'fire', name: 'Fire' });
    expect(findTraitDef('  MANIPULATE ', defs)).toEqual({ id: 'manipulate', name: 'Manipulate' });
  });

  it('returns undefined for an orphan name or empty input', () => {
    expect(findTraitDef('frobnicate', defs)).toBeUndefined();
    expect(findTraitDef('', defs)).toBeUndefined();
    expect(findTraitDef('fire', null)).toBeUndefined();
  });
});
