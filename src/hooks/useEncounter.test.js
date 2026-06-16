import { renderHook, act } from '@testing-library/react';

// useSyncedState → plain useState. Each renderHook gets its own store, which is
// what we want for unit tests of the hook's reducer-like API. Cross-client
// integration is covered by useSyncedState's own tests + the shared-store
// pattern used by HandsPanel.test.js, not here.
vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) =>
      ReactLib.useState(typeof init === 'function' ? init() : init),
  };
});

// Session context — expiry sweep uses sendUpdate; not exercised in these unit tests.
vi.mock('../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: vi.fn(), getState: vi.fn(() => []) }),
}));

// ContentContext — sweep looks up effect names in the DO-backed catalog;
// no effects in these tests.
vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ effects: [] }),
}));

// expiry utilities — keep the sweep a no-op in unit tests so they only
// test the encounter state machine, not side-effect wiring.
vi.mock('../utils/expiry', () => ({
  boundariesCrossedBy: vi.fn(() => []),
  isExpired: vi.fn(() => false),
  resolveExpireAt: vi.fn(() => null),
  expiryLabel: vi.fn(() => null),
}));

import { useEncounter } from './useEncounter';
import { isExpired } from '../utils/expiry';

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

  it('endEncounter clears each PC sustained-spell ledger (#220)', () => {
    localStorage.setItem('cnmh_sustains_Pellias', JSON.stringify([{ id: 's1', spellName: 'Bless' }]));
    const { result } = setup();
    act(() => result.current.startEncounter([pellias]));
    act(() => result.current.endEncounter());
    expect(JSON.parse(localStorage.getItem('cnmh_sustains_Pellias'))).toEqual([]);
  });

  it('endEncounter clears each PC active stance (#224)', () => {
    localStorage.setItem('cnmh_stance_Pellias', JSON.stringify({ active: true, name: 'Dragon Stance', ts: 1 }));
    const { result } = setup();
    act(() => result.current.startEncounter([pellias]));
    act(() => result.current.endEncounter());
    expect(JSON.parse(localStorage.getItem('cnmh_stance_Pellias'))).toMatchObject({ active: false, name: null });
  });

  it('endEncounter drops encounter-scoped effects (eld-charged) but keeps manual ones (#275)', () => {
    localStorage.setItem('cnmh_effects_IzzyUncut', JSON.stringify([
      { id: 'c1', effectId: 'eld-charged' }, // catalog-flagged encounterScoped
      { id: 'm1', effectId: 'mage-armor' },  // manual, kept
    ]));
    const { result } = setup();
    act(() => result.current.startEncounter([izzy]));
    act(() => result.current.endEncounter());
    expect(JSON.parse(localStorage.getItem('cnmh_effects_IzzyUncut')).map((e) => e.id)).toEqual(['m1']);
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

  describe('expiry sweep — granted actions', () => {
    let isExpiredMock;

    beforeEach(() => {
      localStorage.clear();
      isExpiredMock = isExpired;
      isExpiredMock.mockReturnValue(false);
    });

    afterEach(() => {
      isExpiredMock.mockReturnValue(false);
    });

    const startInProgress = (result) => {
      act(() => result.current.startEncounter([pellias, ashka]));
      const entries = result.current.encounter.order;
      act(() => result.current.setInitiative(entries[0].entryId, 20));
      act(() => result.current.setInitiative(entries[1].entryId, 10));
      act(() => result.current.beginRound1());
    };

    it('sweeps expired granted actions from localStorage on advanceTurn', () => {
      const expiredGrant = {
        id: 'g-1',
        action: { name: 'Enthusiastic Strike', cost: 1 },
        source: 'Infectious Enthusiasm',
        expireAt: { round: 1, boundary: 'turn-end' },
        ts: 1000,
      };
      const liveGrant = {
        id: 'g-2',
        action: { name: 'Other', cost: 1 },
        source: 'Other Spell',
        expireAt: { round: 5, boundary: 'turn-end' },
        ts: 1001,
      };

      const { result } = setup();
      startInProgress(result);

      const key = `cnmh_grantedactions_${pellias.id}`;
      localStorage.setItem(key, JSON.stringify([expiredGrant, liveGrant]));

      // isExpired returns true only for round-1 entries
      isExpiredMock.mockImplementation(
        (expireAt) => expireAt?.round === 1 && expireAt?.boundary === 'turn-end'
      );

      act(() => result.current.advanceTurn());

      const stored = JSON.parse(localStorage.getItem(key));
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe('g-2');
    });

    it('logs expiry message for swept grants', () => {
      const expiredGrant = {
        id: 'g-1',
        action: { name: 'Enthusiastic Strike', cost: 1 },
        source: 'Infectious Enthusiasm',
        expireAt: { round: 1, boundary: 'turn-end' },
        ts: 1000,
      };

      const { result } = setup();
      startInProgress(result);

      const key = `cnmh_grantedactions_${pellias.id}`;
      localStorage.setItem(key, JSON.stringify([expiredGrant]));

      isExpiredMock.mockReturnValue(true);

      act(() => result.current.advanceTurn());

      const log = result.current.encounter.log;
      expect(log.some((l) => l.text.includes('Enthusiastic Strike') && l.text.includes('expired'))).toBe(true);
    });

    it('does not modify localStorage if no grants expired', () => {
      const liveGrant = {
        id: 'g-live',
        action: { name: 'Something', cost: 1 },
        source: 'Spell',
        expireAt: { round: 99, boundary: 'turn-end' },
        ts: 1000,
      };

      const { result } = setup();
      startInProgress(result);

      const key = `cnmh_grantedactions_${pellias.id}`;
      localStorage.setItem(key, JSON.stringify([liveGrant]));

      // isExpired returns false (default)
      const beforeSpy = JSON.stringify(JSON.parse(localStorage.getItem(key)));
      act(() => result.current.advanceTurn());
      expect(localStorage.getItem(key)).toBe(beforeSpy);
    });
  });
});
