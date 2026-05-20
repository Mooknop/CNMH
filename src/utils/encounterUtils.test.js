import {
  defaultEncounter,
  isPc,
  findEntry,
  findEntryIndex,
  sortByInitiative,
  nextTurnIndex,
  makePcEntry,
  makeEnemyEntry,
  everyEntryHasInitiative,
} from './encounterUtils';

describe('encounterUtils', () => {
  it('defaultEncounter is idle/empty', () => {
    const e = defaultEncounter();
    expect(e).toMatchObject({
      active: false,
      phase: 'idle',
      round: 0,
      currentTurnIndex: 0,
      order: [],
      log: [],
    });
  });

  it('isPc only matches kind: pc', () => {
    expect(isPc({ kind: 'pc' })).toBe(true);
    expect(isPc({ kind: 'enemy' })).toBe(false);
    expect(isPc(null)).toBe(false);
    expect(isPc(undefined)).toBe(false);
  });

  it('findEntry / findEntryIndex match by entryId', () => {
    const order = [
      { entryId: 'a', name: 'A' },
      { entryId: 'b', name: 'B' },
    ];
    expect(findEntry(order, 'b').name).toBe('B');
    expect(findEntry(order, 'x')).toBeNull();
    expect(findEntryIndex(order, 'b')).toBe(1);
    expect(findEntryIndex(order, 'x')).toBe(-1);
    expect(findEntry(undefined, 'b')).toBeNull();
  });

  it('sortByInitiative orders highest first, stable on ties', () => {
    const sorted = sortByInitiative([
      { entryId: 'a', initiative: 12 },
      { entryId: 'b', initiative: 20 },
      { entryId: 'c', initiative: 12 },
      { entryId: 'd', initiative: 5 },
    ]);
    expect(sorted.map((e) => e.entryId)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('sortByInitiative treats null/non-finite as lowest', () => {
    const sorted = sortByInitiative([
      { entryId: 'a', initiative: null },
      { entryId: 'b', initiative: 10 },
      { entryId: 'c', initiative: undefined },
    ]);
    expect(sorted.map((e) => e.entryId)).toEqual(['b', 'a', 'c']);
  });

  it('nextTurnIndex advances within the round', () => {
    expect(nextTurnIndex([{}, {}, {}], 0, 1)).toEqual({ currentTurnIndex: 1, round: 1 });
    expect(nextTurnIndex([{}, {}, {}], 1, 1)).toEqual({ currentTurnIndex: 2, round: 1 });
  });

  it('nextTurnIndex wraps + bumps the round', () => {
    expect(nextTurnIndex([{}, {}, {}], 2, 3)).toEqual({ currentTurnIndex: 0, round: 4 });
  });

  it('nextTurnIndex on empty order stays at 0', () => {
    expect(nextTurnIndex([], 0, 5)).toEqual({ currentTurnIndex: 0, round: 5 });
  });

  it('makePcEntry mirrors name + charId, leaves initiative null', () => {
    const e = makePcEntry({ id: 'Pellias', name: 'Pellias' });
    expect(e.kind).toBe('pc');
    expect(e.charId).toBe('Pellias');
    expect(e.name).toBe('Pellias');
    expect(e.initiative).toBeNull();
    expect(typeof e.entryId).toBe('string');
    expect(e.entryId.length).toBeGreaterThan(0);
  });

  it('makeEnemyEntry normalizes name + parses initiative', () => {
    expect(makeEnemyEntry('Goblin 1', '14')).toMatchObject({
      kind: 'enemy',
      name: 'Goblin 1',
      initiative: 14,
    });
    expect(makeEnemyEntry('  ', undefined)).toMatchObject({ name: 'Enemy', initiative: null });
    expect(makeEnemyEntry('Boss', '')).toMatchObject({ name: 'Boss', initiative: null });
  });

  it('everyEntryHasInitiative gates on non-empty AND all numeric', () => {
    expect(everyEntryHasInitiative([])).toBe(false);
    expect(everyEntryHasInitiative([{ initiative: 10 }])).toBe(true);
    expect(everyEntryHasInitiative([{ initiative: 10 }, { initiative: null }])).toBe(false);
    expect(everyEntryHasInitiative([{ initiative: 0 }])).toBe(true); // 0 is valid
  });
});
