import {
  hardDcForLevel,
  auguryOutcome,
  isTellFortuneImmune,
  tellFortuneImmunityEntry,
  TELL_FORTUNE_ABILITY_KEY,
  TELL_FORTUNE_IMMUNITY_SECS,
} from './tellFortune';
import { ABILITY_IMMUNITY_EFFECT_ID } from './immunity';

describe('hardDcForLevel', () => {
  it('is the level-based DC plus the hard adjustment (+2)', () => {
    expect(hardDcForLevel(3)).toBe(20);  // level DC 18 + 2
    expect(hardDcForLevel(0)).toBe(16);  // level DC 14 + 2
    expect(hardDcForLevel(12)).toBe(32); // level DC 30 + 2
    expect(hardDcForLevel(25)).toBe(50); // level DC 48 + 2
  });

  it('clamps out-of-range levels to the table ends', () => {
    expect(hardDcForLevel(-4)).toBe(16); // level 0
    expect(hardDcForLevel(99)).toBe(50); // level 25
  });
});

describe('auguryOutcome', () => {
  it('gives a reliable reading on success and critical success', () => {
    expect(auguryOutcome('success')).toMatchObject({ reading: true, reliable: true });
    expect(auguryOutcome('criticalSuccess')).toMatchObject({ reading: true, reliable: true });
  });

  it('gives no reading on a failure', () => {
    expect(auguryOutcome('failure')).toMatchObject({ reading: false, reliable: false });
  });

  it('gives a misleading reading on a critical failure', () => {
    expect(auguryOutcome('criticalFailure')).toMatchObject({ reading: true, reliable: false });
  });

  it('treats an unknown degree as a failure', () => {
    expect(auguryOutcome('bogus')).toMatchObject({ reading: false });
  });
});

describe('Tell Fortune immunity', () => {
  const now = 1000;

  it('stamps a 1-week per-caster ability-immunity entry', () => {
    const entry = tellFortuneImmunityEntry('jade', now);
    expect(entry).toMatchObject({
      effectId: ABILITY_IMMUNITY_EFFECT_ID,
      abilityKey: TELL_FORTUNE_ABILITY_KEY,
      appliedBy: 'jade',
      source: 'Tell Fortune',
      expireAtSecs: now + TELL_FORTUNE_IMMUNITY_SECS,
    });
  });

  it('reports a target immune to the same caster within the week', () => {
    const effects = [tellFortuneImmunityEntry('jade', now)];
    expect(isTellFortuneImmune(effects, 'jade', now + 100)).toBe(true);
  });

  it('is per-caster — a different caster is not blocked', () => {
    const effects = [tellFortuneImmunityEntry('jade', now)];
    expect(isTellFortuneImmune(effects, 'ezren', now + 100)).toBe(false);
  });

  it('expires after a week', () => {
    const effects = [tellFortuneImmunityEntry('jade', now)];
    expect(isTellFortuneImmune(effects, 'jade', now + TELL_FORTUNE_IMMUNITY_SECS + 1)).toBe(false);
  });

  it('is false when the target has no Tell Fortune immunity', () => {
    expect(isTellFortuneImmune([], 'jade', now)).toBe(false);
  });
});
