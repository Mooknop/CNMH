import { describe, it, expect } from 'vitest';
import { isOneRoundComposition, lingeringDurationOverride, lingeringResult } from './lingering';

const inspireCourage = {
  id: 'inspire-courage',
  traits: ['Bard', 'Cantrip', 'Composition', 'Emotion'],
  duration: '1 round',
};

describe('isOneRoundComposition', () => {
  it('is true for a 1-round composition', () => {
    expect(isOneRoundComposition(inspireCourage)).toBe(true);
  });

  it('is false without the Composition trait', () => {
    expect(isOneRoundComposition({ traits: ['Cantrip'], duration: '1 round' })).toBe(false);
  });

  it('is false when the duration is not 1 round', () => {
    expect(isOneRoundComposition({ traits: ['Composition'], duration: 'sustained' })).toBe(false);
  });

  it('is false for null / missing fields', () => {
    expect(isOneRoundComposition(null)).toBe(false);
    expect(isOneRoundComposition({})).toBe(false);
  });
});

describe('lingeringDurationOverride', () => {
  it('returns a rounds duration when an extension is pending and the spell is eligible', () => {
    expect(lingeringDurationOverride(inspireCourage, { rounds: 3 })).toEqual({ until: 'rounds', rounds: 3 });
    expect(lingeringDurationOverride(inspireCourage, { rounds: 4 })).toEqual({ until: 'rounds', rounds: 4 });
  });

  it('returns null without a pending extension', () => {
    expect(lingeringDurationOverride(inspireCourage, null)).toBeNull();
    expect(lingeringDurationOverride(inspireCourage, {})).toBeNull();
  });

  it('returns null for a non-composition spell even with a pending extension', () => {
    expect(lingeringDurationOverride({ traits: ['Cantrip'], duration: '1 round' }, { rounds: 3 })).toBeNull();
  });
});

describe('lingeringResult', () => {
  it('crit success → 4 rounds, focus spent', () => {
    expect(lingeringResult('criticalSuccess')).toEqual({ rounds: 4, spendFocus: true });
  });
  it('success → 3 rounds, focus spent', () => {
    expect(lingeringResult('success')).toEqual({ rounds: 3, spendFocus: true });
  });
  it('failure → no extension, focus kept', () => {
    expect(lingeringResult('failure')).toEqual({ rounds: null, spendFocus: false });
  });
  it('critical failure → no extension, focus kept', () => {
    expect(lingeringResult('criticalFailure')).toEqual({ rounds: null, spendFocus: false });
  });
});
