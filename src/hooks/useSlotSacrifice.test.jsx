import { renderHook, act } from '@testing-library/react';

vi.mock('./useCastingResources', () => ({
  useCastingResources: vi.fn(),
}));

import { useSlotSacrifice } from './useSlotSacrifice';
import { useCastingResources } from './useCastingResources';

// A controllable slots pool: totals + a mutable remaining map + a spend spy.
const makeSlots = (totals, remaining) => {
  const rem = { ...remaining };
  const spend = vi.fn((rank) => {
    const k = String(rank);
    if ((rem[k] || 0) > 0) rem[k] -= 1;
  });
  return {
    totals,
    remainingFor: (rank) => rem[String(rank)] || 0,
    spend,
    _rem: rem,
  };
};

const setup = (slots, bounds) => {
  useCastingResources.mockReturnValue({ slots });
  return renderHook(({ b }) => useSlotSacrifice({ id: 'wiz' }, b), {
    initialProps: { b: bounds },
  });
};

afterEach(() => vi.clearAllMocks());

describe('useSlotSacrifice', () => {
  it('offers only ranks with remaining slots within [minRank, maxRank]', () => {
    const slots = makeSlots({ cantrips: 5, 1: 2, 2: 2, 3: 1, 4: 1 }, { 1: 2, 2: 0, 3: 1, 4: 1 });
    const { result } = setup(slots, { minRank: 2, maxRank: 4 });
    expect(result.current.options).toEqual([
      { rank: 3, remaining: 1, label: 'Rank 3 slot (1 left)' },
      { rank: 4, remaining: 1, label: 'Rank 4 slot (1 left)' },
    ]);
    expect(result.current.canSacrifice).toBe(true);
    expect(result.current.disabledReason).toBeNull();
  });

  it('spends exactly one slot of the chosen rank and returns a label', () => {
    const slots = makeSlots({ 1: 3, 2: 2 }, { 1: 3, 2: 2 });
    const { result } = setup(slots, { minRank: 1 });
    let outcome;
    act(() => { outcome = result.current.sacrifice(2); });
    expect(slots.spend).toHaveBeenCalledTimes(1);
    expect(slots.spend).toHaveBeenCalledWith(2);
    expect(outcome).toEqual({ ok: true, rank: 2, label: 'rank 2 slot' });
  });

  it('refuses a rank outside the eligible set without spending', () => {
    const slots = makeSlots({ 1: 3, 2: 2 }, { 1: 3, 2: 2 });
    const { result } = setup(slots, { minRank: 2 }); // rank 1 ineligible
    let outcome;
    act(() => { outcome = result.current.sacrifice(1); });
    expect(slots.spend).not.toHaveBeenCalled();
    expect(outcome).toEqual({ ok: false, rank: null, label: null });
  });

  it('refuses when the chosen rank has no slots left', () => {
    const slots = makeSlots({ 3: 1 }, { 3: 0 });
    const { result } = setup(slots, { minRank: 3, maxRank: 3 });
    let outcome;
    act(() => { outcome = result.current.sacrifice(3); });
    expect(slots.spend).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
  });

  it('reports a disabled reason when nothing qualifies', () => {
    const slots = makeSlots({ 1: 2, 2: 2 }, { 1: 0, 2: 0 });
    const { result } = setup(slots, { minRank: 4 });
    expect(result.current.options).toEqual([]);
    expect(result.current.canSacrifice).toBe(false);
    expect(result.current.disabledReason).toBe('No rank 4+ spell slot available');
  });

  it('coerces a string rank argument', () => {
    const slots = makeSlots({ 1: 3 }, { 1: 3 });
    const { result } = setup(slots, { minRank: 1 });
    let outcome;
    act(() => { outcome = result.current.sacrifice('1'); });
    expect(slots.spend).toHaveBeenCalledWith(1);
    expect(outcome).toEqual({ ok: true, rank: 1, label: 'rank 1 slot' });
  });
});
