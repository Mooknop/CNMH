import {
  eligibleSacrificeRanks,
  slotSacrificeLabel,
  noEligibleSlotReason,
  clampSlotAllocation,
} from './slotSacrifice';

// A remainingFor built from a simple rank -> remaining map.
const remaining = (map) => (rank) => map[String(rank)] || 0;

describe('eligibleSacrificeRanks', () => {
  const totals = { cantrips: 5, 1: 2, 2: 2, 3: 1, 4: 1 };

  it('returns ranks with slots remaining within [minRank, maxRank], ascending', () => {
    const rem = remaining({ 1: 2, 2: 0, 3: 1, 4: 1 });
    expect(eligibleSacrificeRanks(totals, rem, { minRank: 2, maxRank: 4 })).toEqual([3, 4]);
  });

  it('excludes cantrips and rank 0', () => {
    const withZero = { cantrips: 5, 0: 3, 1: 1 };
    const rem = remaining({ 0: 3, 1: 1 });
    expect(eligibleSacrificeRanks(withZero, rem, { minRank: 1 })).toEqual([1]);
  });

  it('excludes ranks with no remaining slots', () => {
    const rem = remaining({ 1: 0, 2: 0, 3: 0, 4: 0 });
    expect(eligibleSacrificeRanks(totals, rem, { minRank: 1 })).toEqual([]);
  });

  it('defaults maxRank to Infinity (min-and-up)', () => {
    const rem = remaining({ 1: 2, 2: 2, 3: 1, 4: 1 });
    expect(eligibleSacrificeRanks(totals, rem, { minRank: 3 })).toEqual([3, 4]);
  });

  it('defaults minRank to 1 when no bounds given', () => {
    const rem = remaining({ 1: 1, 2: 1, 3: 1, 4: 1 });
    expect(eligibleSacrificeRanks(totals, rem)).toEqual([1, 2, 3, 4]);
  });

  it('handles null/undefined totals', () => {
    expect(eligibleSacrificeRanks(null, () => 1, { minRank: 1 })).toEqual([]);
    expect(eligibleSacrificeRanks(undefined, () => 1)).toEqual([]);
  });
});

describe('slotSacrificeLabel', () => {
  it('formats a human log fragment', () => {
    expect(slotSacrificeLabel(3)).toBe('rank 3 slot');
  });
});

describe('noEligibleSlotReason', () => {
  it('renders a "min+" range when maxRank is Infinity', () => {
    expect(noEligibleSlotReason(4)).toBe('No rank 4+ spell slot available');
  });

  it('renders a single rank when min === max', () => {
    expect(noEligibleSlotReason(2, 2)).toBe('No rank 2 spell slot available');
  });

  it('renders a min–max range otherwise', () => {
    expect(noEligibleSlotReason(2, 5)).toBe('No rank 2–5 spell slot available');
  });
});

describe('clampSlotAllocation', () => {
  const maxes = { cantrips: 5, 1: 3, 2: 2 };

  it('clamps each rank to the available maximum', () => {
    expect(clampSlotAllocation(maxes, { 1: 9, 2: 1 })).toEqual({ cantrips: 0, 1: 3, 2: 1 });
  });

  it('floors negatives at 0 and zeroes cantrips/rank 0', () => {
    const withZero = { cantrips: 5, 0: 4, 1: 3 };
    expect(clampSlotAllocation(withZero, { 0: 2, 1: -5 })).toEqual({ cantrips: 0, 0: 0, 1: 0 });
  });

  it('treats a missing allocation entry as 0', () => {
    expect(clampSlotAllocation(maxes, {})).toEqual({ cantrips: 0, 1: 0, 2: 0 });
    expect(clampSlotAllocation(maxes, null)).toEqual({ cantrips: 0, 1: 0, 2: 0 });
  });

  it('handles null maxes', () => {
    expect(clampSlotAllocation(null, { 1: 2 })).toEqual({});
  });
});
