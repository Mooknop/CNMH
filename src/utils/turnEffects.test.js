import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sweepExpiredOnBoundaries, applyTurnStartFastHealing, effectFastHealing } from './turnEffects';

beforeEach(() => localStorage.clear());

const order = [
  { kind: 'pc', charId: 'Ashka', entryId: 'e-ashka', name: 'Ashka' },
  { kind: 'enemy', entryId: 'e-gob', name: 'Goblin' },
];
const turnEnd = { round: 1, entryId: 'e-ashka', boundary: 'turn-end' };

describe('sweepExpiredOnBoundaries', () => {
  it('drops expired effects, keeps live ones, writes survivors + logs by catalog name', () => {
    localStorage.setItem('cnmh_effects_Ashka', JSON.stringify([
      { id: 'a', effectId: 'inspire-courage', expireAt: turnEnd },
      { id: 'b', effectId: 'bless', expireAt: { round: 9, entryId: 'e-ashka', boundary: 'turn-end' } },
    ]));
    const sendUpdate = vi.fn();
    const appendLog = vi.fn();

    sweepExpiredOnBoundaries({
      order, boundaries: [turnEnd], sendUpdate, appendLog,
      effectCatalog: [{ id: 'inspire-courage', name: 'Inspire Courage' }],
    });

    const written = sendUpdate.mock.calls.find(([, k]) => k === 'effects');
    expect(written[0]).toBe('Ashka');
    expect(written[2].map((e) => e.id)).toEqual(['b']);
    expect(JSON.parse(localStorage.getItem('cnmh_effects_Ashka')).map((e) => e.id)).toEqual(['b']);
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({ text: 'Inspire Courage expired on Ashka' }));
  });

  it('no write/log when nothing is expired', () => {
    localStorage.setItem('cnmh_effects_Ashka', JSON.stringify([
      { id: 'b', effectId: 'bless', expireAt: { round: 9, entryId: 'e-ashka', boundary: 'turn-end' } },
    ]));
    const sendUpdate = vi.fn();
    const appendLog = vi.fn();
    sweepExpiredOnBoundaries({ order, boundaries: [turnEnd], sendUpdate, appendLog, effectCatalog: [] });
    expect(sendUpdate).not.toHaveBeenCalled();
    expect(appendLog).not.toHaveBeenCalled();
  });

  it('sweeps granted actions on the same boundaries', () => {
    localStorage.setItem('cnmh_grantedactions_Ashka', JSON.stringify([
      { id: 'g1', source: 'Reactive Strike', expireAt: turnEnd },
    ]));
    const sendUpdate = vi.fn();
    const appendLog = vi.fn();
    sweepExpiredOnBoundaries({ order, boundaries: [turnEnd], sendUpdate, appendLog, effectCatalog: [] });
    expect(sendUpdate).toHaveBeenCalledWith('Ashka', 'grantedactions', []);
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({ text: 'Reactive Strike expired for Ashka' }));
  });

  it('lapses the playing state on its expiry boundary (#935)', () => {
    localStorage.setItem('cnmh_playing_Ashka', JSON.stringify({
      active: true, expireAt: turnEnd, ts: 1,
    }));
    const sendUpdate = vi.fn();
    const appendLog = vi.fn();

    sweepExpiredOnBoundaries({ order, boundaries: [turnEnd], sendUpdate, appendLog, effectCatalog: [] });

    expect(sendUpdate).toHaveBeenCalledWith('Ashka', 'playing', expect.objectContaining({ active: false }));
    expect(JSON.parse(localStorage.getItem('cnmh_playing_Ashka'))).toMatchObject({ active: false });
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({ text: 'Ashka stops playing' }));
  });

  it('keeps a re-upped playing state whose expiry is not yet crossed (#935)', () => {
    localStorage.setItem('cnmh_playing_Ashka', JSON.stringify({
      active: true, expireAt: { round: 2, entryId: 'e-ashka', boundary: 'turn-end' }, ts: 1,
    }));
    const sendUpdate = vi.fn();

    sweepExpiredOnBoundaries({ order, boundaries: [turnEnd], sendUpdate, appendLog: vi.fn(), effectCatalog: [] });

    expect(sendUpdate).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('cnmh_playing_Ashka')).active).toBe(true);
  });

  it('skips enemy entries (PC keys only)', () => {
    const sendUpdate = vi.fn();
    sweepExpiredOnBoundaries({
      order: [{ kind: 'enemy', entryId: 'e', name: 'G' }],
      boundaries: [turnEnd], sendUpdate, appendLog: vi.fn(), effectCatalog: [],
    });
    expect(sendUpdate).not.toHaveBeenCalled();
  });
});

describe('applyTurnStartFastHealing', () => {
  const hymn = (targetId, fastHealing, targetMaxHp) =>
    ({ spellId: 'hymn-of-healing', heal: { targetId, fastHealing, targetMaxHp } });
  const order2 = [
    { kind: 'pc', charId: 'Izzy', entryId: 'e-izzy', name: 'Izzy' },
    { kind: 'pc', charId: 'Ashka', entryId: 'e-ashka', name: 'Ashka' },
  ];

  it('heals the start entry from the strongest Hymn aimed at them and logs', () => {
    const sustains = { Izzy: [hymn('Ashka', 4, 30)] };
    const hp = { Ashka: { current: 20, max: 30, temp: 0 } };
    const getState = vi.fn((id, key) => (key === 'sustains' ? (sustains[id] || []) : hp[id]));
    const sendUpdate = vi.fn();
    const appendLog = vi.fn();

    applyTurnStartFastHealing({ order: order2, startEntry: order2[1], getState, sendUpdate, appendLog });

    expect(sendUpdate).toHaveBeenCalledWith('Ashka', 'hp', expect.objectContaining({ current: 24 }));
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Fast healing 4') }));
  });

  it('no-op when the start entry is an enemy / non-pc', () => {
    const getState = vi.fn(() => []);
    const sendUpdate = vi.fn();
    applyTurnStartFastHealing({ order: order2, startEntry: { kind: 'enemy', name: 'Goblin' }, getState, sendUpdate, appendLog: vi.fn() });
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('no-op when no Hymn targets the start entry', () => {
    const getState = vi.fn((id, key) => (key === 'sustains' ? [hymn('Blu', 4, 30)] : { current: 20, max: 30 }));
    const sendUpdate = vi.fn();
    applyTurnStartFastHealing({ order: order2, startEntry: order2[1], getState, sendUpdate, appendLog: vi.fn() });
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  // #899 — generic fastHealing effect-modifier (e.g. Soothing Tonic).
  const catalog = [{ id: 'soothing-tonic-moderate', name: 'Soothing Tonic (Moderate)', modifiers: [{ stat: 'fastHealing', amount: 3 }] }];
  const state = (sustains, effects, hp) => (id, key) => {
    if (key === 'sustains') return sustains[id] || [];
    if (key === 'effects') return effects[id] || [];
    return hp[id];
  };

  it('heals from a generic fastHealing effect and logs the effect name (#899)', () => {
    const getState = vi.fn(state(
      {},
      { Ashka: [{ effectId: 'soothing-tonic-moderate' }] },
      { Ashka: { current: 20, max: 30, temp: 0 } },
    ));
    const sendUpdate = vi.fn();
    const appendLog = vi.fn();
    applyTurnStartFastHealing({ order: order2, startEntry: order2[1], getState, sendUpdate, appendLog, effectCatalog: catalog });
    expect(sendUpdate).toHaveBeenCalledWith('Ashka', 'hp', expect.objectContaining({ current: 23 }));
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Soothing Tonic (Moderate)') }));
  });

  it('takes the strongest source (fast healing does not stack)', () => {
    // Hymn 4 vs effect 3 → Hymn wins.
    const getState = vi.fn(state(
      { Izzy: [hymn('Ashka', 4, 30)] },
      { Ashka: [{ effectId: 'soothing-tonic-moderate' }] },
      { Ashka: { current: 20, max: 30, temp: 0 } },
    ));
    const sendUpdate = vi.fn();
    const appendLog = vi.fn();
    applyTurnStartFastHealing({ order: order2, startEntry: order2[1], getState, sendUpdate, appendLog, effectCatalog: catalog });
    expect(sendUpdate).toHaveBeenCalledWith('Ashka', 'hp', expect.objectContaining({ current: 24 }));
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Hymn of Healing') }));
  });

  it('caps healing at max HP', () => {
    const getState = vi.fn(state(
      {},
      { Ashka: [{ effectId: 'soothing-tonic-moderate' }] },
      { Ashka: { current: 29, max: 30, temp: 0 } },
    ));
    const sendUpdate = vi.fn();
    applyTurnStartFastHealing({ order: order2, startEntry: order2[1], getState, sendUpdate, appendLog: vi.fn(), effectCatalog: catalog });
    expect(sendUpdate).toHaveBeenCalledWith('Ashka', 'hp', expect.objectContaining({ current: 30 }));
  });
});

describe('effectFastHealing (#899)', () => {
  const catalog = [
    { id: 'st-lesser', name: 'Soothing Tonic (Lesser)', modifiers: [{ stat: 'fastHealing', amount: 1 }] },
    { id: 'st-major', name: 'Soothing Tonic (Major)', modifiers: [{ stat: 'fastHealing', amount: 10 }] },
    { id: 'heroism', name: 'Heroism', modifiers: [{ stat: 'attack', kind: 'status', amount: 1 }] },
  ];
  it('returns the strongest fastHealing modifier + its name', () => {
    expect(effectFastHealing([{ effectId: 'st-lesser' }, { effectId: 'st-major' }], catalog))
      .toEqual({ amount: 10, name: 'Soothing Tonic (Major)' });
  });
  it('is empty when no active effect carries fastHealing / bad input', () => {
    expect(effectFastHealing([{ effectId: 'heroism' }], catalog)).toEqual({ amount: 0, name: null });
    expect(effectFastHealing(null, catalog)).toEqual({ amount: 0, name: null });
    expect(effectFastHealing({ current: 5 }, catalog)).toEqual({ amount: 0, name: null });
  });
});
