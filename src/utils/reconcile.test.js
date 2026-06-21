import {
  computePendingChanges,
  PENDING_KINDS,
  DURABLE_OVERLAYS,
  EPHEMERAL_OVERLAYS,
} from './reconcile';

const resolved = () => ({
  id: 'c1',
  name: 'Ashka',
  inventory: [
    { uid: 'p1', name: 'Healing Potion', quantity: 3, weight: 0.1, consumable: { kind: 'healing' } },
    { uid: 'sw', name: 'Sword', quantity: 1, weight: 1 },
  ],
});

const raw = () => ({
  id: 'c1',
  name: 'Ashka',
  inventory: [
    { ref: 'healing-potion', uid: 'p1', quantity: 3 },
    { ref: 'sword', uid: 'sw' },
  ],
});

describe('computePendingChanges — guards', () => {
  it('returns [] for a missing resolved or raw doc', () => {
    expect(computePendingChanges(null, raw(), {})).toEqual([]);
    expect(computePendingChanges(resolved(), null, {})).toEqual([]);
  });

  it('returns [] when nothing has been consumed', () => {
    expect(computePendingChanges(resolved(), raw(), { consumed: {} })).toEqual([]);
    expect(computePendingChanges(resolved(), raw(), undefined)).toEqual([]);
  });

  it('ignores a zero counter', () => {
    expect(computePendingChanges(resolved(), raw(), { consumed: { 'Healing Potion': 0 } })).toEqual([]);
  });
});

describe('computePendingChanges — consumed overlay', () => {
  it('emits a decrement for a partially-used stack', () => {
    const changes = computePendingChanges(resolved(), raw(), { consumed: { 'Healing Potion': 2 } });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: PENDING_KINDS.CONSUMABLE_DECREMENT,
      charId: 'c1',
      overlay: 'consumed',
      overlayRef: 'Healing Potion',
      label: 'Healing Potion',
      before: 3,
      after: 1,
      detail: '3 → 1',
    });
  });

  it('decrement apply lowers the doc entry quantity to the remaining count', () => {
    const change = computePendingChanges(resolved(), raw(), { consumed: { 'Healing Potion': 2 } })[0];
    const next = change.apply(raw());
    expect(next.inventory.find((e) => e.uid === 'p1').quantity).toBe(1);
    expect(next.inventory.find((e) => e.uid === 'sw')).toBeDefined(); // untouched
  });

  it('emits a remove for a fully-used stack', () => {
    const changes = computePendingChanges(resolved(), raw(), { consumed: { 'Healing Potion': 3 } });
    expect(changes[0]).toMatchObject({ kind: PENDING_KINDS.CONSUMABLE_REMOVE, after: 0, detail: 'used up (3 → 0)' });
  });

  it('remove apply deletes the doc entry', () => {
    const change = computePendingChanges(resolved(), raw(), { consumed: { 'Healing Potion': 3 } })[0];
    const next = change.apply(raw());
    expect(next.inventory.find((e) => e.uid === 'p1')).toBeUndefined();
    expect(next.inventory).toHaveLength(1);
  });

  it('treats overuse (count beyond stock) as a remove, never negative quantity', () => {
    const changes = computePendingChanges(resolved(), raw(), { consumed: { 'Healing Potion': 9 } });
    expect(changes[0].kind).toBe(PENDING_KINDS.CONSUMABLE_REMOVE);
    expect(changes[0].after).toBe(0);
  });

  it('handles multiple consumed items independently', () => {
    const res = resolved();
    res.inventory.push({ uid: 'sc', name: 'Scroll of Heal', quantity: 1, scroll: { name: 'Heal', level: 1 } });
    const changes = computePendingChanges(res, raw(), { consumed: { 'Healing Potion': 1, 'Scroll of Heal': 1 } });
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.kind)).toEqual([
      PENDING_KINDS.CONSUMABLE_DECREMENT, // potion 3 → 2
      PENDING_KINDS.CONSUMABLE_REMOVE, // scroll 1 → 0
    ]);
  });

  it('matches a legacy inline entry (no uid) by name', () => {
    const res = { id: 'c1', name: 'Ashka', inventory: [{ name: 'Elixir', quantity: 2, consumable: { kind: 'healing' } }] };
    const doc = { id: 'c1', inventory: [{ name: 'Elixir', quantity: 2 }] };
    const change = computePendingChanges(res, doc, { consumed: { Elixir: 2 } })[0];
    const next = change.apply(doc);
    expect(next.inventory).toEqual([]);
  });

  it('reaches a consumable nested inside a container', () => {
    const res = {
      id: 'c1', name: 'Ashka',
      inventory: [{
        uid: 'pack', name: 'Backpack', weight: 0.1,
        container: { capacity: 4, contents: [{ uid: 'p1', name: 'Healing Potion', quantity: 2, consumable: { kind: 'healing' } }] },
      }],
    };
    const doc = {
      id: 'c1',
      inventory: [{ ref: 'backpack', uid: 'pack', container: { capacity: 4, contents: [{ ref: 'healing-potion', uid: 'p1', quantity: 2 }] } }],
    };
    const change = computePendingChanges(res, doc, { consumed: { 'Healing Potion': 2 } })[0];
    expect(change.kind).toBe(PENDING_KINDS.CONSUMABLE_REMOVE);
    const next = change.apply(doc);
    expect(next.inventory[0].container.contents).toEqual([]); // potion gone
    expect(next.inventory[0].uid).toBe('pack'); // container kept
  });
});

describe('computePendingChanges — apply purity & idempotency', () => {
  it('does not mutate the raw doc passed to apply', () => {
    const change = computePendingChanges(resolved(), raw(), { consumed: { 'Healing Potion': 2 } })[0];
    const doc = raw();
    change.apply(doc);
    expect(doc.inventory[0].quantity).toBe(3); // original untouched
  });

  it('re-applying a committed decrement is a no-op (idempotent)', () => {
    const change = computePendingChanges(resolved(), raw(), { consumed: { 'Healing Potion': 2 } })[0];
    const once = change.apply(raw());
    const twice = change.apply(once);
    expect(twice.inventory.find((e) => e.uid === 'p1').quantity).toBe(1);
  });

  it('commits the live `after` against a freshly-read doc, whatever its current quantity', () => {
    const change = computePendingChanges(resolved(), raw(), { consumed: { 'Healing Potion': 2 } })[0];
    const fresh = raw();
    fresh.inventory[0].quantity = 5; // a concurrent edit
    const next = change.apply(fresh);
    expect(next.inventory.find((e) => e.uid === 'p1').quantity).toBe(1);
  });
});

describe('computePendingChanges — durable allowlist', () => {
  it('every emitted change is sourced from a durable overlay', () => {
    const changes = computePendingChanges(resolved(), raw(), { consumed: { 'Healing Potion': 2 } });
    changes.forEach((c) => expect(DURABLE_OVERLAYS).toContain(c.overlay));
  });

  it('never surfaces a change from an ephemeral overlay', () => {
    const overlays = { consumed: { 'Healing Potion': 1 } };
    EPHEMERAL_OVERLAYS.forEach((k) => { overlays[k] = { junk: true }; });
    const changes = computePendingChanges(resolved(), raw(), overlays);
    expect(changes).toHaveLength(1); // only the consumed one
    changes.forEach((c) => expect(EPHEMERAL_OVERLAYS).not.toContain(c.overlay));
  });

  it('does not yet surface gold / loadout / acquired / removed (stub computers)', () => {
    const changes = computePendingChanges(resolved(), raw(), {
      gold: 999,
      loadout: { p1: { state: 'dropped' } },
      acquired: [{ ref: 'dagger', uid: 'x' }],
      removed: ['sw'],
    });
    expect(changes).toEqual([]);
  });
});
