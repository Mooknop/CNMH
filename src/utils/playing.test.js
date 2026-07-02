import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markPlayingOnCast, isCompositionCast, PLAYING_IDLE } from './playing';

beforeEach(() => localStorage.clear());

const izzy = { id: 'Izzy', name: 'Izzy' };
const encounter = {
  phase: 'in-progress',
  round: 2,
  currentTurnIndex: 0,
  order: [{ kind: 'pc', charId: 'Izzy', entryId: 'e-izzy', name: 'Izzy' }],
};
const inspire = { name: 'Inspire Courage', traits: ['Bard', 'Cantrip', 'Composition', 'Emotion'] };

const cast = (over = {}) => {
  const sendUpdate = vi.fn();
  const appendLog = vi.fn();
  const wrote = markPlayingOnCast({
    ability: inspire,
    caster: izzy,
    casterEntryId: 'e-izzy',
    encounter,
    sendUpdate,
    appendLog,
    ...over,
  });
  return { wrote, sendUpdate, appendLog };
};

describe('isCompositionCast', () => {
  it('keys on the Composition trait, not a spell list', () => {
    expect(isCompositionCast(inspire)).toBe(true);
    expect(isCompositionCast({ name: 'Fireball', traits: ['Evocation', 'Fire'] })).toBe(false);
    expect(isCompositionCast({ name: 'Strike' })).toBe(false);
    expect(isCompositionCast(null)).toBe(false);
  });
});

describe('markPlayingOnCast', () => {
  it('marks the caster playing through the end of their next turn', () => {
    const { wrote, sendUpdate } = cast();
    expect(wrote).toBe(true);

    const expected = expect.objectContaining({
      active: true,
      expireAt: { round: 3, entryId: 'e-izzy', boundary: 'turn-end' },
    });
    expect(sendUpdate).toHaveBeenCalledWith('Izzy', 'playing', expected);
    expect(JSON.parse(localStorage.getItem('cnmh_playing_Izzy'))).toMatchObject({
      active: true,
      expireAt: { round: 3, entryId: 'e-izzy', boundary: 'turn-end' },
    });
  });

  it('logs the idle→playing transition', () => {
    const { appendLog } = cast();
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({
      charId: 'Izzy',
      text: 'Izzy is playing (Inspire Courage)',
    }));
  });

  it('re-up overwrites the expiry a round further out without a second log', () => {
    cast();
    const { sendUpdate, appendLog } = cast({ encounter: { ...encounter, round: 3 } });

    expect(sendUpdate).toHaveBeenCalledWith('Izzy', 'playing', expect.objectContaining({
      expireAt: { round: 4, entryId: 'e-izzy', boundary: 'turn-end' },
    }));
    expect(appendLog).not.toHaveBeenCalled();
  });

  it('re-logs when the state had lapsed back to idle', () => {
    cast();
    localStorage.setItem('cnmh_playing_Izzy', JSON.stringify(PLAYING_IDLE));
    const { appendLog } = cast();
    expect(appendLog).toHaveBeenCalled();
  });

  it('no-op for a non-Composition cast', () => {
    const { wrote, sendUpdate } = cast({ ability: { name: 'Heal', traits: ['Healing'] } });
    expect(wrote).toBe(false);
    expect(sendUpdate).not.toHaveBeenCalled();
    expect(localStorage.getItem('cnmh_playing_Izzy')).toBeNull();
  });

  it('no-op outside an in-progress encounter or without a caster entry', () => {
    expect(cast({ encounter: null }).wrote).toBe(false);
    expect(cast({ encounter: { ...encounter, phase: 'setup' } }).wrote).toBe(false);
    expect(cast({ casterEntryId: null }).wrote).toBe(false);
    expect(localStorage.getItem('cnmh_playing_Izzy')).toBeNull();
  });
});
