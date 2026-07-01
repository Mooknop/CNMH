import { renderHook, act } from '@testing-library/react';

// The broken overlay is the only useSyncedState call in the hook; back it with
// real React state seeded from a controllable module-level initial value.
let brokenInit = {};
vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return { useSyncedState: () => ReactLib.useState(brokenInit) };
});

let gateAvailable = true;
const recordSpy = vi.fn();
vi.mock('./useFrequency', () => ({
  useFrequency: () => ({
    gateFor: () => ({ available: gateAvailable }),
    record: (...a) => recordSpy(...a),
  }),
}));

let slotCanSacrifice = true;
let slotOptions = [{ rank: 2, remaining: 1, label: 'Rank 2 slot (1 left)' }];
// Mirror the real primitive: a sacrifice fails when nothing is eligible.
const sacrificeSpy = vi.fn((rank) =>
  slotCanSacrifice
    ? { ok: true, rank: Number(rank), label: `rank ${rank} slot` }
    : { ok: false, rank: null, label: null });
vi.mock('./useSlotSacrifice', () => ({
  useSlotSacrifice: () => ({
    options: slotOptions,
    canSacrifice: slotCanSacrifice,
    disabledReason: slotCanSacrifice ? null : 'No rank 2+ spell slot available',
    sacrifice: (...a) => sacrificeSpy(...a),
  }),
}));

vi.mock('../utils/affix', () => ({ itemUidOf: (it) => it?.uid || null }));

import { useItemActivation } from './useItemActivation';

const character = { id: 'wiz' };
const item = { uid: 'sc1', actuated: { name: 'Energy Abjection', minRank: 2, frequency: 'once per day' } };

const setup = () => renderHook(() => useItemActivation(character, item, { nowSecs: 100 }));

beforeEach(() => {
  brokenInit = {};
  gateAvailable = true;
  slotCanSacrifice = true;
  slotOptions = [{ rank: 2, remaining: 1, label: 'Rank 2 slot (1 left)' }];
});
afterEach(() => vi.clearAllMocks());

describe('useItemActivation', () => {
  it('activate spends a slot and records the daily use', () => {
    const { result } = setup();
    expect(result.current.activation.canActivate).toBe(true);
    let out;
    act(() => { out = result.current.activation.activate(2); });
    expect(sacrificeSpy).toHaveBeenCalledWith(2);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ ok: true, rank: 2, label: 'rank 2 slot' });
  });

  it('defaults the activation rank to the lowest eligible slot', () => {
    slotOptions = [{ rank: 3, remaining: 1, label: '' }, { rank: 4, remaining: 1, label: '' }];
    const { result } = setup();
    act(() => { result.current.activation.activate(); });
    expect(sacrificeSpy).toHaveBeenCalledWith(3);
  });

  it('cannot activate when there is no eligible slot', () => {
    slotCanSacrifice = false;
    const { result } = setup();
    expect(result.current.activation.canActivate).toBe(false);
    let out;
    act(() => { out = result.current.activation.activate(2); });
    // slots.sacrifice would still be gated upstream; the flag is the guard here.
    expect(recordSpy).not.toHaveBeenCalled();
    expect(out.ok).toBe(false);
  });

  it('offers Overload only once the daily use is spent', () => {
    gateAvailable = false;
    const { result } = setup();
    expect(result.current.activation.canActivate).toBe(false);
    expect(result.current.overload.canOverload).toBe(true);
  });

  it('Overload success resolves the effect and breaks the item', () => {
    gateAvailable = false;
    const { result } = setup();
    let out;
    act(() => { out = result.current.overload.overload(2, () => 0.5); }); // roll 11 → pass
    expect(sacrificeSpy).toHaveBeenCalledWith(2);
    expect(out).toMatchObject({ ok: true, success: true, roll: 11, dc: 10 });
    expect(result.current.broken).toBe(true);
  });

  it('Overload failure still breaks the item', () => {
    gateAvailable = false;
    const { result } = setup();
    let out;
    act(() => { out = result.current.overload.overload(2, () => 0); }); // roll 1 → fail
    expect(out).toMatchObject({ ok: true, success: false, roll: 1 });
    expect(result.current.broken).toBe(true);
  });

  it('a broken item cannot activate or overload', () => {
    brokenInit = { sc1: { repairable: false } };
    gateAvailable = true;
    const { result } = setup();
    expect(result.current.broken).toBe(true);
    expect(result.current.activation.canActivate).toBe(false);
    expect(result.current.overload.canOverload).toBe(false);
    let out;
    act(() => { out = result.current.activation.activate(2); });
    expect(out.ok).toBe(false);
    expect(sacrificeSpy).not.toHaveBeenCalled();
  });

  it('cannot repair a freshly broken item (locked until daily prep)', () => {
    brokenInit = { sc1: { repairable: false } };
    const { result } = setup();
    expect(result.current.repairable).toBe(false);
    let out;
    act(() => { out = result.current.repair.withAction(); });
    expect(out.ok).toBe(false);
    expect(result.current.broken).toBe(true);
  });

  it('repairs with the Repair action once unlocked', () => {
    brokenInit = { sc1: { repairable: true } };
    const { result } = setup();
    expect(result.current.repairable).toBe(true);
    act(() => { result.current.repair.withAction(); });
    expect(result.current.broken).toBe(false);
  });

  it('repairs by sacrificing a minimum-rank slot once unlocked', () => {
    brokenInit = { sc1: { repairable: true } };
    const { result } = setup();
    expect(result.current.repair.minRankSlotAvailable).toBe(true);
    let out;
    act(() => { out = result.current.repair.withSlot(); });
    expect(sacrificeSpy).toHaveBeenCalledWith(2); // minRank
    expect(out).toMatchObject({ ok: true, rank: 2 });
    expect(result.current.broken).toBe(false);
  });

  it('no actuated block → nothing is actionable', () => {
    const { result } = renderHook(() =>
      useItemActivation(character, { uid: 'plain' }, { nowSecs: 100 }));
    expect(result.current.actuated).toBeNull();
    expect(result.current.activation.canActivate).toBe(false);
    expect(result.current.overload.canOverload).toBe(false);
  });
});
