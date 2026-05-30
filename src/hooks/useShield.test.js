import React from 'react';
import { renderHook, act } from '@testing-library/react';

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

describe('useShield — raise/lower', () => {
  it('detects a held shield and starts un-raised', () => {
    const { result } = renderHook(() => useShield('Pellias', [heldSteelShield]));
    expect(result.current.heldShield.uid).toBe('shield-1');
    expect(result.current.heldShield.shield.bonus).toBe(2);
    expect(result.current.raised).toBe(false);
    expect(result.current.shieldEffect).toBeNull();
  });

  it('ignores a shield not in a hand', () => {
    const { result } = renderHook(() => useShield('Pellias', [{ ...heldSteelShield, state: 'worn' }]));
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

  it('raise does not apply if the uid no longer matches the held shield', () => {
    const { result, rerender } = renderHook(({ inv }) => useShield('Pellias', inv), {
      initialProps: { inv: [heldSteelShield] },
    });
    act(() => result.current.raiseShield('shield-1'));
    rerender({ inv: [{ ...heldSteelShield, uid: 'shield-2' }] });
    expect(result.current.raised).toBe(false);
  });
});

describe('useShield — applyBlock (app-local HP)', () => {
  it('applyBlock reduces shield HP and returns the result', () => {
    const { result } = renderHook(() => useShield('Pellias', [heldSteelShield]));
    act(() => result.current.raiseShield('shield-1'));

    let blockResult;
    act(() => { blockResult = result.current.applyBlock(12); });

    // H5 on 12 dmg: prevented=5, remaining=7, shieldHp 20-7=13
    expect(blockResult.prevented).toBe(5);
    expect(blockResult.characterTakes).toBe(7);
    expect(blockResult.shieldHpAfter).toBe(13);
    expect(blockResult.broken).toBe(false);
    // Authored HP is overridden by the stored value.
    expect(result.current.heldShield.shield.hp).toBe(13);
  });

  it('a block that breaks the shield sets broken and drops the raised state', () => {
    const { result } = renderHook(() => useShield('Pellias', [heldSteelShield]));
    act(() => result.current.raiseShield('shield-1'));

    // 15 dmg: remaining 10 = BT → broken
    act(() => result.current.applyBlock(15));

    expect(result.current.broken).toBe(true);
    // broken suppresses raised
    expect(result.current.raised).toBe(false);
    expect(result.current.shieldEffect).toBeNull();
  });

  it('HP persists across re-renders (stored in session state)', () => {
    const { result, rerender } = renderHook(({ inv }) => useShield('Pellias', inv), {
      initialProps: { inv: [heldSteelShield] },
    });
    act(() => result.current.applyBlock(12));
    rerender({ inv: [heldSteelShield] });
    expect(result.current.heldShield.shield.hp).toBe(13);
  });

  it('authored HP is the starting point when no block has been applied', () => {
    const { result } = renderHook(() => useShield('Pellias', [heldSteelShield]));
    expect(result.current.heldShield.shield.hp).toBe(20);
  });

  it('a shield authored as broken at start is immediately broken', () => {
    const brokenShield = { ...heldSteelShield, shield: { bonus: 2, hardness: 5, hp: 10, brokenThreshold: 10 } };
    const { result } = renderHook(() => useShield('Pellias', [brokenShield]));
    expect(result.current.broken).toBe(true);
  });
});
