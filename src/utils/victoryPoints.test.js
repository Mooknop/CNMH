import { vpForDegree, aggregateVp, skillLabel } from './victoryPoints';

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

describe('aggregateVp', () => {
  const id = 'vpc-1';

  it('sums vp of results matching the challenge id', () => {
    const results = [
      { challengeId: id, vp: 2 },
      { challengeId: id, vp: 1 },
      { challengeId: id, vp: -1 },
    ];
    expect(aggregateVp(results, id)).toBe(2);
  });

  it('skips null entries and results from other challenges', () => {
    const results = [
      null,
      { challengeId: 'vpc-old', vp: 2 },
      { challengeId: id, vp: 1 },
    ];
    expect(aggregateVp(results, id)).toBe(1);
  });

  it('returns 0 for empty or missing input', () => {
    expect(aggregateVp([], id)).toBe(0);
    expect(aggregateVp(undefined, id)).toBe(0);
  });

  it('treats a missing vp field as 0', () => {
    expect(aggregateVp([{ challengeId: id }], id)).toBe(0);
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
