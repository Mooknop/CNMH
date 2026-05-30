import { computeSaveDegree } from './saveDegree';

// DC 18 used throughout unless noted.
const dc = 18;
const deg = (d20, mod = 0) => computeSaveDegree({ d20, total: d20 + mod, dc });

describe('computeSaveDegree', () => {
  it('meets DC → success', () => expect(deg(18)).toBe('success'));
  it('exceeds DC by 9 → success', () => expect(deg(dc + 9)).toBe('success'));
  it('exceeds DC by 10 → criticalSuccess', () => expect(deg(dc + 10)).toBe('criticalSuccess'));
  it('misses DC by 1 → failure', () => expect(deg(dc - 1)).toBe('failure'));
  it('misses DC by 10 → failure', () => expect(deg(dc - 10)).toBe('failure'));
  it('misses DC by 11 → criticalFailure', () => expect(deg(dc - 11)).toBe('criticalFailure'));

  it('natural 20: shifts one step up (failure → success)', () => {
    // total 19 = DC+1 → success normally; nat 20 → criticalSuccess
    expect(computeSaveDegree({ d20: 20, total: 19, dc })).toBe('criticalSuccess');
  });

  it('natural 20: crit success cannot go higher', () => {
    expect(computeSaveDegree({ d20: 20, total: 28, dc })).toBe('criticalSuccess');
  });

  it('natural 1: shifts one step down (success → failure)', () => {
    expect(computeSaveDegree({ d20: 1, total: 18, dc })).toBe('failure');
  });

  it('natural 1: criticalFailure cannot go lower', () => {
    expect(computeSaveDegree({ d20: 1, total: 1, dc })).toBe('criticalFailure');
  });

  it('nat 20 on a crit-failure roll → failure (two-step rescue)', () => {
    // total = 1, DC 18 → base criticalFailure; nat 20 shifts to failure
    expect(computeSaveDegree({ d20: 20, total: 1, dc })).toBe('failure');
  });
});
