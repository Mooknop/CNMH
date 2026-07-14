import {
  vpForDegree,
  aggregateVp,
  charVp,
  entriesFor,
  normalizeChallenges,
  normalizeResults,
  clampPool,
  poolFor,
  isFailing,
  isInfluence,
  roundFor,
  effectiveDc,
  highestTier,
  applyPoolDelta,
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
        adjust: 0,
        drainPerRound: 0,
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
      'vpc-2': { id: 'vpc-2', mode: CHALLENGE_MODES.ONCE, actionCost: 0, adjust: 0, drainPerRound: 0 },
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

describe('meter helpers (#1471)', () => {
  const meter = (over = {}) => ({
    id: 'vpc-1', name: 'Ritual Stability',
    startValue: 6, min: 0, max: 10, failAt: 0,
    adjust: 0, drainPerRound: 2,
    ...over,
  });

  describe('clampPool', () => {
    it('clamps to min and max when set', () => {
      expect(clampPool(meter(), 12)).toBe(10);
      expect(clampPool(meter(), -3)).toBe(0);
      expect(clampPool(meter(), 4)).toBe(4);
    });

    it('passes through when bounds are absent', () => {
      expect(clampPool({ id: 'x' }, -99)).toBe(-99);
    });
  });

  describe('poolFor', () => {
    const values = [{ 'vpc-1': [{ round: 1, vp: 1 }, { round: 2, vp: 2 }] }];

    it('sums startValue + check VP + adjust', () => {
      expect(poolFor(meter({ adjust: -4 }), values)).toBe(5);  // 6 + 3 - 4
    });

    it('clamps the result to the bounds', () => {
      expect(poolFor(meter({ adjust: -20 }), values)).toBe(0);
      expect(poolFor(meter({ adjust: +20 }), values)).toBe(10);
    });

    it('defaults startValue and adjust to 0 (plain T1 challenge)', () => {
      expect(poolFor({ id: 'vpc-1' }, values)).toBe(3);
    });
  });

  describe('isFailing', () => {
    it('fails when the pool has hit the failAt floor', () => {
      expect(isFailing(meter(), 0)).toBe(true);
      expect(isFailing(meter(), 1)).toBe(false);
    });

    it('never fails without a failAt', () => {
      expect(isFailing({ id: 'x' }, -5)).toBe(false);
    });
  });

  describe('applyPoolDelta', () => {
    it('moves the pool by delta and returns the new adjust', () => {
      // base = 6 + 1 = 7; pool 7 → 5
      const r = applyPoolDelta(meter(), 1, -2);
      expect(r).toEqual({ adjust: -2, pool: 5, applied: -2 });
    });

    it('clamps the target so drains cannot dig below min', () => {
      // pool 7, drain 10 → floor at 0; adjust lands the pool exactly there
      const r = applyPoolDelta(meter(), 1, -10);
      expect(r.pool).toBe(0);
      expect(r.applied).toBe(-7);
      expect(poolFor(meter({ adjust: r.adjust }), [{ 'vpc-1': [{ vp: 1 }] }])).toBe(0);
      // recovery is immediate: +1 from the floor moves the pool
      const up = applyPoolDelta(meter({ adjust: r.adjust }), 1, +1);
      expect(up.pool).toBe(1);
    });

    it('absorbs a pre-existing entry deficit at the next GM mutation', () => {
      // crit-fail spam dug vpSum to -8: unclamped base = 6 - 8 = -2, but the
      // pool reads 0 (min). A +1 nudge moves it to 1 — not to -2 + 1.
      const r = applyPoolDelta(meter(), -8, +1);
      expect(r.pool).toBe(1);
      expect(r.applied).toBe(1);
    });

    it('reports applied 0 when fully clamped', () => {
      const r = applyPoolDelta(meter({ adjust: 3 }), 1, +5);  // pool 10 (max) already
      expect(r.applied).toBe(0);
      expect(r.pool).toBe(10);
    });
  });
});

describe('influence helpers (#205)', () => {
  const influence = (over = {}) => ({
    id: 'inf-1', kind: 'influence', name: 'Nualia',
    dcModifier: 0, sceneRound: 1, roundsTotal: 10,
    tiers: [{ at: 3, note: 'seven dooms' }, { at: 6, note: 'sorrow' }, { at: 9, note: 'forgiveness' }],
    ...over,
  });

  it('isInfluence keys on kind', () => {
    expect(isInfluence(influence())).toBe(true);
    expect(isInfluence({ id: 'vpc-1' })).toBe(false);
    expect(isInfluence(null)).toBe(false);
  });

  describe('roundFor', () => {
    it('uses combat rounds while an encounter is active', () => {
      expect(roundFor(influence(), { active: true, round: 4 })).toBe(4);
    });

    it('falls back to the GM-advanced scene round otherwise', () => {
      expect(roundFor(influence({ sceneRound: 3 }), { active: false })).toBe(3);
      expect(roundFor(influence({ sceneRound: 3 }), null)).toBe(3);
      expect(roundFor({ id: 'vpc-1' }, null)).toBe(0);
    });
  });

  describe('effectiveDc', () => {
    it('applies the GM modifier', () => {
      expect(effectiveDc(influence({ dcModifier: 4 }), 19)).toBe(23);
      expect(effectiveDc(influence({ dcModifier: -4 }), 19)).toBe(15);
      expect(effectiveDc(influence(), 19)).toBe(19);
      expect(effectiveDc(null, 19)).toBe(19);
    });
  });

  describe('highestTier', () => {
    it('returns the highest reached tier', () => {
      expect(highestTier(influence(), 7)).toEqual({ at: 6, note: 'sorrow' });
      expect(highestTier(influence(), 9)).toEqual({ at: 9, note: 'forgiveness' });
    });

    it('returns null below the first tier or without tiers', () => {
      expect(highestTier(influence(), 2)).toBeNull();
      expect(highestTier({ id: 'x' }, 99)).toBeNull();
    });
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
