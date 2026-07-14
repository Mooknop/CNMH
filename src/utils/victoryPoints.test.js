import {
  vpForDegree,
  aggregateVp,
  charVp,
  entriesFor,
  normalizeChallenges,
  normalizeResults,
  skillLabel,
  CHALLENGE_MODES,
} from './victoryPoints';

describe('vpForDegree', () => {
  it('maps the four degrees to VP deltas', () => {
    expect(vpForDegree('criticalSuccess')).toBe(2);
    expect(vpForDegree('success')).toBe(1);
    expect(vpForDegree('failure')).toBe(0);
    expect(vpForDegree('criticalFailure')).toBe(-1);
  });

  it('returns 0 for unknown degrees', () => {
    expect(vpForDegree('banana')).toBe(0);
    expect(vpForDegree(undefined)).toBe(0);
  });
});

describe('normalizeChallenges', () => {
  it('returns an empty map for null/undefined', () => {
    expect(normalizeChallenges(null)).toEqual({});
    expect(normalizeChallenges(undefined)).toEqual({});
  });

  it('wraps the legacy single-challenge object and fills defaults', () => {
    const legacy = { id: 'vpc-1', name: 'Old Hunt', threshold: 3 };
    expect(normalizeChallenges(legacy)).toEqual({
      'vpc-1': {
        id: 'vpc-1',
        name: 'Old Hunt',
        threshold: 3,
        mode: CHALLENGE_MODES.ONCE,
        actionCost: 0,
      },
    });
  });

  it('passes a collection through, filling missing mode/actionCost', () => {
    const map = {
      'vpc-1': { id: 'vpc-1', name: 'A' },
      'vpc-2': { id: 'vpc-2', name: 'B', mode: CHALLENGE_MODES.PER_ROUND, actionCost: 1 },
    };
    const out = normalizeChallenges(map);
    expect(out['vpc-1'].mode).toBe(CHALLENGE_MODES.ONCE);
    expect(out['vpc-1'].actionCost).toBe(0);
    expect(out['vpc-2'].mode).toBe(CHALLENGE_MODES.PER_ROUND);
    expect(out['vpc-2'].actionCost).toBe(1);
  });

  it('drops non-object values', () => {
    expect(normalizeChallenges({ 'vpc-1': null, 'vpc-2': { id: 'vpc-2' } })).toEqual({
      'vpc-2': { id: 'vpc-2', mode: CHALLENGE_MODES.ONCE, actionCost: 0 },
    });
  });
});

describe('normalizeResults', () => {
  it('returns an empty map for null/undefined', () => {
    expect(normalizeResults(null)).toEqual({});
    expect(normalizeResults(undefined)).toEqual({});
  });

  it('wraps the legacy single-result object into a one-entry list', () => {
    const legacy = {
      challengeId: 'vpc-1', reqId: 'vpc-1-thorn',
      skill: 'arcana', d20: 14, total: 21, degree: 'success', vp: 1, at: 2,
    };
    expect(normalizeResults(legacy)).toEqual({
      'vpc-1': [{ round: 0, skill: 'arcana', d20: 14, total: 21, degree: 'success', vp: 1, at: 2 }],
    });
  });

  it('passes entry-list maps through and drops non-array values', () => {
    const map = { 'vpc-1': [{ vp: 1 }], 'vpc-2': 'junk' };
    expect(normalizeResults(map)).toEqual({ 'vpc-1': [{ vp: 1 }] });
  });
});

describe('entriesFor / charVp', () => {
  const value = {
    'vpc-1': [{ round: 1, vp: 2 }, { round: 2, vp: -1 }],
    'vpc-2': [{ round: 1, vp: 1 }],
  };

  it('returns the entries for one challenge, oldest first', () => {
    expect(entriesFor(value, 'vpc-1')).toHaveLength(2);
    expect(entriesFor(value, 'vpc-3')).toEqual([]);
    expect(entriesFor(null, 'vpc-1')).toEqual([]);
  });

  it('sums one character across rounds', () => {
    expect(charVp(value, 'vpc-1')).toBe(1);
    expect(charVp(value, 'vpc-2')).toBe(1);
    expect(charVp(null, 'vpc-1')).toBe(0);
  });

  it('reads the legacy single-result shape', () => {
    const legacy = { challengeId: 'vpc-1', vp: 2 };
    expect(charVp(legacy, 'vpc-1')).toBe(2);
    expect(charVp(legacy, 'vpc-2')).toBe(0);
  });
});

describe('aggregateVp', () => {
  const id = 'vpc-1';

  it('sums every character across every round for one challenge', () => {
    const values = [
      { [id]: [{ round: 1, vp: 2 }, { round: 2, vp: 1 }] },
      { [id]: [{ round: 1, vp: -1 }], 'vpc-other': [{ round: 1, vp: 2 }] },
    ];
    expect(aggregateVp(values, id)).toBe(2);
  });

  it('skips null values and legacy results from other challenges', () => {
    const values = [
      null,
      { challengeId: 'vpc-old', vp: 2 },
      { challengeId: id, vp: 1 },
    ];
    expect(aggregateVp(values, id)).toBe(1);
  });

  it('returns 0 for empty or missing input', () => {
    expect(aggregateVp([], id)).toBe(0);
    expect(aggregateVp(undefined, id)).toBe(0);
  });

  it('treats a missing vp field as 0', () => {
    expect(aggregateVp([{ [id]: [{ round: 1 }] }], id)).toBe(0);
  });
});

describe('skillLabel', () => {
  it('capitalizes skill keys', () => {
    expect(skillLabel('intimidation')).toBe('Intimidation');
    expect(skillLabel('arcana')).toBe('Arcana');
  });

  it('returns empty string for falsy input', () => {
    expect(skillLabel(undefined)).toBe('');
    expect(skillLabel('')).toBe('');
  });
});
