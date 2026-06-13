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
import { useEnemyEffects } from './useEnemyEffects';

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

  it('clearAll empties the whole map (encounter-end wipe)', () => {
    const { result } = renderHook(() => useEnemyEffects());
    act(() => result.current.applyCondition(ENTRY, { id: 'frightened', value: 1 }));
    act(() => result.current.clearAll());
    expect(result.current.effectsFor(ENTRY)).toEqual({ conditions: [], effects: [] });
    expect(__store['cnmh_enemyfx_global']).toEqual({});
  });
});
