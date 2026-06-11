import {
  ABILITY_IMMUNITY_EFFECT_ID,
  immunityConfigFor,
  makeImmunityEntry,
  hasAbilityImmunity,
} from './immunity';

const NOW = 1_000_000;

describe('immunityConfigFor', () => {
  it('normalises duration units to seconds', () => {
    expect(immunityConfigFor({ immunity: { duration: { value: 1, unit: 'hour' } } }))
      .toEqual({ durationSecs: 3600, scope: 'any' });
    expect(immunityConfigFor({ immunity: { duration: { value: 1, unit: 'day' } } }).durationSecs)
      .toBe(86400);
    expect(immunityConfigFor({ immunity: { duration: { value: 1, unit: 'week' } } }).durationSecs)
      .toBe(604800);
    expect(immunityConfigFor({ immunity: { duration: { value: 5, unit: 'minute' } } }).durationSecs)
      .toBe(300);
  });

  it('defaults scope to any and honours per-caster', () => {
    expect(immunityConfigFor({ immunity: { duration: { value: 1, unit: 'day' } } }).scope).toBe('any');
    expect(immunityConfigFor({ immunity: { duration: { value: 1, unit: 'day' }, scope: 'per-caster' } }).scope)
      .toBe('per-caster');
  });

  it('returns null for missing or malformed config', () => {
    expect(immunityConfigFor({})).toBeNull();
    expect(immunityConfigFor({ immunity: {} })).toBeNull();
    expect(immunityConfigFor({ immunity: { duration: { value: 0, unit: 'hour' } } })).toBeNull();
    expect(immunityConfigFor({ immunity: { duration: { value: 1, unit: 'fortnight' } } })).toBeNull();
  });
});

describe('makeImmunityEntry', () => {
  it('stamps the generic effect id with an absolute expiry', () => {
    const entry = makeImmunityEntry({
      abilityKey: 'guidance',
      abilityName: 'Guidance',
      casterId: 'char-p',
      nowSecs: NOW,
      durationSecs: 3600,
    });
    expect(entry).toMatchObject({
      effectId: ABILITY_IMMUNITY_EFFECT_ID,
      abilityKey: 'guidance',
      appliedBy: 'char-p',
      source: 'Guidance',
      expireAtSecs: NOW + 3600,
    });
    expect(entry.id).toBeTruthy();
  });
});

describe('hasAbilityImmunity', () => {
  const entry = (over = {}) => ({
    effectId: ABILITY_IMMUNITY_EFFECT_ID,
    abilityKey: 'guidance',
    appliedBy: 'char-p',
    expireAtSecs: NOW + 3600,
    ...over,
  });

  it('matches an active immunity for the same ability (scope any)', () => {
    expect(hasAbilityImmunity([entry()], { abilityKey: 'guidance', nowSecs: NOW })).toBe(true);
  });

  it('ignores a different ability', () => {
    expect(hasAbilityImmunity([entry()], { abilityKey: 'heal', nowSecs: NOW })).toBe(false);
  });

  it('per-caster scope requires the same caster', () => {
    const effects = [entry({ appliedBy: 'char-x' })];
    expect(hasAbilityImmunity(effects, { abilityKey: 'guidance', casterId: 'char-p', scope: 'per-caster', nowSecs: NOW })).toBe(false);
    expect(hasAbilityImmunity(effects, { abilityKey: 'guidance', casterId: 'char-x', scope: 'per-caster', nowSecs: NOW })).toBe(true);
    // 'any' scope ignores caster identity
    expect(hasAbilityImmunity(effects, { abilityKey: 'guidance', casterId: 'char-p', nowSecs: NOW })).toBe(true);
  });

  it('treats an already-expired immunity as gone', () => {
    expect(hasAbilityImmunity([entry({ expireAtSecs: NOW - 1 })], { abilityKey: 'guidance', nowSecs: NOW })).toBe(false);
  });

  it('ignores non-immunity effects', () => {
    expect(hasAbilityImmunity([{ effectId: 'heroism-1' }], { abilityKey: 'guidance', nowSecs: NOW })).toBe(false);
  });
});
