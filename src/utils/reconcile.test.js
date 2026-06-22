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

  it('does not yet surface loadout (stub computer)', () => {
    const changes = computePendingChanges(resolved(), raw(), {
      loadout: { p1: { state: 'dropped' } },
    });
    expect(changes).toEqual([]);
  });
});

describe('computePendingChanges — acquired overlay (#665)', () => {
  const gift = () => ({ uid: 'g1', name: 'Flaming Longsword', quantity: 1, runes: ['flaming'] });

  it('emits an item-add per acquired entry', () => {
    const changes = computePendingChanges(resolved(), raw(), { acquired: [gift()] });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: PENDING_KINDS.ITEM_ADD,
      charId: 'c1',
      overlay: 'acquired',
      overlayRef: 'g1',
      label: 'Flaming Longsword',
    });
  });

  it('apply appends the entry inline (lossless — per-instance data kept)', () => {
    const change = computePendingChanges(resolved(), raw(), { acquired: [gift()] })[0];
    const next = change.apply(raw());
    const added = next.inventory.find((e) => e.uid === 'g1');
    expect(added).toMatchObject({ name: 'Flaming Longsword', runes: ['flaming'] });
    expect(next.inventory).toHaveLength(3);
  });

  it('apply is idempotent — a uid already in the doc is not re-appended', () => {
    const change = computePendingChanges(resolved(), raw(), { acquired: [gift()] })[0];
    const once = change.apply(raw());
    const twice = change.apply(once);
    expect(twice.inventory.filter((e) => e.uid === 'g1')).toHaveLength(1);
  });

  it('apply does not mutate the raw doc', () => {
    const change = computePendingChanges(resolved(), raw(), { acquired: [gift()] })[0];
    const doc = raw();
    change.apply(doc);
    expect(doc.inventory).toHaveLength(2);
  });

  it('clearOverlay drops the committed entry by uid', () => {
    const overlay = [gift(), { uid: 'g2', name: 'Dagger' }];
    const change = computePendingChanges(resolved(), raw(), { acquired: overlay })[0];
    expect(change.clearOverlay(overlay)).toEqual([{ uid: 'g2', name: 'Dagger' }]);
  });

  it('ignores non-object overlay entries', () => {
    expect(computePendingChanges(resolved(), raw(), { acquired: [null, 5] })).toEqual([]);
  });
});

describe('computePendingChanges — removed overlay (#665)', () => {
  it('emits an item-remove per uid that still exists in the doc', () => {
    const changes = computePendingChanges(resolved(), raw(), { removed: ['sw'] });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: PENDING_KINDS.ITEM_REMOVE,
      charId: 'c1',
      overlay: 'removed',
      overlayRef: 'sw',
      label: 'Sword', // resolved name (doc entry is a bare ref)
    });
  });

  it('apply deletes the doc entry', () => {
    const change = computePendingChanges(resolved(), raw(), { removed: ['sw'] })[0];
    const next = change.apply(raw());
    expect(next.inventory.find((e) => e.uid === 'sw')).toBeUndefined();
    expect(next.inventory).toHaveLength(1);
  });

  it('skips a uid no longer present in the doc (concurrent removal)', () => {
    expect(computePendingChanges(resolved(), raw(), { removed: ['ghost'] })).toEqual([]);
  });

  it('deletes a uid nested inside a container, keeping the container', () => {
    const res = {
      id: 'c1', name: 'Ashka',
      inventory: [{
        uid: 'pack', name: 'Backpack',
        container: { capacity: 4, contents: [{ uid: 'st', name: 'Rope' }] },
      }],
    };
    const doc = {
      id: 'c1',
      inventory: [{ ref: 'backpack', uid: 'pack', container: { capacity: 4, contents: [{ ref: 'rope', uid: 'st' }] } }],
    };
    const change = computePendingChanges(res, doc, { removed: ['st'] })[0];
    expect(change.label).toBe('Rope');
    const next = change.apply(doc);
    expect(next.inventory[0].uid).toBe('pack');
    expect(next.inventory[0].container.contents).toEqual([]);
  });

  it('apply does not mutate the raw doc', () => {
    const change = computePendingChanges(resolved(), raw(), { removed: ['sw'] })[0];
    const doc = raw();
    change.apply(doc);
    expect(doc.inventory).toHaveLength(2);
  });

  it('clearOverlay drops the committed uid', () => {
    const change = computePendingChanges(resolved(), raw(), { removed: ['sw', 'p1'] })[0];
    expect(change.clearOverlay(['sw', 'p1'])).toEqual(['p1']);
  });
});

describe('computePendingChanges — clearOverlay (consumed / gold)', () => {
  it('a consumed change clears its key from the overlay map', () => {
    const change = computePendingChanges(resolved(), raw(), { consumed: { 'Healing Potion': 2 } })[0];
    expect(change.clearOverlay({ 'Healing Potion': 2, Other: 1 })).toEqual({ Other: 1 });
  });

  it('a gold change anchors its overlay — no clearOverlay', () => {
    const change = computePendingChanges(resolved(), raw(), { gold: 30 })[0];
    expect(change.clearOverlay).toBeUndefined();
  });
});

describe('computePendingChanges — gold overlay (#558)', () => {
  it('emits a gold-set when the live overlay differs from the doc', () => {
    const doc = { ...raw(), gold: 40 };
    const changes = computePendingChanges(resolved(), doc, { gold: 55 });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: PENDING_KINDS.GOLD_SET,
      charId: 'c1',
      overlay: 'gold',
      overlayRef: 'gold',
      label: 'Gold',
      before: 40,
      after: 55,
      detail: '40 → 55 gp',
    });
  });

  it('treats a doc with no gold field as 0', () => {
    const changes = computePendingChanges(resolved(), raw(), { gold: 30 });
    expect(changes[0]).toMatchObject({ before: 0, after: 30 });
  });

  it('apply writes the live gold onto the doc', () => {
    const change = computePendingChanges(resolved(), raw(), { gold: 30 })[0];
    expect(change.apply(raw()).gold).toBe(30);
  });

  it('emits nothing when live gold already matches the doc', () => {
    const doc = { ...raw(), gold: 25 };
    expect(computePendingChanges(resolved(), doc, { gold: 25 })).toEqual([]);
  });

  it('emits nothing when there is no gold overlay (no opinion)', () => {
    expect(computePendingChanges(resolved(), raw(), {})).toEqual([]);
    expect(computePendingChanges(resolved(), raw(), { gold: undefined })).toEqual([]);
    expect(computePendingChanges(resolved(), raw(), { gold: 'NaN' })).toEqual([]);
  });

  it('reconciles gold and consumables together in one list', () => {
    const changes = computePendingChanges(resolved(), raw(), {
      consumed: { 'Healing Potion': 3 },
      gold: 12,
    });
    expect(changes.map((c) => c.kind)).toEqual([
      PENDING_KINDS.CONSUMABLE_REMOVE, // consumed runs first in DURABLE_OVERLAYS
      PENDING_KINDS.GOLD_SET,
    ]);
  });
});
