import { renderHook, act } from '@testing-library/react';

// Self-contained synced-state store so the hook runs without a SessionProvider.
jest.mock('./useSyncedState', () => {
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
  return { __esModule: true, useSyncedState, __reset: () => { for (const k of Object.keys(store)) delete store[k]; } };
});

const { __reset } = require('./useSyncedState');
import { useShield, RAISED_SHIELD_EFFECT_ID } from './useShield';

const heldSteelShield = {
  uid: 'shield-1',
  name: 'Steel Shield',
  state: 'held1',
  shield: { bonus: 2, hardness: 5, hp: 20, brokenThreshold: 10 },
};

beforeEach(() => __reset());

describe('useShield', () => {
  it('detects a held shield (normalized) and starts un-raised', () => {
    const { result } = renderHook(() => useShield('Pellias', [heldSteelShield]));
    expect(result.current.heldShield.uid).toBe('shield-1');
    expect(result.current.heldShield.shield.bonus).toBe(2);
    expect(result.current.raised).toBe(false);
    expect(result.current.shieldEffect).toBeNull();
  });

  it('ignores a shield that is not in a hand', () => {
    const worn = { ...heldSteelShield, state: 'worn' };
    const { result } = renderHook(() => useShield('Pellias', [worn]));
    expect(result.current.heldShield).toBeNull();
  });

  it('normalizes a legacy shield shape', () => {
    const legacy = { uid: 's', name: 'Old', state: 'held1', shield: { bonus: 2, health: 20, breakThreshold: 10, hardness: 5 } };
    const { result } = renderHook(() => useShield('Pellias', [legacy]));
    expect(result.current.heldShield.shield).toEqual({ bonus: 2, hardness: 5, hp: 20, brokenThreshold: 10 });
  });

  it('raising injects a circumstance AC effect equal to the shield bonus', () => {
    const { result } = renderHook(() => useShield('Pellias', [heldSteelShield]));
    act(() => result.current.raiseShield('shield-1'));
    expect(result.current.raised).toBe(true);
    expect(result.current.shieldEffect.entry).toEqual({ id: RAISED_SHIELD_EFFECT_ID, effectId: RAISED_SHIELD_EFFECT_ID });
    expect(result.current.shieldEffect.def.modifiers).toEqual([
      { stat: 'ac', kind: 'circumstance', amount: 2 },
    ]);
  });

  it('lowering clears the effect', () => {
    const { result } = renderHook(() => useShield('Pellias', [heldSteelShield]));
    act(() => result.current.raiseShield('shield-1'));
    act(() => result.current.lowerShield());
    expect(result.current.raised).toBe(false);
    expect(result.current.shieldEffect).toBeNull();
  });

  it('a broken shield is never raised and injects nothing', () => {
    const broken = { ...heldSteelShield, shield: { bonus: 2, hardness: 5, hp: 10, brokenThreshold: 10 } };
    const { result } = renderHook(() => useShield('Pellias', [broken]));
    expect(result.current.broken).toBe(true);
    act(() => result.current.raiseShield('shield-1'));
    expect(result.current.raised).toBe(false);
    expect(result.current.shieldEffect).toBeNull();
  });

  it('raise does not apply if the raised uid no longer matches the held shield', () => {
    // Raised shield-1, then the player switched to shield-2.
    const { result, rerender } = renderHook(({ inv }) => useShield('Pellias', inv), {
      initialProps: { inv: [heldSteelShield] },
    });
    act(() => result.current.raiseShield('shield-1'));
    expect(result.current.raised).toBe(true);

    const otherShield = { ...heldSteelShield, uid: 'shield-2', name: 'Tower Shield' };
    rerender({ inv: [otherShield] });
    expect(result.current.raised).toBe(false);
    expect(result.current.shieldEffect).toBeNull();
  });
});
