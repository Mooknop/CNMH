import { buildEffectiveInventory } from './effectiveInventory';

// Authored (resolved) tree: a worn sword, a backpack (container) holding a
// torch and rope. uids mirror the Slice 1 scheme.
const tree = () => [
  { uid: 'c-0', ref: 'sword', weight: 1, quantity: 1 },
  {
    uid: 'c-1',
    ref: 'backpack',
    weight: 0.1,
    quantity: 1,
    container: {
      capacity: 4,
      ignored: 2,
      contents: [
        { uid: 'c-2', ref: 'torch', weight: 0.1, quantity: 5 },
        { uid: 'c-3', ref: 'rope', weight: 1, quantity: 1 },
      ],
    },
  },
];

const topUids = (eff) => eff.map((e) => e.uid);
const find = (eff, uid) => {
  for (const e of eff) {
    if (e.uid === uid) return e;
    if (e.container) {
      const hit = e.container.contents.find((c) => c.uid === uid);
      if (hit) return hit;
    }
  }
  return undefined;
};

describe('buildEffectiveInventory', () => {
  it('returns [] for empty/invalid input', () => {
    expect(buildEffectiveInventory(null, {})).toEqual([]);
    expect(buildEffectiveInventory(undefined, undefined)).toEqual([]);
    expect(buildEffectiveInventory([], {})).toEqual([]);
  });

  it('empty loadout: structure preserved, derived state stamped', () => {
    const eff = buildEffectiveInventory(tree(), {});
    expect(topUids(eff)).toEqual(['c-0', 'c-1']);
    expect(find(eff, 'c-0').state).toBe('worn'); // top-level default
    expect(find(eff, 'c-1').state).toBe('worn'); // container itself, default
    expect(find(eff, 'c-2').state).toBe('stowed'); // contents always stowed
    expect(find(eff, 'c-3').state).toBe('stowed');
    // intrinsic fields untouched
    expect(find(eff, 'c-1').container.capacity).toBe(4);
    expect(find(eff, 'c-2').quantity).toBe(5);
  });

  it('applies a top-level state override (held / dropped)', () => {
    const eff = buildEffectiveInventory(tree(), {
      'c-0': { state: 'held2' },
      'c-1': { state: 'dropped' },
    });
    expect(find(eff, 'c-0').state).toBe('held2');
    expect(find(eff, 'c-1').state).toBe('dropped');
  });

  it('normalizes a bogus/unknown state to worn', () => {
    const eff = buildEffectiveInventory(tree(), { 'c-0': { state: 'banana' } });
    expect(find(eff, 'c-0').state).toBe('worn');
  });

  it('stows a top-level item into a container (relocation + stowed)', () => {
    const eff = buildEffectiveInventory(tree(), { 'c-0': { container: 'c-1' } });
    expect(topUids(eff)).toEqual(['c-1']); // sword left the top level
    const bp = find(eff, 'c-1');
    // children grouped in authored DFS order (sword visited before contents)
    expect(bp.container.contents.map((c) => c.uid)).toEqual(['c-0', 'c-2', 'c-3']);
    expect(find(eff, 'c-0').state).toBe('stowed');
  });

  it('retrieves an in-container item to the top level (container:null)', () => {
    const eff = buildEffectiveInventory(tree(), {
      'c-2': { container: null, state: 'held1' },
    });
    // containers keep their authored slot; the retrieved item lands at its
    // authored DFS position (after the backpack it came from)
    expect(topUids(eff)).toEqual(['c-0', 'c-1', 'c-2']);
    expect(find(eff, 'c-2').state).toBe('held1');
    expect(find(eff, 'c-1').container.contents.map((c) => c.uid)).toEqual(['c-3']);
  });

  it('moves an item directly between two containers', () => {
    const two = [
      ...tree(),
      { uid: 'c-4', ref: 'pouch', weight: 0.1, quantity: 1, container: { ignored: 0, contents: [] } },
    ];
    const eff = buildEffectiveInventory(two, { 'c-2': { container: 'c-4' } });
    expect(find(eff, 'c-1').container.contents.map((c) => c.uid)).toEqual(['c-3']);
    expect(find(eff, 'c-4').container.contents.map((c) => c.uid)).toEqual(['c-2']);
    expect(find(eff, 'c-2').state).toBe('stowed');
  });

  it('keeps a container at the top level even if a move targets it elsewhere (depth-1)', () => {
    const two = [
      ...tree(),
      { uid: 'c-4', ref: 'pouch', weight: 0.1, quantity: 1, container: { ignored: 0, contents: [] } },
    ];
    const eff = buildEffectiveInventory(two, { 'c-1': { container: 'c-4' } });
    expect(topUids(eff)).toContain('c-1'); // backpack stays top-level
    expect(find(eff, 'c-4').container.contents).toEqual([]);
  });

  it('ignores a move whose target is unknown or not a container (→ top-level, never orphaned)', () => {
    const eff = buildEffectiveInventory(tree(), {
      'c-2': { container: 'nope' }, // unknown
      'c-3': { container: 'c-0' }, // c-0 is the sword, not a container
    });
    expect(topUids(eff)).toEqual(['c-0', 'c-1', 'c-2', 'c-3']);
    expect(find(eff, 'c-1').container.contents).toEqual([]);
    expect(find(eff, 'c-2').state).toBe('worn');
  });

  it('ignores loadout keys for uids that no longer exist', () => {
    const eff = buildEffectiveInventory(tree(), { 'ghost-9': { state: 'dropped' } });
    expect(topUids(eff)).toEqual(['c-0', 'c-1']);
    expect(find(eff, 'c-0').state).toBe('worn');
  });

  it('does not mutate the input tree', () => {
    const input = tree();
    const snapshot = JSON.stringify(input);
    buildEffectiveInventory(input, { 'c-0': { container: 'c-1', state: 'held1' } });
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  // Slice B: `hand` is carried onto the effective entry for the two-slot UI.
  it('carries `hand` through onto a held1 entry; omits it otherwise', () => {
    const eff = buildEffectiveInventory(tree(), {
      'c-0': { state: 'held1', hand: 2 },
    });
    const sword = find(eff, 'c-0');
    expect(sword.state).toBe('held1');
    expect(sword.hand).toBe(2);
    // an entry with no hand override has no `hand` key
    expect('hand' in find(eff, 'c-1')).toBe(false);
  });

  it('does not stamp `hand` on stowed container contents', () => {
    const eff = buildEffectiveInventory(tree(), {
      'c-2': { hand: 1 }, // nonsensical on a stowed item — must be ignored
    });
    const torch = find(eff, 'c-2');
    expect(torch.state).toBe('stowed');
    expect('hand' in torch).toBe(false);
  });
});
