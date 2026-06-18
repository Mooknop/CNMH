import { describe, it, expect } from 'vitest';
import { buildReactionSources, castSourceOf } from './reactionSources';

describe('reactionSources', () => {
  it('combines character reactions + reaction-cost staff + focus spells', () => {
    const reactions = [{ name: 'Nimble Dodge' }];
    const staffSpells = [
      { name: 'Overselling Flourish', actions: 'Reaction', fromStaff: true, active: true },
      { name: 'Mirror Image', actions: 'Two Actions', fromStaff: true, active: true },
    ];
    const focusSpells = [{ spellRef: 'counter-performance' }, { spellRef: 'inspire-courage' }];
    const catalogSpells = [
      { id: 'counter-performance', name: 'Counter Performance', actions: 'Reaction' },
      { id: 'inspire-courage', name: 'Inspire Courage', actions: 'Single Action' },
    ];

    const out = buildReactionSources({ reactions, staffSpells, focusSpells, catalogSpells });
    const names = out.map((r) => r.name);

    expect(names).toContain('Nimble Dodge');
    expect(names).toContain('Overselling Flourish');
    expect(names).toContain('Counter Performance');
    expect(names).not.toContain('Mirror Image'); // not a reaction cost
    expect(names).not.toContain('Inspire Courage'); // not a reaction cost

    // Focus reactions are tagged for the focus-point cast path.
    expect(out.find((r) => r.name === 'Counter Performance').fromFocus).toBe(true);
  });

  it('returns [] and tolerates missing args', () => {
    expect(buildReactionSources()).toEqual([]);
    expect(buildReactionSources({})).toEqual([]);
    expect(buildReactionSources({ reactions: null, staffSpells: null, focusSpells: null })).toEqual([]);
  });

  it('castSourceOf maps the staff/focus flags', () => {
    expect(castSourceOf({ fromStaff: true })).toBe('staff');
    expect(castSourceOf({ fromFocus: true })).toBe('focus');
    expect(castSourceOf({ name: 'Nimble Dodge' })).toBeUndefined();
    expect(castSourceOf(null)).toBeUndefined();
  });
});
