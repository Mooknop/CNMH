import { resolveTake10 } from './take10Resolve';

const OPENED = 500;

// Minimal getState backed by a plain map keyed `${id}:${key}`.
const makeGetState = (map) => (id, key) => map[`${id}:${key}`];

// Stateful getState/sendUpdate pair sharing one map — mirrors SessionContext,
// where sendUpdate writes the ref getState reads (so item-effect helpers that
// read-modify-write an overlay see their own prior writes).
const makeStore = (seed = {}) => {
  const map = { ...seed };
  return {
    getState: (id, key) => map[`${id}:${key}`],
    sendUpdate: vi.fn((id, key, value) => { map[`${id}:${key}`] = value; }),
    map,
  };
};

describe('resolveTake10', () => {
  it('restores all Focus Points when a player Refocused', () => {
    const map = {
      'a:take10alloc': { beatAt: OPENED, ready: true, activities: [{ id: 'refocus', label: 'Refocus', minutes: 10 }] },
      'a:focus': 2,
    };
    const sendUpdate = vi.fn();
    resolveTake10({
      characters: [{ id: 'a', name: 'Ari' }],
      openedAt: OPENED,
      getState: makeGetState(map),
      sendUpdate,
      appendLog: vi.fn(),
    });
    expect(sendUpdate).toHaveBeenCalledWith('a', 'focus', 0);
  });

  it('does not write focus when none was spent', () => {
    const map = {
      'a:take10alloc': { beatAt: OPENED, ready: true, activities: [{ id: 'refocus', label: 'Refocus', minutes: 10 }] },
      'a:focus': 0,
    };
    const sendUpdate = vi.fn();
    resolveTake10({
      characters: [{ id: 'a', name: 'Ari' }],
      openedAt: OPENED,
      getState: makeGetState(map),
      sendUpdate,
      appendLog: vi.fn(),
    });
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('does not touch focus for non-Refocus activities', () => {
    const map = {
      'a:take10alloc': { beatAt: OPENED, ready: true, activities: [{ id: 'treat-wounds', label: 'Treat Wounds', minutes: 10 }] },
      'a:focus': 3,
    };
    const sendUpdate = vi.fn();
    resolveTake10({
      characters: [{ id: 'a', name: 'Ari' }],
      openedAt: OPENED,
      getState: makeGetState(map),
      sendUpdate,
      appendLog: vi.fn(),
    });
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('logs a per-player summary with total minutes', () => {
    const map = {
      'a:take10alloc': {
        beatAt: OPENED, ready: true,
        activities: [
          { id: 'refocus', label: 'Refocus', minutes: 10 },
          { id: 'treat-wounds', label: 'Treat Wounds', minutes: 10 },
        ],
      },
      'a:focus': 1,
    };
    const appendLog = vi.fn();
    resolveTake10({
      characters: [{ id: 'a', name: 'Ari' }],
      openedAt: OPENED,
      getState: makeGetState(map),
      sendUpdate: vi.fn(),
      appendLog,
    });
    expect(appendLog).toHaveBeenCalledWith({
      type: 'activity',
      text: 'Ari (20 min): Refocus, Treat Wounds',
    });
  });

  it('skips a stale-beat allocation', () => {
    const map = {
      'a:take10alloc': { beatAt: 1, ready: true, activities: [{ id: 'refocus', label: 'Refocus', minutes: 10 }] },
      'a:focus': 2,
    };
    const sendUpdate = vi.fn();
    const appendLog = vi.fn();
    resolveTake10({
      characters: [{ id: 'a', name: 'Ari' }],
      openedAt: OPENED,
      getState: makeGetState(map),
      sendUpdate,
      appendLog,
    });
    expect(sendUpdate).not.toHaveBeenCalled();
    expect(appendLog).not.toHaveBeenCalled();
  });

  it('skips players with no allocation and resolves each member independently', () => {
    const map = {
      'a:take10alloc': { beatAt: OPENED, ready: true, activities: [{ id: 'refocus', label: 'Refocus', minutes: 10 }] },
      'a:focus': 2,
      // b has no alloc
    };
    const sendUpdate = vi.fn();
    const appendLog = vi.fn();
    resolveTake10({
      characters: [{ id: 'a', name: 'Ari' }, { id: 'b', name: 'Bex' }],
      openedAt: OPENED,
      getState: makeGetState(map),
      sendUpdate,
      appendLog,
    });
    expect(sendUpdate).toHaveBeenCalledTimes(1);
    expect(appendLog).toHaveBeenCalledTimes(1);
  });

  describe('item-targeted consumables (#566)', () => {
    const oilEntry = {
      id: 'oil:oil-weightless', kind: 'oil', label: 'Apply Oil of Weightlessness → Longsword',
      minutes: 10, itemUid: 'oil-weightless', itemName: 'Oil of Weightlessness',
      targetUid: 'longsword', targetName: 'Longsword',
      meta: { kind: 'effect', target: 'item', durationMinutes: 60, label: 'Weightless' },
    };
    const talismanEntry = {
      id: 'talisman:t1', kind: 'talisman', label: 'Affix Potency Crystal → Longsword',
      minutes: 10, talismanUid: 't1', itemName: 'Potency Crystal',
      hostUid: 'longsword', hostName: 'Longsword',
    };

    it('applies an oil: writes an item-effect, stamps expiry from block-end, marks it used', () => {
      const NOW = 10_000; // block-END game seconds, passed in by PlayModeControl
      const store = makeStore({
        'a:take10alloc': { beatAt: OPENED, ready: true, activities: [oilEntry] },
      });
      resolveTake10({
        characters: [{ id: 'a', name: 'Ari' }],
        openedAt: OPENED,
        nowSecs: NOW,
        getState: store.getState,
        sendUpdate: store.sendUpdate,
        appendLog: vi.fn(),
      });

      const fx = store.map['a:itemeffects'];
      expect(fx).toHaveLength(1);
      expect(fx[0]).toMatchObject({ itemId: 'longsword', source: 'Oil of Weightlessness' });
      // Duration runs from when the 10-min application finishes (block-end).
      expect(fx[0].expireAtSecs).toBe(NOW + 60 * 60);
      // Oil consumed.
      expect(store.map['a:consumed']).toEqual({ 'Oil of Weightlessness': 1 });
    });

    it('affixes a talisman to its host and does NOT consume it (consumed on activation)', () => {
      const store = makeStore({
        'a:take10alloc': { beatAt: OPENED, ready: true, activities: [talismanEntry] },
      });
      resolveTake10({
        characters: [{ id: 'a', name: 'Ari' }],
        openedAt: OPENED,
        getState: store.getState,
        sendUpdate: store.sendUpdate,
        appendLog: vi.fn(),
      });
      expect(store.map['a:affixed']).toEqual({ t1: 'longsword' });
      expect(store.map['a:consumed']).toBeUndefined();
    });

    it('resolves a mixed stack — oil + talisman + refocus — together', () => {
      const store = makeStore({
        'a:take10alloc': {
          beatAt: OPENED, ready: true,
          activities: [
            { id: 'refocus', label: 'Refocus', minutes: 10 },
            oilEntry,
            talismanEntry,
          ],
        },
        'a:focus': 2,
      });
      resolveTake10({
        characters: [{ id: 'a', name: 'Ari' }],
        openedAt: OPENED,
        nowSecs: 0,
        getState: store.getState,
        sendUpdate: store.sendUpdate,
        appendLog: vi.fn(),
      });
      expect(store.map['a:focus']).toBe(0);
      expect(store.map['a:itemeffects']).toHaveLength(1);
      expect(store.map['a:affixed']).toEqual({ t1: 'longsword' });
      expect(store.map['a:consumed']).toEqual({ 'Oil of Weightlessness': 1 });
    });
  });
});
