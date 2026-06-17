import { describe, it, expect, vi } from 'vitest';
import {
  HYMN_ID,
  isHymnOfHealing,
  hymnRank,
  hymnAmounts,
  grantTempHp,
  healHp,
  hymnFastHealingFor,
  applyHymnTempHp,
  applyHymnFastHealing,
} from './hymnHealing';

describe('isHymnOfHealing', () => {
  it('matches only the hymn-of-healing id', () => {
    expect(isHymnOfHealing({ id: HYMN_ID })).toBe(true);
    expect(isHymnOfHealing({ id: 'inspire-courage' })).toBe(false);
    expect(isHymnOfHealing(null)).toBe(false);
  });
});

describe('hymnRank', () => {
  it('auto-heightens to half level rounded up, floor 1', () => {
    expect(hymnRank(1)).toBe(1);
    expect(hymnRank(2)).toBe(1);
    expect(hymnRank(3)).toBe(2);
    expect(hymnRank(10)).toBe(5);
    expect(hymnRank(0)).toBe(1);
    expect(hymnRank(undefined)).toBe(1);
  });
});

describe('hymnAmounts', () => {
  it('scales +2 per rank (2 × rank) for fast healing and temp HP', () => {
    expect(hymnAmounts(1)).toEqual({ fastHealing: 2, tempHp: 2 });
    expect(hymnAmounts(2)).toEqual({ fastHealing: 4, tempHp: 4 });
    expect(hymnAmounts(5)).toEqual({ fastHealing: 10, tempHp: 10 });
  });
  it('floors rank at 1', () => {
    expect(hymnAmounts(0)).toEqual({ fastHealing: 2, tempHp: 2 });
  });
});

describe('grantTempHp', () => {
  it('takes the higher of existing and incoming (no stacking)', () => {
    expect(grantTempHp({ temp: 0 }, 4).temp).toBe(4);
    expect(grantTempHp({ temp: 6 }, 4).temp).toBe(6);
    expect(grantTempHp({ temp: 2 }, 4).temp).toBe(4);
  });
});

describe('healHp', () => {
  it('heals capped at max and reports the actual amount', () => {
    expect(healHp({ current: 20, max: 30 }, 4)).toEqual({ hp: { current: 24, max: 30 }, healed: 4 });
    expect(healHp({ current: 28, max: 30 }, 4)).toEqual({ hp: { current: 30, max: 30 }, healed: 2 });
    expect(healHp({ current: 30, max: 30 }, 4)).toEqual({ hp: { current: 30, max: 30 }, healed: 0 });
  });
});

describe('hymnFastHealingFor', () => {
  const hymn = (targetId, fh) => ({ spellId: HYMN_ID, heal: { targetId, fastHealing: fh } });
  it('returns the strongest Hymn fast healing aimed at the target', () => {
    const sustains = [hymn('Ashka', 2), hymn('Ashka', 6), hymn('Blu', 4)];
    expect(hymnFastHealingFor(sustains, 'Ashka')).toBe(6);
    expect(hymnFastHealingFor(sustains, 'Blu')).toBe(4);
  });
  it('ignores non-hymn sustains and other targets', () => {
    const sustains = [{ spellId: 'bless', heal: { targetId: 'Ashka', fastHealing: 9 } }, hymn('Blu', 4)];
    expect(hymnFastHealingFor(sustains, 'Ashka')).toBe(0);
    expect(hymnFastHealingFor([], 'Ashka')).toBe(0);
  });
});

describe('applyHymnTempHp', () => {
  it('writes take-higher temp HP and returns the new total', () => {
    const sendUpdate = vi.fn();
    const getState = vi.fn(() => ({ current: 20, max: 30, temp: 0 }));
    const temp = applyHymnTempHp({ getState, sendUpdate, target: { id: 'Ashka', maxHp: 30 }, amount: 4 });
    expect(temp).toBe(4);
    expect(sendUpdate).toHaveBeenCalledWith('Ashka', 'hp', expect.objectContaining({ temp: 4, current: 20 }));
  });
  it('seeds full HP when none is tracked yet', () => {
    const sendUpdate = vi.fn();
    const getState = vi.fn(() => undefined);
    applyHymnTempHp({ getState, sendUpdate, target: { id: 'Ashka', maxHp: 30 }, amount: 4 });
    expect(sendUpdate).toHaveBeenCalledWith('Ashka', 'hp', expect.objectContaining({ temp: 4, current: 30, max: 30 }));
  });
});

describe('applyHymnFastHealing', () => {
  it('heals and returns the amount restored', () => {
    const sendUpdate = vi.fn();
    const getState = vi.fn(() => ({ current: 20, max: 30, temp: 0 }));
    const healed = applyHymnFastHealing({ getState, sendUpdate, target: { id: 'Ashka', maxHp: 30 }, amount: 4 });
    expect(healed).toBe(4);
    expect(sendUpdate).toHaveBeenCalledWith('Ashka', 'hp', expect.objectContaining({ current: 24 }));
  });
  it('no-ops (no write) when already at full HP', () => {
    const sendUpdate = vi.fn();
    const getState = vi.fn(() => ({ current: 30, max: 30, temp: 0 }));
    const healed = applyHymnFastHealing({ getState, sendUpdate, target: { id: 'Ashka', maxHp: 30 }, amount: 4 });
    expect(healed).toBe(0);
    expect(sendUpdate).not.toHaveBeenCalled();
  });
});
