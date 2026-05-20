import { renderHook, act } from '@testing-library/react';

// useSyncedState → plain useState. Each renderHook gets its own store, which is
// what we want for unit tests of the hook's reducer-like API. Cross-client
// integration is covered by useSyncedState's own tests + the shared-store
// pattern used by HandsPanel.test.js, not here.
jest.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) =>
      ReactLib.useState(typeof init === 'function' ? init() : init),
  };
});

// Session context — expiry sweep uses sendUpdate; not exercised in these unit tests.
jest.mock('../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: jest.fn(), getState: jest.fn(() => []) }),
}));

// pf2eEffects — sweep looks up effect names; no effects in these tests.
jest.mock('../data/pf2eEffects', () => {
  const list = [];
  return { __esModule: true, default: list, getEffect: () => null };
});

// expiry utilities — keep the sweep a no-op in unit tests so they only
// test the encounter state machine, not side-effect wiring.
jest.mock('../utils/expiry', () => ({
  boundariesCrossedBy: jest.fn(() => []),
  isExpired: jest.fn(() => false),
  resolveExpireAt: jest.fn(() => null),
  expiryLabel: jest.fn(() => null),
}));

import { useEncounter } from './useEncounter';

const setup = () => renderHook(() => useEncounter());

const pellias = { id: 'Pellias', name: 'Pellias' };
const ashka = { id: 'AshkaBGosh', name: 'Ashka' };
const izzy = { id: 'IzzyUncut', name: 'Izzy' };

describe('useEncounter', () => {
  it('default state is idle/empty', () => {
    const { result } = setup();
    expect(result.current.encounter).toMatchObject({
      active: false,
      phase: 'idle',
      round: 0,
      order: [],
      log: [],
    });
  });

  it('startEncounter seeds pc entries + setup phase + opening log line', () => {
    const { result } = setup();
    act(() => result.current.startEncounter([pellias, ashka]));
    const e = result.current.encounter;
    expect(e.active).toBe(true);
    expect(e.phase).toBe('setup');
    expect(e.order).toHaveLength(2);
    expect(e.order[0]).toMatchObject({ kind: 'pc', charId: 'Pellias', initiative: null });
    expect(e.order[1]).toMatchObject({ kind: 'pc', charId: 'AshkaBGosh', initiative: null });
    expect(e.log).toHaveLength(1);
    expect(e.log[0].text).toBe('Encounter started');
  });

  it('setInitiative writes a numeric value by entryId; setInitiative("") clears to null', () => {
    const { result } = setup();
    act(() => result.current.startEncounter([pellias]));
    const id = result.current.encounter.order[0].entryId;
    act(() => result.current.setInitiative(id, '17'));
    expect(result.current.encounter.order[0].initiative).toBe(17);
    act(() => result.current.setInitiative(id, ''));
    expect(result.current.encounter.order[0].initiative).toBeNull();
  });

  it('addEnemy appends an enemy entry; removeEntry removes by entryId', () => {
    const { result } = setup();
    act(() => result.current.startEncounter([pellias]));
    act(() => result.current.addEnemy('Goblin 1', 14));
    expect(result.current.encounter.order).toHaveLength(2);
    expect(result.current.encounter.order[1]).toMatchObject({
      kind: 'enemy',
      name: 'Goblin 1',
      initiative: 14,
    });
    const goblinId = result.current.encounter.order[1].entryId;
    act(() => result.current.removeEntry(goblinId));
    expect(result.current.encounter.order).toHaveLength(1);
  });

  it('beginRound1 is gated until every entry has initiative', () => {
    const { result } = setup();
    act(() => result.current.startEncounter([pellias, ashka]));
    act(() => result.current.beginRound1());
    expect(result.current.encounter.phase).toBe('setup'); // gated — not all numeric

    const [a, b] = result.current.encounter.order;
    act(() => result.current.setInitiative(a.entryId, 12));
    act(() => result.current.setInitiative(b.entryId, 20));
    act(() => result.current.beginRound1());
    const e = result.current.encounter;
    expect(e.phase).toBe('in-progress');
    expect(e.round).toBe(1);
    expect(e.currentTurnIndex).toBe(0);
    expect(e.order.map((x) => x.charId)).toEqual(['AshkaBGosh', 'Pellias']); // 20 → 12
    // log: started + Round 1 + first actor's turn
    expect(e.log.map((l) => l.text)).toEqual([
      'Encounter started',
      'Round 1 begins',
      "Ashka's turn",
    ]);
  });

  it('beginRound1 sorts mixed pc+enemy', () => {
    const { result } = setup();
    act(() => result.current.startEncounter([pellias, ashka]));
    act(() => result.current.addEnemy('Goblin', 18));
    const [p, a] = result.current.encounter.order;
    act(() => result.current.setInitiative(p.entryId, 12));
    act(() => result.current.setInitiative(a.entryId, 5));
    act(() => result.current.beginRound1());
    expect(result.current.encounter.order.map((e) => e.name)).toEqual([
      'Goblin', // 18
      'Pellias', // 12
      'Ashka', // 5
    ]);
  });

  it('advanceTurn walks the order and wraps with a new round + log entry', () => {
    const { result } = setup();
    act(() => result.current.startEncounter([pellias, ashka, izzy]));
    const entries = result.current.encounter.order;
    act(() => result.current.setInitiative(entries[0].entryId, 10));
    act(() => result.current.setInitiative(entries[1].entryId, 20));
    act(() => result.current.setInitiative(entries[2].entryId, 15));
    act(() => result.current.beginRound1());
    expect(result.current.encounter.currentTurnIndex).toBe(0); // Ashka (20)

    act(() => result.current.advanceTurn());
    expect(result.current.encounter.currentTurnIndex).toBe(1); // Izzy (15)
    act(() => result.current.advanceTurn());
    expect(result.current.encounter.currentTurnIndex).toBe(2); // Pellias (10)
    act(() => result.current.advanceTurn());
    expect(result.current.encounter.currentTurnIndex).toBe(0);
    expect(result.current.encounter.round).toBe(2);
    expect(result.current.encounter.log.some((l) => l.text === 'Round 2 begins')).toBe(true);
  });

  it('advanceTurn is a no-op when phase !== in-progress', () => {
    const { result } = setup();
    act(() => result.current.advanceTurn());
    expect(result.current.encounter.phase).toBe('idle');
    expect(result.current.encounter.round).toBe(0);
  });

  it('beginNextRound jumps to index 0 and bumps the round', () => {
    const { result } = setup();
    act(() => result.current.startEncounter([pellias, ashka]));
    const entries = result.current.encounter.order;
    act(() => result.current.setInitiative(entries[0].entryId, 10));
    act(() => result.current.setInitiative(entries[1].entryId, 20));
    act(() => result.current.beginRound1());
    act(() => result.current.advanceTurn()); // currentTurnIndex=1
    act(() => result.current.beginNextRound());
    expect(result.current.encounter.round).toBe(2);
    expect(result.current.encounter.currentTurnIndex).toBe(0);
  });

  it('endEncounter resets back to default + wipes log', () => {
    const { result } = setup();
    act(() => result.current.startEncounter([pellias]));
    act(() => result.current.appendLog({ type: 'note', text: 'thing happened' }));
    expect(result.current.encounter.log.length).toBeGreaterThan(0);
    act(() => result.current.endEncounter());
    expect(result.current.encounter).toMatchObject({
      active: false,
      phase: 'idle',
      round: 0,
      order: [],
      log: [],
    });
  });

  it('appendLog adds entries with ids + timestamps', () => {
    const { result } = setup();
    act(() => result.current.appendLog({ type: 'note', text: 'hi' }));
    const log = result.current.encounter.log;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ type: 'note', text: 'hi' });
    expect(typeof log[0].id).toBe('string');
    expect(typeof log[0].ts).toBe('number');
  });
});
