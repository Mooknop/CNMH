import {
  toList,
  normalizeTraitName,
  findTraitDef,
  collectTraitReferences,
  orphanTraitReferences,
} from './traitRefs';

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

describe('collectTraitReferences', () => {
  const content = {
    items: [
      { id: 'elixir', name: 'Elixir', traits: ['Alchemical', 'Healing'] },
      // scroll with an inline spell carrying its own traits
      { id: 'wand-fire', name: 'Wand of Fire', traits: ['Wand'], wand: { traits: ['Fire', 'Manipulate'] } },
      // bare spellRef scroll contributes nothing
      { id: 'scroll-x', name: 'Scroll X', traits: ['Scroll'], scroll: { spellRef: 'sleep' } },
    ],
    spells: [{ id: 'breathe-fire', name: 'Breathe Fire', traits: ['Fire', 'concentrate'] }],
    monsters: [{ id: 'goblin', name: 'Goblin', traits: ['Humanoid'] }],
  };

  it('aggregates references by normalized name across items, nested spells, spells and monsters', () => {
    const map = collectTraitReferences(content);
    // 'Fire' appears on the wand spell and the Breathe Fire spell
    expect(map.get('fire').refs).toHaveLength(2);
    expect(map.get('fire').display).toBe('Fire');
    // case-insensitive merge: 'concentrate' folds under the same key
    expect(map.get('concentrate').refs).toHaveLength(1);
    expect(map.get('humanoid').refs[0]).toEqual({ collection: 'monster', id: 'goblin', name: 'Goblin' });
    expect(map.get('alchemical').refs[0].name).toBe('Elixir');
  });

  it('tolerates missing collections', () => {
    expect(collectTraitReferences(null).size).toBe(0);
    expect(collectTraitReferences({}).size).toBe(0);
  });
});

describe('orphanTraitReferences', () => {
  it('returns only names with no definition, sorted', () => {
    const map = collectTraitReferences({
      spells: [{ id: 's', name: 'S', traits: ['Fire', 'Frobnicate', 'Aardvark'] }],
    });
    const defs = [{ id: 'fire', name: 'Fire' }];
    const orphans = orphanTraitReferences(map, defs);
    expect(orphans.map((o) => o.display)).toEqual(['Aardvark', 'Frobnicate']);
  });
});
