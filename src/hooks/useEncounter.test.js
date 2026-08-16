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

// Session context — the expiry sweep reads through getState and writes through
// sendUpdate. `sessionCache` is empty by default, so getState returns
// `undefined` for every key: the real getState's absent contract
// (serverState[char]?.[type]), which keeps these tests exercising the
// localStorage fallback the way an unhydrated client does. The encounter-end
// cleanup formerly tested here (endEncounter, #1677) now lives in
// utils/partySweep.js — see partySweep.test.js for those semantics.
const sessionCache = {};      // `${charId}:${stateType}` → value
const sentUpdates = [];       // [charId, stateType, value]
vi.mock('../contexts/SessionContext', () => ({
  useSession: () => ({
    sendUpdate: (charId, stateType, value) => { sentUpdates.push([charId, stateType, value]); },
    getState: (charId, stateType) => sessionCache[`${charId}:${stateType}`],
  }),
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
import { SAVE_RESOLUTION_LIMIT } from '../utils/encounterUtils';

const setup = () => renderHook(() => useEncounter());

const pellias = { id: 'Pellias', name: 'Pellias' };
const ashka = { id: 'AshkaBGosh', name: 'Ashka' };
const izzy = { id: 'IzzyUncut', name: 'Izzy' };

beforeEach(() => {
  for (const k of Object.keys(sessionCache)) delete sessionCache[k];
  sentUpdates.length = 0;
});

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

  it('appendLog adds entries with ids + timestamps', () => {
    const { result } = setup();
    act(() => result.current.appendLog({ type: 'note', text: 'hi' }));
    const log = result.current.encounter.log;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ type: 'note', text: 'hi' });
    expect(typeof log[0].id).toBe('string');
    expect(typeof log[0].ts).toBe('number');
  });

  it('appendLog returns the new entry\'s id (#1751 S3)', () => {
    const { result } = setup();
    let id;
    act(() => { id = result.current.appendLog({ type: 'note', text: 'hi' }); });
    expect(id).toBe(result.current.encounter.log[0].id);
  });

  it('patchLogEntry merges fields onto an existing entry by id (#1751 S3)', () => {
    const { result } = setup();
    let id;
    act(() => { id = result.current.appendLog({ type: 'action', text: 'Fireball placed', templateId: null }); });
    act(() => result.current.patchLogEntry(id, { templateId: 'tpl-123' }));
    expect(result.current.encounter.log[0]).toMatchObject({
      type: 'action', text: 'Fireball placed', templateId: 'tpl-123',
    });
  });

  it('patchLogEntry is a no-op for an unknown id', () => {
    const { result } = setup();
    act(() => result.current.appendLog({ type: 'note', text: 'hi' }));
    const before = result.current.encounter.log;
    act(() => result.current.patchLogEntry('log-does-not-exist', { templateId: 'tpl-1' }));
    expect(result.current.encounter.log).toEqual(before);
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

  // ── save-degrees write-back (#1683 — Roll Resolution G1) ──────────────────
  //
  // resolveSaveRequest replaces the GM panel's removeSaveRequest exit: the
  // resolution record lands on `saveResolutions` and the request is dropped in
  // the SAME functional update, so a concurrent client can never resurrect the
  // request or lose the record. Nothing reads the list yet (G2 = #1689).
  describe('resolveSaveRequest (#1683)', () => {
    const pendingReq = {
      casterId: 'Pellias',
      casterName: 'Pellias',
      abilityName: 'Fireball',
      save: 'reflex',
      dc: 20,
      targets: [{ entryId: 'e-goblin', name: 'Goblin', saveMod: 5 }],
    };
    const resolution = (over = {}) => ({
      casterId: 'Pellias',
      casterEntryId: 'pc-a',
      casterName: 'Pellias',
      abilityName: 'Fireball',
      rank: null,
      save: 'reflex',
      dc: 20,
      basic: false,
      results: [{ entryId: 'e-goblin', name: 'Goblin', d20: 15, total: 20, degree: 'success' }],
      damage: null,
      ...over,
    });

    it('starts with an empty saveResolutions list', () => {
      const { result } = setup();
      expect(result.current.encounter.saveResolutions).toEqual([]);
    });

    it('appends the record and drops the request in one write', () => {
      const { result } = setup();
      act(() => result.current.addSaveRequest(pendingReq));
      act(() => result.current.addSaveRequest({ ...pendingReq, abilityName: 'Sleep' }));
      const [first, second] = result.current.encounter.saveRequests;

      act(() => result.current.resolveSaveRequest(first.id, resolution()));

      // Request gone…
      expect(result.current.encounter.saveRequests.map((r) => r.id)).toEqual([second.id]);
      // …and the record is there, stamped with the request id + a timestamp.
      expect(result.current.encounter.saveResolutions).toHaveLength(1);
      expect(result.current.encounter.saveResolutions[0]).toMatchObject({
        id: first.id,
        casterId: 'Pellias',
        casterEntryId: 'pc-a',
        abilityName: 'Fireball',
        save: 'reflex',
        dc: 20,
        results: [{ entryId: 'e-goblin', name: 'Goblin', d20: 15, total: 20, degree: 'success' }],
      });
      expect(typeof result.current.encounter.saveResolutions[0].ts).toBe('number');
    });

    it('defaults the optional fields a caller omits', () => {
      const { result } = setup();
      act(() => result.current.resolveSaveRequest('savereq-x', { results: [] }));
      expect(result.current.encounter.saveResolutions[0]).toMatchObject({
        id: 'savereq-x',
        rank: null,
        basic: false,
        damage: null,
        casterEntryId: null,
      });
    });

    it('carries the damage snapshot through verbatim (G2 inverts the damage roll)', () => {
      const damage = { entered: 12, expression: '6d6', typeLabel: 'fire', riders: [], degrees: { criticalFailure: 'full' } };
      const { result } = setup();
      act(() => result.current.resolveSaveRequest('savereq-x', resolution({ damage })));
      expect(result.current.encounter.saveResolutions[0].damage).toEqual(damage);
    });

    it(`bounds the list at ${SAVE_RESOLUTION_LIMIT} — the next resolution evicts the oldest`, () => {
      const { result } = setup();
      for (let i = 0; i < SAVE_RESOLUTION_LIMIT; i++) {
        act(() => result.current.resolveSaveRequest(`savereq-${i}`, resolution()));
      }
      expect(result.current.encounter.saveResolutions).toHaveLength(SAVE_RESOLUTION_LIMIT);
      expect(result.current.encounter.saveResolutions[0].id).toBe('savereq-0');

      act(() => result.current.resolveSaveRequest('savereq-overflow', resolution()));

      const ids = result.current.encounter.saveResolutions.map((r) => r.id);
      expect(ids).toHaveLength(SAVE_RESOLUTION_LIMIT);
      expect(ids).not.toContain('savereq-0');   // oldest evicted
      expect(ids[0]).toBe('savereq-1');
      expect(ids[ids.length - 1]).toBe('savereq-overflow');
    });

  });
});
