import {
  SCROLL_BY_RANK,
  WAND_BY_RANK,
  castRank,
  mechanicalHeightenRanks,
  resolveScroll,
  resolveWand,
  spellItemDisplayName,
  catalogItemName,
} from './spellItems';

const sleep = { name: 'Sleep', level: 1, traditions: ['arcane', 'occult'] };
const heal = { name: 'Heal', level: 1, traditions: ['divine', 'primal'] };

describe('rank tables', () => {
  test('scroll spans ranks 1–10', () => {
    expect(Object.keys(SCROLL_BY_RANK)).toHaveLength(10);
    expect(SCROLL_BY_RANK[1]).toEqual({ level: 1, price: 4 });
    expect(SCROLL_BY_RANK[10]).toEqual({ level: 19, price: 8000 });
  });

  test('wand spans ranks 1–9', () => {
    expect(Object.keys(WAND_BY_RANK)).toHaveLength(9);
    expect(WAND_BY_RANK[1]).toEqual({ level: 3, price: 60 });
    expect(WAND_BY_RANK[9]).toEqual({ level: 19, price: 40000 });
  });

  // Every published row, exactly per the GM Core tables (#812).
  test.each([
    [1, 1, 4], [2, 3, 12], [3, 5, 30], [4, 7, 70], [5, 9, 150],
    [6, 11, 300], [7, 13, 600], [8, 15, 1300], [9, 17, 3000], [10, 19, 8000],
  ])('scroll rank %i → level %i, %i gp', (rank, level, price) => {
    const out = resolveScroll({ name: 'X', level: rank });
    expect(out.level).toBe(level);
    expect(out.price).toBe(price);
  });

  test.each([
    [1, 3, 60], [2, 5, 160], [3, 7, 360], [4, 9, 700], [5, 11, 1400],
    [6, 13, 3000], [7, 15, 6500], [8, 17, 15000], [9, 19, 40000],
  ])('wand rank %i → level %i, %i gp', (rank, level, price) => {
    const out = resolveWand({ name: 'X', level: rank });
    expect(out.level).toBe(level);
    expect(out.price).toBe(price);
  });
});

describe('castRank', () => {
  test('uses the spell base level by default', () => {
    expect(castRank(sleep)).toBe(1);
  });

  test('block.rank overrides the base level', () => {
    expect(castRank(heal, { rank: 5 })).toBe(5);
  });

  test('non-positive / non-integer / missing → null', () => {
    expect(castRank({ level: 0 })).toBeNull();
    expect(castRank({ level: 2.5 })).toBeNull();
    expect(castRank({})).toBeNull();
    expect(castRank(null)).toBeNull();
  });
});

describe('resolveScroll', () => {
  test('base-rank scroll: name, traits, bulk, source', () => {
    const out = resolveScroll(sleep, { spellRef: 'sleep' });
    expect(out.name).toBe('Scroll of Sleep');
    expect(out.kind).toBe('scroll');
    expect(out.rank).toBe(1);
    expect(out.level).toBe(1);
    expect(out.price).toBe(4);
    expect(out.bulk).toBe('L');
    expect(out.traits).toEqual(['Consumable', 'Magical', 'Scroll']);
    expect(out.usage).toBe('held in 1 hand');
    expect(out.source).toBe('GM Core pg. 262');
    expect(out.activate).toMatch(/Cast a Spell/);
  });

  test('heightened cast rank keys price/level off the cast rank, not base', () => {
    const out = resolveScroll(heal, { spellRef: 'heal', rank: 5 });
    expect(out.name).toBe('Scroll of Heal (Rank 5)');
    expect(out.rank).toBe(5);
    expect(out.level).toBe(9);
    expect(out.price).toBe(150);
  });

  test('no rank suffix when cast rank equals base level', () => {
    expect(resolveScroll(heal, { rank: 1 }).name).toBe('Scroll of Heal');
  });

  test('returned traits array is a copy (mutation-safe)', () => {
    const out = resolveScroll(sleep);
    out.traits.push('Tampered');
    expect(resolveScroll(sleep).traits).toEqual(['Consumable', 'Magical', 'Scroll']);
  });
});

describe('resolveWand', () => {
  test('base-rank wand: name, traits, source, activate frequency', () => {
    const out = resolveWand(heal, { spellRef: 'heal' });
    expect(out.name).toBe('Wand of Heal');
    expect(out.kind).toBe('wand');
    expect(out.level).toBe(3);
    expect(out.price).toBe(60);
    expect(out.traits).toEqual(['Magical', 'Wand']);
    expect(out.source).toBe('GM Core pg. 282');
    expect(out.activate).toMatch(/once per day/);
  });

  test('heightened wand', () => {
    const out = resolveWand(heal, { rank: 4 });
    expect(out.name).toBe('Wand of Heal (Rank 4)');
    expect(out.level).toBe(9);
    expect(out.price).toBe(700);
  });
});

describe('fallbacks (no throw)', () => {
  test('out-of-range rank → named stub, null level/price', () => {
    const scroll = resolveScroll({ name: 'Wish', level: 11 });
    expect(scroll.name).toBe('Scroll of Wish');
    expect(scroll.level).toBeNull();
    expect(scroll.price).toBeNull();
    // rank 10 spell in a wand is out of the wand table's 1–9 range
    const wand = resolveWand({ name: 'Power Word Kill', level: 10 });
    expect(wand.level).toBeNull();
    expect(wand.price).toBeNull();
  });

  test('missing spell → unknown stub, null pricing', () => {
    const out = resolveScroll(undefined, { spellRef: 'gone' });
    expect(out.name).toBe('Scroll of (unknown spell)');
    expect(out.rank).toBeNull();
    expect(out.level).toBeNull();
    expect(out.price).toBeNull();
    expect(out.traits).toEqual(['Consumable', 'Magical', 'Scroll']);
  });
});

describe('mechanicalHeightenRanks (#937)', () => {
  test('no heightening → base rank only', () => {
    expect(mechanicalHeightenRanks({ level: 3 })).toEqual([3]);
    expect(mechanicalHeightenRanks({ level: 1, heightened: {} })).toEqual([1]);
  });

  test('interval "+1" → every rank from base to the spell max', () => {
    expect(mechanicalHeightenRanks({ level: 2, heightened: { '+1': 'more dice' } }))
      .toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('interval "+2" → every second rank (base+1 grants nothing)', () => {
    expect(mechanicalHeightenRanks({ level: 2, heightened: { '+2': 'more' } }))
      .toEqual([2, 4, 6, 8, 10]);
  });

  test('fixed "Nth" → exactly that rank, not the intermediate ones', () => {
    // base 1 with only a 3rd-rank upgrade: rank 2 crosses no threshold.
    expect(mechanicalHeightenRanks({ level: 1, heightened: { '3rd': 'upgrade' } }))
      .toEqual([1, 3]);
    expect(mechanicalHeightenRanks({ level: 1, heightened: { '3rd': 'a', '6th': 'b' } }))
      .toEqual([1, 3, 6]);
  });

  test('mixed fixed + interval → union, sorted, deduped', () => {
    expect(mechanicalHeightenRanks({ level: 3, heightened: { '+1': 'scale', '5th': 'jump' } }))
      .toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('ignores fixed keys at or below the base rank', () => {
    expect(mechanicalHeightenRanks({ level: 4, heightened: { '2nd': 'weird' } })).toEqual([4]);
  });

  test('caps at the spell max rank (10)', () => {
    expect(mechanicalHeightenRanks({ level: 9, heightened: { '+1': 'x' } })).toEqual([9, 10]);
    expect(mechanicalHeightenRanks({ level: 10, heightened: { '+1': 'x' } })).toEqual([10]);
  });

  test('non-positive / non-integer base → []', () => {
    expect(mechanicalHeightenRanks({ level: 0, heightened: { '+1': 'x' } })).toEqual([]);
    expect(mechanicalHeightenRanks({})).toEqual([]);
    expect(mechanicalHeightenRanks(undefined)).toEqual([]);
  });
});

describe('spellItemDisplayName', () => {
  test('derives "Scroll of X" for a nameless resolved scroll item', () => {
    expect(spellItemDisplayName({ scroll: { ...sleep } })).toBe('Scroll of Sleep');
  });

  test('derives "Wand of X" for a nameless resolved wand item', () => {
    expect(spellItemDisplayName({ wand: { ...heal } })).toBe('Wand of Heal');
  });

  test('suffixes the cast rank for a heightened nameless scroll', () => {
    expect(spellItemDisplayName({ scroll: { ...heal, rank: 5 } }))
      .toBe('Scroll of Heal (Rank 5)');
  });

  test('an authored/hydrated name wins (author overrides)', () => {
    expect(spellItemDisplayName({ name: 'Custom Scroll', scroll: { ...sleep } }))
      .toBe('Custom Scroll');
  });

  test('falls through to item.name for non-spell items', () => {
    expect(spellItemDisplayName({ name: 'Longsword' })).toBe('Longsword');
  });

  test('a dangling/unknown block falls through to item.name', () => {
    expect(spellItemDisplayName({ name: undefined, scroll: { name: '(unknown spell: gone)' } }))
      .toBeUndefined();
  });

  test('null-safe', () => {
    expect(spellItemDisplayName(null)).toBeUndefined();
    expect(spellItemDisplayName(undefined)).toBeUndefined();
  });
});

describe('catalogItemName', () => {
  const spells = [
    { id: 'sleep', name: 'Sleep', level: 1 },
    { id: 'heal', name: 'Heal', level: 1 },
  ];

  test('resolves a raw scroll entry by spellRef', () => {
    expect(catalogItemName({ id: 'scroll-of-sleep', scroll: { spellRef: 'sleep' } }, spells))
      .toBe('Scroll of Sleep');
  });

  test('resolves a raw wand entry by spellRef', () => {
    expect(catalogItemName({ id: 'wand-of-heal', wand: { spellRef: 'heal' } }, spells))
      .toBe('Wand of Heal');
  });

  test('suffixes a heightened cast rank', () => {
    expect(catalogItemName({ scroll: { spellRef: 'heal', rank: 5 } }, spells))
      .toBe('Scroll of Heal (Rank 5)');
  });

  test('an authored name wins over derivation', () => {
    expect(catalogItemName({ name: 'Longsword' }, spells)).toBe('Longsword');
  });

  test('a dangling spellRef still yields a stub name (never undefined)', () => {
    expect(catalogItemName({ scroll: { spellRef: 'gone' } }, spells))
      .toBe('Scroll of (unknown spell)');
  });

  test('null-safe and spells-optional', () => {
    expect(catalogItemName(null)).toBeUndefined();
    expect(catalogItemName({ name: 'Torch' })).toBe('Torch');
  });
});
