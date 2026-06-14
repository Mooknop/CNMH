import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performEncounterSweep } from './partySweep';

// In-memory synced state keyed "id:type", with getState/sendUpdate shims.
let store;
const getState = (id, type) => store[`${id}:${type}`];
const sendUpdate = vi.fn((id, type, value) => { store[`${id}:${type}`] = value; });

const CHAR = { id: 'thorn', name: 'Thorn' };

beforeEach(() => {
  store = {};
  sendUpdate.mockClear();
  globalThis.localStorage = { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() };
});

describe('performEncounterSweep', () => {
  it('does nothing when there is no dirty combat state', () => {
    const { summary, changed } = performEncounterSweep({ character: CHAR, getState, sendUpdate });
    expect(changed).toBe(0);
    expect(summary).toBe('nothing to clear');
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('resets turn economy, stance, aura, shield, prey and sustains', () => {
    store['thorn:turnstate'] = { actionsSpent: 2, reactionSpent: true };
    store['thorn:shieldraise'] = { raised: true, ts: 1 };
    store['thorn:stance'] = { active: true, name: 'Mountain Stance' };
    store['thorn:aura'] = { active: true, ts: 1 };
    store['thorn:huntprey'] = { targetName: 'Ogre' };
    store['thorn:sustains'] = [{ id: 's1', spellName: 'Bless' }];

    const { summary, changed } = performEncounterSweep({ character: CHAR, getState, sendUpdate });

    expect(changed).toBe(6);
    expect(store['thorn:turnstate'].actionsSpent).toBe(0);
    expect(store['thorn:turnstate'].reactionSpent).toBe(false);
    expect(store['thorn:shieldraise']).toEqual({ raised: false, ts: 0 });
    expect(store['thorn:stance']).toEqual({ active: false, name: null, ts: 0 });
    expect(store['thorn:aura']).toEqual({ active: false, ts: 0 });
    expect(store['thorn:huntprey']).toBeNull();
    expect(store['thorn:sustains']).toEqual([]);
    expect(summary).toContain('turn economy');
    expect(summary).toContain('sustained spells');
  });

  it('expires encounter-scoped effects but keeps manual + clock immunities', () => {
    store['thorn:effects'] = [
      { id: 'e1', effectId: 'frightened', expireAt: { round: 2, boundary: 'round-end' } },
      { id: 'e2', effectId: 'mage-armor' }, // manual, no expiry
      { id: 'e3', effectId: 'treat-wounds-immunity', expireAtSecs: 999999 }, // clock-based
    ];

    performEncounterSweep({ character: CHAR, getState, sendUpdate });

    const kept = store['thorn:effects'].map((e) => e.id);
    expect(kept).toEqual(['e2', 'e3']);
    expect(sendUpdate).toHaveBeenCalledWith('thorn', 'effects', expect.any(Array));
  });

  it('leaves effects untouched when none are encounter-scoped', () => {
    store['thorn:effects'] = [{ id: 'e2', effectId: 'mage-armor' }];
    const { changed } = performEncounterSweep({ character: CHAR, getState, sendUpdate });
    expect(changed).toBe(0);
    expect(sendUpdate).not.toHaveBeenCalledWith('thorn', 'effects', expect.anything());
  });

  it('only resets the turn state when it is actually dirty', () => {
    store['thorn:turnstate'] = { actionsSpent: 0, attacksMade: 0, reactionSpent: false, hasStartedFirstTurn: false, actionsLog: [] };
    const { changed } = performEncounterSweep({ character: CHAR, getState, sendUpdate });
    expect(changed).toBe(0);
  });
});
