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
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
    __seed: (key, value) => { store[key] = value; },
    __get: (key) => store[key],
  };
});

import { __reset, __seed, __get } from './useSyncedState';
import { useItemHp } from './useItemHp';

const longsword = { uid: 'e-sword', id: 'longsword', strikes: [{ damage: '1d8' }] };
const fullPlate = { uid: 'e-plate', id: 'full-plate', armor: { category: 'heavy', group: 'plate' } };
const potion = { uid: 'e-potion', id: 'healing-potion', consumable: { uses: 1 } };
const steelShield = { uid: 'e-shield', id: 'steel-shield', shield: { bonus: 2, hardness: 5, hp: 20, brokenThreshold: 10 } };

beforeEach(() => __reset());

describe('useItemHp — statusFor', () => {
  it('untracked items report null', () => {
    const { result } = renderHook(() => useItemHp('Pellias'));
    expect(result.current.statusFor(potion)).toBeNull();
    expect(result.current.statusFor(null)).toBeNull();
  });

  it('a fresh item sits at its derived max (thin steel weapon)', () => {
    const { result } = renderHook(() => useItemHp('Pellias'));
    expect(result.current.statusFor(longsword)).toEqual({
      hp: 20, maxHp: 20, hardness: 5, brokenThreshold: 10, broken: false, destroyed: false,
    });
  });

  it('metal armor derives the ordinary steel row', () => {
    const { result } = renderHook(() => useItemHp('Pellias'));
    expect(result.current.statusFor(fullPlate)).toMatchObject({ hp: 36, hardness: 9, brokenThreshold: 18 });
  });
});

describe('useItemHp — applyDamage', () => {
  it('persists hardness-reduced damage to the overlay', () => {
    const { result } = renderHook(() => useItemHp('Pellias'));
    let r;
    act(() => { r = result.current.applyDamage(longsword, 12); });
    expect(r).toEqual({ prevented: 5, taken: 7, hpAfter: 13, broken: false, destroyed: false });
    expect(result.current.statusFor(longsword)).toMatchObject({ hp: 13, maxHp: 20 });
    expect(__get('cnmh_itemhp_Pellias')).toEqual({ 'e-sword': { hp: 13 } });
  });

  it('marks broken and destroyed as HP falls', () => {
    const { result } = renderHook(() => useItemHp('Pellias'));
    act(() => { result.current.applyDamage(longsword, 15); }); // 20 − 10 = 10 = BT
    expect(result.current.statusFor(longsword).broken).toBe(true);
    act(() => { result.current.applyDamage(longsword, 99); });
    expect(result.current.statusFor(longsword)).toMatchObject({ hp: 0, broken: true, destroyed: true });
  });

  it('returns null for untracked items and writes nothing', () => {
    const { result } = renderHook(() => useItemHp('Pellias'));
    let r;
    act(() => { r = result.current.applyDamage(potion, 12); });
    expect(r).toBeNull();
    expect(__get('cnmh_itemhp_Pellias')).toEqual({});
  });

  it('tracks each item independently', () => {
    const { result } = renderHook(() => useItemHp('Pellias'));
    act(() => { result.current.applyDamage(longsword, 12); });
    act(() => { result.current.applyDamage(fullPlate, 12); });
    expect(result.current.statusFor(longsword).hp).toBe(13);   // H5: 20 − 7
    expect(result.current.statusFor(fullPlate).hp).toBe(33);   // H9: 36 − 3
  });
});

describe('useItemHp — repairItem', () => {
  it('restores toward max, clamped', () => {
    const { result } = renderHook(() => useItemHp('Pellias'));
    act(() => { result.current.applyDamage(longsword, 17); }); // hp 8 → Broken
    let hp;
    act(() => { hp = result.current.repairItem(longsword, 5); });
    expect(hp).toBe(13);
    expect(result.current.statusFor(longsword).broken).toBe(false);
    act(() => { hp = result.current.repairItem(longsword, 40); });
    expect(hp).toBe(20);
  });

  it('is a no-op for non-positive amounts and untracked items', () => {
    const { result } = renderHook(() => useItemHp('Pellias'));
    let r;
    act(() => { r = result.current.repairItem(longsword, 0); });
    expect(r).toBeNull();
    act(() => { r = result.current.repairItem(potion, 5); });
    expect(r).toBeNull();
  });
});

describe('useItemHp — legacy shieldstate fallback (#541 migration)', () => {
  it('reads shield HP recorded on the pre-epic key', () => {
    __seed('cnmh_shieldstate_Pellias', { 'e-shield': { hp: 13 } });
    const { result } = renderHook(() => useItemHp('Pellias'));
    expect(result.current.hpFor('e-shield')).toBe(13);
    expect(result.current.statusFor(steelShield)).toMatchObject({ hp: 13, maxHp: 20 });
  });

  it('the shared overlay wins over the legacy value, and writes land on itemhp', () => {
    __seed('cnmh_shieldstate_Pellias', { 'e-shield': { hp: 13 } });
    const { result } = renderHook(() => useItemHp('Pellias'));
    act(() => { result.current.applyDamage(steelShield, 12); }); // 13 − 7 = 6
    expect(__get('cnmh_itemhp_Pellias')).toEqual({ 'e-shield': { hp: 6 } });
    // Legacy key untouched; overlay now authoritative.
    expect(__get('cnmh_shieldstate_Pellias')).toEqual({ 'e-shield': { hp: 13 } });
    expect(result.current.statusFor(steelShield).hp).toBe(6);
  });
});
