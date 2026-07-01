import {
  itemBrokenKey, isItemBroken, isRepairable, breakItem, repairItem,
  unlockRepairs, hasLockedBroken,
} from './itemBroken';

describe('itemBrokenKey', () => {
  it('keys the overlay per character', () => {
    expect(itemBrokenKey('wiz')).toBe('cnmh_itembroken_wiz');
    expect(itemBrokenKey()).toBe('cnmh_itembroken_unknown');
  });
});

describe('breakItem / isItemBroken / isRepairable', () => {
  it('marks an item broken and not yet repairable', () => {
    const next = breakItem({}, 'sceptre-1');
    expect(isItemBroken(next, 'sceptre-1')).toBe(true);
    expect(isRepairable(next, 'sceptre-1')).toBe(false);
  });

  it('is a no-op for a null uid', () => {
    expect(breakItem({ a: { repairable: false } }, null)).toEqual({ a: { repairable: false } });
  });

  it('does not mutate the input', () => {
    const prev = {};
    breakItem(prev, 'x');
    expect(prev).toEqual({});
  });

  it('reports not-broken for absent uids', () => {
    expect(isItemBroken({}, 'x')).toBe(false);
    expect(isItemBroken(null, 'x')).toBe(false);
  });
});

describe('unlockRepairs / hasLockedBroken', () => {
  it('flips locked broken items to repairable', () => {
    const overlay = { a: { repairable: false }, b: { repairable: false } };
    expect(hasLockedBroken(overlay)).toBe(true);
    const unlocked = unlockRepairs(overlay);
    expect(unlocked).toEqual({ a: { repairable: true }, b: { repairable: true } });
    expect(hasLockedBroken(unlocked)).toBe(false);
  });

  it('returns the same reference when nothing is locked (no-op write)', () => {
    const overlay = { a: { repairable: true } };
    expect(unlockRepairs(overlay)).toBe(overlay);
    expect(hasLockedBroken(overlay)).toBe(false);
  });

  it('handles an empty/undefined overlay', () => {
    expect(unlockRepairs(undefined)).toEqual({});
    expect(hasLockedBroken(undefined)).toBe(false);
  });
});

describe('repairItem', () => {
  it('clears a broken item', () => {
    const overlay = { a: { repairable: true }, b: { repairable: false } };
    expect(repairItem(overlay, 'a')).toEqual({ b: { repairable: false } });
  });

  it('is a no-op for an unknown uid', () => {
    const overlay = { a: { repairable: true } };
    expect(repairItem(overlay, 'z')).toEqual(overlay);
    expect(repairItem(null, 'z')).toEqual({});
  });
});
