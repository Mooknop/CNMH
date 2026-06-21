import {
  resultsForCharPeriod,
  pendingRollSlots,
  pendingResults,
  markConfirmed,
  removeResult,
  buildEarnIncomeResult,
  buildCraftingResult,
  buildRetrainResult,
  buildResearchResult,
  hasAccumulateResult,
} from './earnIncomeResults';

// gameDate-like period markers (objects, to prove value-compare).
const P1 = { year: 4710, day: 1 };
const P2 = { year: 4710, day: 9 };

const result = (charId, startedAt, extra = {}) => ({
  charId, periodStartedAt: startedAt, ...extra,
});

describe('resultsForCharPeriod', () => {
  const results = [
    result('a', P1),
    result('a', P1),
    result('a', P2), // different period
    result('b', P1), // different char
  ];

  it('matches char + period by value, not reference', () => {
    const fresh = { year: 4710, day: 1 }; // new object, same value as P1
    expect(resultsForCharPeriod(results, 'a', fresh)).toHaveLength(2);
  });

  it('isolates other periods and other characters', () => {
    expect(resultsForCharPeriod(results, 'a', P2)).toHaveLength(1);
    expect(resultsForCharPeriod(results, 'b', P1)).toHaveLength(1);
  });

  it('tolerates an empty/missing queue', () => {
    expect(resultsForCharPeriod(undefined, 'a', P1)).toEqual([]);
  });
});

describe('pendingRollSlots', () => {
  it('is committed rolls minus already-submitted results', () => {
    const results = [result('a', P1), result('a', P1)];
    expect(pendingRollSlots({ results, charId: 'a', startedAt: P1, committedRolls: 3 })).toBe(1);
  });

  it('clamps to 0 when more results exist than committed rolls', () => {
    const results = [result('a', P1), result('a', P1)];
    expect(pendingRollSlots({ results, charId: 'a', startedAt: P1, committedRolls: 1 })).toBe(0);
  });

  it('equals committed rolls when nothing submitted yet', () => {
    expect(pendingRollSlots({ results: [], charId: 'a', startedAt: P1, committedRolls: 2 })).toBe(2);
  });
});

describe('pendingResults / markConfirmed / removeResult', () => {
  const queue = [
    { id: 'r1', status: 'pending' },
    { id: 'r2', status: 'confirmed' },
    { id: 'r3', status: 'pending' },
  ];

  it('pendingResults keeps only pending entries', () => {
    expect(pendingResults(queue).map((r) => r.id)).toEqual(['r1', 'r3']);
    expect(pendingResults(null)).toEqual([]);
  });

  it('markConfirmed flips just the matching entry', () => {
    const next = markConfirmed(queue, 'r1');
    expect(next.find((r) => r.id === 'r1').status).toBe('confirmed');
    expect(next.find((r) => r.id === 'r3').status).toBe('pending');
  });

  it('removeResult drops the matching entry so its roll slot frees up', () => {
    expect(removeResult(queue, 'r1').map((r) => r.id)).toEqual(['r2', 'r3']);
  });
});

describe('buildEarnIncomeResult', () => {
  it('stamps status pending, the period, an id and timestamp', () => {
    const entry = buildEarnIncomeResult({
      charId: 'a', charName: 'Ashka',
      taskLevel: 8, dc: 24,
      skillKey: 'crafting', skillLabel: 'Crafting', rank: 2,
      d20: 15, total: 27, degree: 'success', payoutCp: 300,
      startedAt: P1,
    });
    expect(entry).toMatchObject({
      charId: 'a', charName: 'Ashka',
      taskLevel: 8, dc: 24,
      skillKey: 'crafting', skillLabel: 'Crafting', rank: 2,
      d20: 15, total: 27, degree: 'success', payoutCp: 300,
      status: 'pending',
      periodStartedAt: P1,
    });
    expect(typeof entry.id).toBe('string');
    expect(typeof entry.ts).toBe('number');
  });

  it('defaults a missing period to null', () => {
    const entry = buildEarnIncomeResult({ charId: 'a' });
    expect(entry.periodStartedAt).toBeNull();
  });

  it('tags Earn Income entries with kind "earn-income"', () => {
    expect(buildEarnIncomeResult({ charId: 'a' }).kind).toBe('earn-income');
  });
});

describe('buildCraftingResult', () => {
  it('builds a pending crafting entry tagged kind "crafting"', () => {
    const entry = buildCraftingResult({
      charId: 'c2', charName: 'Blu',
      ref: 'shield', level: 5, itemName: 'Sturdy Shield',
      degree: 'success', paidCp: 3000,
    });
    expect(entry).toMatchObject({
      kind: 'crafting', charId: 'c2', charName: 'Blu',
      ref: 'shield', level: 5, itemName: 'Sturdy Shield',
      degree: 'success', paidCp: 3000, status: 'pending', periodStartedAt: null,
    });
    expect(typeof entry.id).toBe('string');
  });

  it('defaults a missing level to null', () => {
    expect(buildCraftingResult({ charId: 'c2', ref: 'torch' }).level).toBeNull();
  });
});

describe('buildRetrainResult / buildResearchResult', () => {
  it('builds a pending retrain entry with the structured swap', () => {
    const entry = buildRetrainResult({
      charId: 'c3', charName: 'Pellias',
      retrainType: 'Feat', fromLabel: 'Toughness', toLabel: 'Fleet',
      startedAt: P1,
    });
    expect(entry).toMatchObject({
      kind: 'retrain', charId: 'c3', charName: 'Pellias',
      retrainType: 'Feat', fromLabel: 'Toughness', toLabel: 'Fleet',
      status: 'pending', periodStartedAt: P1,
    });
  });

  it('builds a pending research entry with the topic', () => {
    const entry = buildResearchResult({ charId: 'c3', charName: 'Pellias', topic: 'The Sealed Vault', startedAt: P1 });
    expect(entry).toMatchObject({ kind: 'research', topic: 'The Sealed Vault', status: 'pending', periodStartedAt: P1 });
  });
});

describe('hasAccumulateResult', () => {
  const results = [
    { charId: 'a', periodStartedAt: P1, kind: 'retrain' },
    { charId: 'a', periodStartedAt: P2, kind: 'research' },
  ];

  it('is true when the PC submitted that kind in the active period', () => {
    expect(hasAccumulateResult(results, 'a', P1, 'retrain')).toBe(true);
  });

  it('is false for a different kind, period, or PC', () => {
    expect(hasAccumulateResult(results, 'a', P1, 'research')).toBe(false);
    expect(hasAccumulateResult(results, 'a', P2, 'retrain')).toBe(false);
    expect(hasAccumulateResult(results, 'b', P1, 'retrain')).toBe(false);
  });
});
