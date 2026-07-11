import {
  appliedHours,
  bankedFloorDays,
  availableToBankHours,
  defaultAllocations,
  allocationsTotal,
  allocationsBalanced,
  recordApplied,
} from './downtimeBanking';

describe('appliedHours / bankedFloorDays', () => {
  it('sums the applied map, ignoring junk values', () => {
    expect(appliedHours({ a: 16, b: 8 })).toBe(24);
    expect(appliedHours({ a: 'x', b: 8 })).toBe(8);
    expect(appliedHours(null)).toBe(0);
  });

  it('floors the slider at whole banked days (ceil of hours/8)', () => {
    expect(bankedFloorDays({})).toBe(0);
    expect(bankedFloorDays({ a: 16 })).toBe(2);
    expect(bankedFloorDays({ a: 12 })).toBe(2); // partial day still locks the day
  });
});

describe('availableToBankHours', () => {
  it('is the planned hours minus what is already banked, never negative', () => {
    expect(availableToBankHours(2, {})).toBe(16);
    expect(availableToBankHours(2, { a: 8 })).toBe(8);
    expect(availableToBankHours(1, { a: 16 })).toBe(0);
  });
});

describe('defaultAllocations', () => {
  const targets = [{ id: 'a', hours: 4 }, { id: 'b', hours: 12 }];

  it('puts everything on the furthest-along target', () => {
    expect(defaultAllocations(targets, 16)).toEqual({ a: 0, b: 16 });
  });

  it('is empty with no pool or no targets', () => {
    expect(defaultAllocations(targets, 0)).toEqual({});
    expect(defaultAllocations([], 16)).toEqual({});
  });
});

describe('allocationsTotal / allocationsBalanced', () => {
  const targets = [{ id: 'a', hours: 0 }, { id: 'b', hours: 0 }];

  it('totals only entries belonging to the targets', () => {
    expect(allocationsTotal(targets, { a: 8, b: 8, ghost: 99 })).toBe(16);
  });

  it('balances when every un-banked hour has a target (or nothing to split)', () => {
    expect(allocationsBalanced(targets, { a: 8, b: 8 }, 16)).toBe(true);
    expect(allocationsBalanced(targets, { a: 8 }, 16)).toBe(false);
    expect(allocationsBalanced(targets, {}, 0)).toBe(true);
    expect(allocationsBalanced([], {}, 16)).toBe(true);
  });
});

describe('recordApplied', () => {
  const targets = [{ id: 'a', hours: 0 }, { id: 'b', hours: 0 }];

  it('accumulates deltas onto the existing applied map', () => {
    expect(recordApplied({ a: 8 }, targets, { a: 8, b: 16 })).toEqual({ a: 16, b: 16 });
  });

  it('leaves zero-allocation targets and unrelated entries alone', () => {
    expect(recordApplied({ old: 8 }, targets, { a: 0 })).toEqual({ old: 8 });
  });
});
