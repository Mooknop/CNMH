import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sweepExpiredOnBoundaries, applyTurnStartFastHealing } from './turnEffects';

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
});
