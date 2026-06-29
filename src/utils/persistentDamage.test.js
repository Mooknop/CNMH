// Persistent-damage tracking algebra (#272): instance minting, map
// add/remove/prune, confirm-time collection, and the reminder/clearance
// log formats.

import {
  newPersistentId,
  makeInstances,
  addPersistent,
  removeInstance,
  pruneOrphans,
  collectFromResults,
  formatReminder,
  formatClearance,
  persistentVsType,
  recoveryDc,
} from './persistentDamage';

describe('newPersistentId', () => {
  it('mints unique pd-prefixed ids', () => {
    const a = newPersistentId();
    const b = newPersistentId();
    expect(a).toMatch(/^pd-/);
    expect(a).not.toBe(b);
  });
});

describe('makeInstances', () => {
  it('stamps source and keeps dice/type', () => {
    const out = makeInstances(
      [{ dice: '1d4', type: 'electricity', label: 'Persistent electricity' }],
      'Lightning Bolt'
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ dice: '1d4', type: 'electricity', sourceName: 'Lightning Bolt' });
    expect(out[0].id).toMatch(/^pd-/);
    expect(out[0].half).toBeUndefined();
  });

  it('carries the basic-save half flag and drops diceless entries', () => {
    const out = makeInstances(
      [{ dice: '2d6', type: 'fire', half: true }, { type: 'bleed' }],
      'Fireball'
    );
    expect(out).toHaveLength(1);
    expect(out[0].half).toBe(true);
  });
});

describe('addPersistent / removeInstance', () => {
  it('appends to existing instances for the same entry', () => {
    const first = makeInstances([{ dice: '1d4', type: 'bleed' }], 'Shard Strike');
    const second = makeInstances([{ dice: '1d6', type: 'electricity' }], 'Polarize');
    let map = addPersistent({}, 'e-1', first);
    map = addPersistent(map, 'e-1', second);
    expect(map['e-1']).toHaveLength(2);
  });

  it('is a no-op for empty instances', () => {
    const map = { 'e-1': makeInstances([{ dice: '1d4', type: 'bleed' }], 'x') };
    expect(addPersistent(map, 'e-2', [])).toBe(map);
  });

  it('removes one instance and drops the key when the list empties', () => {
    const instances = makeInstances(
      [{ dice: '1d4', type: 'bleed' }, { dice: '1d6', type: 'fire' }],
      'x'
    );
    const map = { 'e-1': instances };
    const afterOne = removeInstance(map, 'e-1', instances[0].id);
    expect(afterOne['e-1']).toHaveLength(1);
    const afterBoth = removeInstance(afterOne, 'e-1', instances[1].id);
    expect(afterBoth['e-1']).toBeUndefined();
  });

  it('returns the same reference when nothing matches', () => {
    const map = { 'e-1': makeInstances([{ dice: '1d4', type: 'bleed' }], 'x') };
    expect(removeInstance(map, 'e-1', 'pd-nope')).toBe(map);
    expect(removeInstance(map, 'e-9', 'pd-nope')).toBe(map);
  });
});

describe('pruneOrphans', () => {
  const order = [{ entryId: 'e-1' }, { entryId: 'e-2' }];

  it('drops keys for combatants no longer in the order', () => {
    const map = { 'e-1': [{ id: 'pd-a' }], 'e-gone': [{ id: 'pd-b' }] };
    const pruned = pruneOrphans(map, order);
    expect(Object.keys(pruned)).toEqual(['e-1']);
  });

  it('returns the same reference when nothing is orphaned', () => {
    const map = { 'e-1': [{ id: 'pd-a' }] };
    expect(pruneOrphans(map, order)).toBe(map);
  });
});

describe('collectFromResults', () => {
  it('collects per-target persistent from ray groups, skipping clean hits', () => {
    const rayGroups = [
      {
        rayIndex: null,
        results: [
          { entryId: 'e-1', damage: { final: 12, persistent: [{ dice: '2d4', type: 'electricity' }] } },
          { entryId: 'e-2', damage: { final: 8, persistent: [] } },
          { entryId: 'e-3', damage: null },
        ],
      },
    ];
    const hits = collectFromResults(rayGroups, null);
    expect(hits).toEqual([
      { entryId: 'e-1', persistent: [{ dice: '2d4', type: 'electricity' }] },
    ]);
  });

  it('accumulates chained-strike persistent on the same target', () => {
    const chainResults = {
      rolls: [
        [{ entryId: 'e-1', damage: { final: 6, persistent: [{ dice: '1d4', type: 'bleed' }] } }],
        [{ entryId: 'e-1', damage: { final: 5, persistent: [{ dice: '1d4', type: 'bleed' }] } }],
        null,
      ],
    };
    const hits = collectFromResults([], chainResults);
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.entryId === 'e-1')).toBe(true);
  });
});

describe('formatters', () => {
  it('formats the end-of-turn reminder per the issue', () => {
    expect(formatReminder('Goblin', { dice: '1d4', type: 'electricity' })).toBe(
      'Goblin: 1d4 persistent electricity — DC 15 flat check to end'
    );
  });

  it('falls back to "damage" for untyped entries and marks half', () => {
    expect(formatReminder('Goblin', { dice: '1d6', type: '', half: true })).toBe(
      'Goblin: 1d6 persistent damage (half) — DC 15 flat check to end'
    );
  });

  it('annotates resistance and the eased recovery DC when a context is passed (#900)', () => {
    expect(
      formatReminder('Ashka', { dice: '1d8', type: 'bleed' }, { amount: 5, easeFlatCheck: true })
    ).toBe('Ashka: 1d8 persistent bleed, resistance 5 (reduce, min 0) — DC 10 flat check to end');
  });

  it('keeps DC 15 and omits the note when the resistance context is zero/null (#900)', () => {
    expect(formatReminder('Ashka', { dice: '1d8', type: 'bleed' }, { amount: 0, easeFlatCheck: false })).toBe(
      'Ashka: 1d8 persistent bleed — DC 15 flat check to end'
    );
    expect(formatReminder('Ashka', { dice: '1d8', type: 'bleed' }, null)).toBe(
      'Ashka: 1d8 persistent bleed — DC 15 flat check to end'
    );
  });

  it('eases the DC even when the matching resistance amount is 0 (#900)', () => {
    expect(formatReminder('Ashka', { dice: '1d8', type: 'bleed' }, { amount: 0, easeFlatCheck: true })).toBe(
      'Ashka: 1d8 persistent bleed — DC 10 flat check to end'
    );
  });

  it('formats clearance for both paths', () => {
    expect(formatClearance('Goblin', { dice: '1d4', type: 'bleed' }, 'flat-check')).toBe(
      'Goblin: 1d4 persistent bleed ended (flat check)'
    );
    expect(formatClearance('Goblin', { dice: '1d4', type: 'bleed' }, 'healed')).toBe(
      'Goblin: 1d4 persistent bleed ended (healed)'
    );
  });
});

describe('resistance helpers (#900)', () => {
  it('builds the persistent- prefixed resistance descriptor from an instance type', () => {
    expect(persistentVsType({ type: 'bleed' })).toBe('persistent-bleed');
    expect(persistentVsType({ type: 'poison' })).toBe('persistent-poison');
    expect(persistentVsType({})).toBe('persistent-');
    expect(persistentVsType(null)).toBe('persistent-');
  });

  it('eases the recovery DC only when the context flags it', () => {
    expect(recoveryDc({ easeFlatCheck: true })).toBe(10);
    expect(recoveryDc({ easeFlatCheck: false })).toBe(15);
    expect(recoveryDc(null)).toBe(15);
  });
});
