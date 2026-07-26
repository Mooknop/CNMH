import { describe, it, expect } from 'vitest';
import {
  consumedKeyOf,
  consumedCountBy,
  consumedCountFor,
  consumedEntryKey,
  recordConsumed,
  recordConsumedBy,
  restoreConsumed,
} from './consumedLedger';
import { itemUidOf } from './affix';

const flask = (uid, quantity = 2) => ({
  uid, id: 'acid-flask', name: 'Acid Flask', quantity, traits: ['Consumable'],
});

describe('consumedKeyOf', () => {
  it('prefers the loadout uid, then the authored id, then the name', () => {
    expect(consumedKeyOf({ uid: 'u1', id: 'acid-flask', name: 'Acid Flask' })).toBe('u1');
    expect(consumedKeyOf({ id: 'acid-flask', name: 'Acid Flask' })).toBe('acid-flask');
    expect(consumedKeyOf({ name: 'Acid Flask' })).toBe('Acid Flask');
    expect(consumedKeyOf(null)).toBeNull();
  });

  // The ledger key is a deliberate copy of affix.js's itemUidOf (importing it
  // would make the two modules circular). Pin them together.
  it('agrees with itemUidOf', () => {
    const cases = [
      { uid: 'u1', id: 'i1', name: 'n' },
      { id: 'i1', name: 'n' },
      { name: 'n' },
      {},
      null,
      undefined,
    ];
    cases.forEach((c) => expect(consumedKeyOf(c)).toBe(itemUidOf(c)));
  });
});

describe('consumedCountBy', () => {
  it('reads the uid entry when there is one', () => {
    expect(consumedCountBy({ u1: 2 }, 'u1', 'Acid Flask')).toBe(2);
  });

  it('falls back to a legacy name entry when the uid has none', () => {
    expect(consumedCountBy({ 'Acid Flask': 3 }, 'u1', 'Acid Flask')).toBe(3);
  });

  it('never sums the two — a legacy entry and its uid successor count once', () => {
    // The seeded uid entry already contains the legacy count; summing would
    // subtract the same burns twice.
    expect(consumedCountBy({ 'Acid Flask': 2, u1: 3 }, 'u1', 'Acid Flask')).toBe(3);
  });

  it('counts once when the uid IS the name (item with no uid/id)', () => {
    expect(consumedCountBy({ 'Acid Flask': 2 }, 'Acid Flask', 'Acid Flask')).toBe(2);
  });

  it('tolerates junk overlays and negative/NaN counts', () => {
    expect(consumedCountBy(null, 'u1', 'n')).toBe(0);
    expect(consumedCountBy('nope', 'u1', 'n')).toBe(0);
    expect(consumedCountBy({ u1: -4 }, 'u1', 'n')).toBe(0);
    expect(consumedCountBy({ u1: 'x' }, 'u1', 'n')).toBe(0);
    expect(consumedCountBy({}, null, null)).toBe(0);
  });
});

describe('consumedEntryKey', () => {
  it('reports the key a read resolved through', () => {
    const item = flask('u1');
    expect(consumedEntryKey({ u1: 1 }, item)).toBe('u1');
    expect(consumedEntryKey({ 'Acid Flask': 1 }, item)).toBe('Acid Flask');
    expect(consumedEntryKey({ 'Acid Flask': 1, u1: 2 }, item)).toBe('u1');
    expect(consumedEntryKey({}, item)).toBe('u1'); // the key a write would create
  });
});

describe('recordConsumed', () => {
  it('writes against the uid, not the name', () => {
    expect(recordConsumed({}, flask('u1'))).toEqual({ u1: 1 });
  });

  it('is immutable', () => {
    const before = { u1: 1 };
    const after = recordConsumed(before, flask('u1'));
    expect(before).toEqual({ u1: 1 });
    expect(after).toEqual({ u1: 2 });
  });

  it('accumulates on the uid entry', () => {
    expect(recordConsumed({ u1: 2 }, flask('u1'))).toEqual({ u1: 3 });
  });

  it('records n at once (partial give, #657)', () => {
    expect(recordConsumed({}, flask('u1', 5), 3)).toEqual({ u1: 3 });
  });

  it('seeds the first uid write from a legacy name entry, leaving it in place', () => {
    // Non-destructive: the legacy entry stays for any *other* stack still
    // reading it, but this stack now reads its own uid slot.
    expect(recordConsumed({ 'Acid Flask': 1 }, flask('u1'))).toEqual({
      'Acid Flask': 1,
      u1: 2,
    });
  });

  it('leaves two same-named stacks independent', () => {
    let map = {};
    map = recordConsumed(map, flask('u1'));
    map = recordConsumed(map, flask('u1'));
    map = recordConsumed(map, flask('u2'));
    expect(map).toEqual({ u1: 2, u2: 1 });
  });

  it('is a no-op without any identity', () => {
    expect(recordConsumedBy({ a: 1 }, null, null)).toEqual({ a: 1 });
    expect(recordConsumedBy({ a: 1 }, 'a', 'a', 0)).toEqual({ a: 1 });
  });
});

describe('restoreConsumed', () => {
  it('decrements the uid entry and never goes below zero', () => {
    expect(restoreConsumed({ u1: 2 }, flask('u1'))).toEqual({ u1: 1 });
    expect(restoreConsumed({ u1: 0 }, flask('u1'))).toEqual({ u1: 0 });
    expect(restoreConsumed({}, flask('u1'))).toEqual({ u1: 0 });
  });

  it('migrates a legacy name entry into the uid on undo', () => {
    expect(restoreConsumed({ 'Acid Flask': 2 }, flask('u1'))).toEqual({
      'Acid Flask': 2,
      u1: 1,
    });
  });
});

describe('consumedCountFor', () => {
  it('resolves an item through its uid then its name', () => {
    expect(consumedCountFor(flask('u1'), { u1: 4 })).toBe(4);
    expect(consumedCountFor(flask('u1'), { 'Acid Flask': 4 })).toBe(4);
    expect(consumedCountFor(flask('u1'), {})).toBe(0);
  });
});
