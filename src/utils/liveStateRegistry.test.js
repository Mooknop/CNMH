import {
  LIVE_STATE_GROUPS,
  LIVE_STATE_REGISTRY,
  getLiveStateDescriptor,
  formatLiveValue,
  partitionLiveState,
} from './liveStateRegistry';

describe('liveStateRegistry — descriptors', () => {
  it('every descriptor belongs to a declared group and has a label + format', () => {
    const groupKeys = new Set(LIVE_STATE_GROUPS.map((g) => g.key));
    for (const d of LIVE_STATE_REGISTRY) {
      expect(groupKeys.has(d.group)).toBe(true);
      expect(typeof d.label).toBe('string');
      expect(typeof d.format).toBe('function');
    }
  });

  it('types are unique and single-token (no underscores — synced-key constraint)', () => {
    const types = LIVE_STATE_REGISTRY.map((d) => d.type);
    expect(new Set(types).size).toBe(types.length);
    for (const t of types) expect(t).not.toMatch(/_/);
  });

  it('getLiveStateDescriptor resolves known and rejects unknown', () => {
    expect(getLiveStateDescriptor('focus')?.label).toBe('Focus points');
    expect(getLiveStateDescriptor('nope')).toBeUndefined();
  });
});

describe('formatLiveValue — formatters', () => {
  it('turnstate summarises actions + reaction', () => {
    expect(formatLiveValue('turnstate', { actionsSpent: 2, reactionSpent: true })).toBe(
      '2/3 actions, reaction spent',
    );
    expect(formatLiveValue('turnstate', { actionsSpent: 0, attacksMade: 1 })).toBe(
      '0/3 actions, 1 attack (MAP), reaction ready',
    );
  });

  it('focus uses character max to show remaining/max', () => {
    const character = { spellcasting: { focus: { max: 3 } } };
    expect(formatLiveValue('focus', 1, character)).toBe('2/3');
    expect(formatLiveValue('focus', 0)).toBe('full'); // no character → spent-only
  });

  it('slots show remaining/total per rank from character totals', () => {
    const character = { spellcasting: { spell_slots: { 1: 3, 2: 2, cantrips: 5 } } };
    expect(formatLiveValue('slots', { 1: 1, 2: 0 }, character)).toBe('R1 2/3, R2 2/2');
  });

  it('wands count used vs total', () => {
    expect(formatLiveValue('wands', { a: 'used', b: 'available' })).toBe('1 of 2 used');
    expect(formatLiveValue('wands', {})).toBe('none');
  });

  it('list shapes degrade to none when empty', () => {
    expect(formatLiveValue('conditions', [])).toBe('none');
    expect(formatLiveValue('sustains', [{ spellName: 'Mirror Image' }])).toBe('Mirror Image');
    expect(formatLiveValue('conditions', [{ id: 'frightened', value: 2 }])).toBe('frightened 2');
  });

  it('toggles + flags read sensibly', () => {
    expect(formatLiveValue('aura', { active: true })).toBe('active');
    expect(formatLiveValue('shieldraise', { raised: true })).toBe('raised');
    expect(formatLiveValue('stance', { active: true, name: 'Mountain Stance' })).toBe('Mountain Stance');
    expect(formatLiveValue('huntprey', { targetName: 'Goblin' })).toBe('prey: Goblin');
  });

  it('falls back to JSON for unregistered types and never throws on bad shapes', () => {
    expect(formatLiveValue('mystery', { x: 1 })).toBe('{"x":1}');
    expect(() => formatLiveValue('slots', null)).not.toThrow();
    expect(() => formatLiveValue('conditions', 'garbage')).not.toThrow();
  });
});

describe('partitionLiveState — known vs raw escape hatch', () => {
  it('groups known keys in declared order and collects unknown ones', () => {
    const live = {
      focus: 1,
      turnstate: { actionsSpent: 1 },
      mystery_blob: { foo: 1 }, // unknown → raw
      stance: { active: false },
      somethingNew: [1, 2, 3], // unknown → raw
    };
    const { groups, unrecognized } = partitionLiveState(live);

    // Only groups with entries are returned, in LIVE_STATE_GROUPS order.
    expect(groups.map((g) => g.key)).toEqual(['turn', 'resources', 'combat']);
    expect(groups.find((g) => g.key === 'resources').entries.map((e) => e.type)).toEqual(['focus']);

    // Unknown keys land in the raw escape hatch, sorted.
    expect(unrecognized.map((u) => u.type)).toEqual(['mystery_blob', 'somethingNew']);
    expect(unrecognized[0].value).toEqual({ foo: 1 });
  });

  it('returns empty partition for empty/garbage input', () => {
    expect(partitionLiveState(null)).toEqual({ groups: [], unrecognized: [] });
    expect(partitionLiveState(undefined)).toEqual({ groups: [], unrecognized: [] });
  });

  it('attaches descriptor + formatted label to each entry', () => {
    const { groups } = partitionLiveState({ focus: 2 }, { spellcasting: { focus: { max: 3 } } });
    const entry = groups[0].entries[0];
    expect(entry.label).toBe('Focus points');
    expect(entry.formatted).toBe('1/3');
    expect(entry.editor).toBe('number');
  });
});
