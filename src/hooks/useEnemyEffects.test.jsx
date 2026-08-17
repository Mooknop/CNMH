import { renderHook, act } from '@testing-library/react';

vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  const subs = new Set();
  const useSyncedState = (key, init) => {
    const [, force] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
    if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
    const set = (u) => {
      store[key] = typeof u === 'function' ? u(store[key]) : u;
      subs.forEach((f) => f());
    };
    return [store[key], set];
  };
  return {
    __esModule: true,
    useSyncedState,
    __store: store,
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

import { __store, __reset } from './useSyncedState';
import { useEnemyEffects, offGuardAppliesTo } from './useEnemyEffects';

beforeEach(() => __reset());

const ENTRY = 'enemy-1';

describe('useEnemyEffects', () => {
  it('starts each enemy with an empty record', () => {
    const { result } = renderHook(() => useEnemyEffects());
    expect(result.current.effectsFor(ENTRY)).toEqual({ conditions: [], effects: [] });
  });

  it('applyCondition adds a valued condition', () => {
    const { result } = renderHook(() => useEnemyEffects());
    act(() => result.current.applyCondition(ENTRY, { id: 'frightened', value: 1, source: 'Demoralize' }));
    const rec = result.current.effectsFor(ENTRY);
    expect(rec.conditions).toHaveLength(1);
    expect(rec.conditions[0]).toMatchObject({ id: 'frightened', value: 1, source: 'Demoralize' });
  });

  it('applyCondition bumps to the higher value, never reducing existing fear', () => {
    const { result } = renderHook(() => useEnemyEffects());
    act(() => result.current.applyCondition(ENTRY, { id: 'frightened', value: 2 }));
    act(() => result.current.applyCondition(ENTRY, { id: 'frightened', value: 1 }));
    const rec = result.current.effectsFor(ENTRY);
    expect(rec.conditions).toHaveLength(1);
    expect(rec.conditions[0].value).toBe(2);
  });

  // ── round-timed expiry stamps (#1246 D) ────────────────────────────────────
  describe('expireAt stamps (#1246 D)', () => {
    const stamp = { round: 2, entryId: 'e-pc', boundary: 'turn-end' };
    const later = { round: 5, entryId: 'e-pc', boundary: 'turn-end' };

    it('records the stamp on a fresh application, and omits the key without one', () => {
      const { result } = renderHook(() => useEnemyEffects());
      act(() => result.current.applyCondition(ENTRY, { id: 'dazzled', expireAt: stamp }));
      act(() => result.current.applyCondition(ENTRY, { id: 'off-guard' }));
      const rec = result.current.effectsFor(ENTRY);
      expect(rec.conditions.find((c) => c.id === 'dazzled').expireAt).toEqual(stamp);
      expect(rec.conditions.find((c) => c.id === 'off-guard')).not.toHaveProperty('expireAt');
    });

    it('never shortens: an un-stamped re-application makes the merged entry manual', () => {
      const { result } = renderHook(() => useEnemyEffects());
      act(() => result.current.applyCondition(ENTRY, { id: 'dazzled', expireAt: stamp }));
      act(() => result.current.applyCondition(ENTRY, { id: 'dazzled' })); // GM dock re-apply
      expect(result.current.effectsFor(ENTRY).conditions[0]).not.toHaveProperty('expireAt');
    });

    it('never shortens: a stamped re-application over a manual entry keeps it manual', () => {
      const { result } = renderHook(() => useEnemyEffects());
      act(() => result.current.applyCondition(ENTRY, { id: 'dazzled' }));
      act(() => result.current.applyCondition(ENTRY, { id: 'dazzled', expireAt: stamp }));
      expect(result.current.effectsFor(ENTRY).conditions[0]).not.toHaveProperty('expireAt');
    });

    it('re-anchors to the incoming stamp when both sides are stamped (re-fire)', () => {
      const { result } = renderHook(() => useEnemyEffects());
      act(() => result.current.applyCondition(ENTRY, { id: 'dazzled', expireAt: stamp }));
      act(() => result.current.applyCondition(ENTRY, { id: 'dazzled', expireAt: later }));
      expect(result.current.effectsFor(ENTRY).conditions[0].expireAt).toEqual(later);
    });

    it('stamps merge per scope — a scoped stamp never touches the generic entry', () => {
      const { result } = renderHook(() => useEnemyEffects());
      act(() => result.current.applyCondition(ENTRY, { id: 'off-guard' }));
      act(() => result.current.applyCondition(ENTRY, { id: 'off-guard', scopedTo: 'izzy', expireAt: stamp }));
      const rec = result.current.effectsFor(ENTRY);
      expect(rec.conditions.find((c) => !c.scopedTo)).not.toHaveProperty('expireAt');
      expect(rec.conditions.find((c) => c.scopedTo === 'izzy').expireAt).toEqual(stamp);
    });
  });

  it('stampImmunity + isImmune reflect an active per-caster immunity', () => {
    const { result } = renderHook(() => useEnemyEffects());
    act(() => result.current.stampImmunity(ENTRY, {
      abilityKey: 'demoralize', abilityName: 'Demoralize', casterId: 'AshkaBGosh',
      nowSecs: 1000, durationSecs: 600,
    }));
    expect(result.current.isImmune(ENTRY, {
      abilityKey: 'demoralize', casterId: 'AshkaBGosh', scope: 'per-caster', nowSecs: 1200,
    })).toBe(true);
    // A different caster is not blocked under per-caster scope.
    expect(result.current.isImmune(ENTRY, {
      abilityKey: 'demoralize', casterId: 'Blu', scope: 'per-caster', nowSecs: 1200,
    })).toBe(false);
  });

  it('isImmune is false once the immunity has expired', () => {
    const { result } = renderHook(() => useEnemyEffects());
    act(() => result.current.stampImmunity(ENTRY, {
      abilityKey: 'demoralize', abilityName: 'Demoralize', casterId: 'AshkaBGosh',
      nowSecs: 1000, durationSecs: 600,
    }));
    expect(result.current.isImmune(ENTRY, {
      abilityKey: 'demoralize', casterId: 'AshkaBGosh', scope: 'per-caster', nowSecs: 1700,
    })).toBe(false);
  });

  it('scoped conditions coexist with a generic one and with other attackers (#348)', () => {
    const { result } = renderHook(() => useEnemyEffects());
    // A generic off-guard (flanking) plus one scoped to Izzy (Feint).
    act(() => result.current.applyCondition(ENTRY, { id: 'off-guard' }));
    act(() => result.current.applyCondition(ENTRY, {
      id: 'off-guard', scopedTo: 'izzy', scopedToName: 'Izzy', source: 'Feint',
    }));
    // A second attacker's scope is a third, separate entry.
    act(() => result.current.applyCondition(ENTRY, {
      id: 'off-guard', scopedTo: 'ashka', scopedToName: 'Ashka', source: 'Feint',
    }));
    const rec = result.current.effectsFor(ENTRY);
    expect(rec.conditions).toHaveLength(3);
    expect(rec.conditions.map((c) => c.scopedTo)).toEqual([null, 'izzy', 'ashka']);
    // Re-applying the same scope updates in place rather than duplicating.
    act(() => result.current.applyCondition(ENTRY, { id: 'off-guard', scopedTo: 'izzy', scopedToName: 'Izzy' }));
    expect(result.current.effectsFor(ENTRY).conditions).toHaveLength(3);
  });

  it('clearAll empties the whole map (encounter-end wipe)', () => {
    const { result } = renderHook(() => useEnemyEffects());
    act(() => result.current.applyCondition(ENTRY, { id: 'frightened', value: 1 }));
    act(() => result.current.clearAll());
    expect(result.current.effectsFor(ENTRY)).toEqual({ conditions: [], effects: [] });
    expect(__store['cnmh_enemyfx_global']).toEqual({});
  });
});

describe('offGuardAppliesTo (#348)', () => {
  it('matches a generic off-guard for any attacker', () => {
    const records = [{ conditions: [{ id: 'off-guard', scopedTo: null }] }];
    expect(offGuardAppliesTo(records, 'izzy')).toBe(true);
    expect(offGuardAppliesTo(records, 'ashka')).toBe(true);
  });

  it('matches a scoped off-guard only for that attacker', () => {
    const records = [{ conditions: [{ id: 'off-guard', scopedTo: 'izzy' }] }];
    expect(offGuardAppliesTo(records, 'izzy')).toBe(true);
    expect(offGuardAppliesTo(records, 'ashka')).toBe(false);
  });

  it('ignores non-off-guard conditions and empty input', () => {
    expect(offGuardAppliesTo([{ conditions: [{ id: 'frightened', value: 1 }] }], 'izzy')).toBe(false);
    expect(offGuardAppliesTo([], 'izzy')).toBe(false);
    expect(offGuardAppliesTo(undefined, 'izzy')).toBe(false);
  });
});

describe('removeCondition (#1537 S3)', () => {
  it('removes exactly the id+scope pair, leaving other scopes intact', () => {
    const { result } = renderHook(() => useEnemyEffects());
    act(() => {
      result.current.applyCondition(ENTRY, { id: 'off-guard', source: 'Flanking' });
      result.current.applyCondition(ENTRY, { id: 'off-guard', source: 'Feint', scopedTo: 'Pellias' });
      result.current.applyCondition(ENTRY, { id: 'frightened', value: 2, source: 'Demoralize' });
    });

    act(() => { result.current.removeCondition(ENTRY, { id: 'off-guard' }); });

    const conditions = result.current.effectsFor(ENTRY).conditions;
    expect(conditions).toHaveLength(2);
    expect(conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'off-guard', scopedTo: 'Pellias' }),
      expect.objectContaining({ id: 'frightened', value: 2 }),
    ]));
  });

  it('no-ops on an unknown entry or missing id', () => {
    const { result } = renderHook(() => useEnemyEffects());
    act(() => {
      result.current.applyCondition(ENTRY, { id: 'frightened', value: 1, source: 'x' });
      result.current.removeCondition('enemy-none', { id: 'frightened' });
      result.current.removeCondition(ENTRY, {});
    });
    expect(result.current.effectsFor(ENTRY).conditions).toHaveLength(1);
  });
});
