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

  it('tolerates a non-array focusSpells (e.g. a focus-point pool object)', () => {
    // A sorcerer sheet may carry spellcasting.focus as a { max, current } pool;
    // if that leaks in as focusSpells it must not crash the .filter (the bug
    // that blacked out the encounter tab). The reactions still come through.
    const reactions = [{ name: 'Nimble Dodge' }];
    expect(() =>
      buildReactionSources({ reactions, focusSpells: { max: 1, current: 1 } })
    ).not.toThrow();
    expect(buildReactionSources({ reactions, focusSpells: { max: 1, current: 1 } })).toEqual(reactions);
  });

  it('includes reaction-cost spells from the repertoire / innate / wand / scroll lists (#482)', () => {
    const out = buildReactionSources({
      repertoireSpells: [
        { name: 'Feather Fall', actions: 'Reaction', level: 1 },
        { name: 'Fireball', actions: 'Two Actions', level: 3 },
      ],
      innateSpells: [
        { name: 'Shield', actions: 'Reaction', innate: true },
        { name: 'Detect Magic', actions: 'Two Actions', innate: true },
      ],
      wandSpells: [{ name: 'Gentle Landing', actions: 'Reaction', fromWand: true, active: true }],
      scrollSpells: [{ name: 'Feather Fall (Scroll)', actions: 'Reaction', fromScroll: true, active: true }],
    });
    const names = out.map((r) => r.name);

    expect(names).toEqual(
      expect.arrayContaining(['Feather Fall', 'Shield', 'Gentle Landing', 'Feather Fall (Scroll)'])
    );
    expect(names).not.toContain('Fireball'); // not a reaction cost
    expect(names).not.toContain('Detect Magic'); // not a reaction cost
  });

  it('tags every spell-sourced reaction with isSpell (and preserves source flags + active)', () => {
    const out = buildReactionSources({
      staffSpells: [{ name: 'Overselling Flourish', actions: 'Reaction', fromStaff: true, active: true }],
      repertoireSpells: [{ name: 'Feather Fall', actions: 'Reaction' }],
      innateSpells: [{ name: 'Shield', actions: 'Reaction', innate: true }],
      wandSpells: [{ name: 'Gentle Landing', actions: 'Reaction', fromWand: true, active: false }],
      scrollSpells: [{ name: 'Heal', actions: 'Reaction', fromScroll: true, active: true }],
    });
    out.forEach((r) => expect(r.isSpell).toBe(true));

    // A stowed wand/scroll keeps active:false so the gating layer can block it.
    expect(out.find((r) => r.name === 'Gentle Landing').active).toBe(false);
    // A repertoire spell carries no source flag — castSourceOf falls through to slot.
    expect(out.find((r) => r.name === 'Feather Fall').fromWand).toBeUndefined();
  });

  it('keeps plain (non-spell) reactions untagged', () => {
    const out = buildReactionSources({ reactions: [{ name: 'Nimble Dodge' }] });
    expect(out[0].isSpell).toBeUndefined();
  });

  it('castSourceOf maps every cast-list flag', () => {
    expect(castSourceOf({ fromStaff: true })).toBe('staff');
    expect(castSourceOf({ fromFocus: true })).toBe('focus');
    expect(castSourceOf({ fromWand: true })).toBe('wand');
    expect(castSourceOf({ fromScroll: true })).toBe('scroll');
    expect(castSourceOf({ innate: true })).toBe('innate');
    expect(castSourceOf({ fromInnate: true })).toBe('innate');
    // Repertoire spell (isSpell, no source flag) and plain reaction both → undefined.
    expect(castSourceOf({ isSpell: true, name: 'Feather Fall' })).toBeUndefined();
    expect(castSourceOf({ name: 'Nimble Dodge' })).toBeUndefined();
    expect(castSourceOf(null)).toBeUndefined();
  });
});
