import {
  computeEffectBonuses,
  combineModifiers,
  conditionalModifiersFor,
  conditionalTogglesFor,
  dexCapFor,
  resistanceFor,
  weaknessFor,
  flatCheckEasedFor,
  isEncounterScopedEffect,
  clearsOnDamageType,
} from './EffectUtils';

const catalog = [
  {
    id: 'heroism-1',
    name: 'Heroism 1',
    modifiers: [
      { stat: 'meleeAttack', kind: 'status', amount: 1 },
      { stat: 'rangedAttack', kind: 'status', amount: 1 },
      { stat: 'spellAttack', kind: 'status', amount: 1 },
      { stat: 'perception', kind: 'status', amount: 1 },
      { stat: 'fort', kind: 'status', amount: 1 },
      { stat: 'reflex', kind: 'status', amount: 1 },
      { stat: 'will', kind: 'status', amount: 1 },
    ],
  },
  {
    id: 'heroism-2',
    name: 'Heroism 2',
    modifiers: [
      { stat: 'meleeAttack', kind: 'status', amount: 2 },
      { stat: 'rangedAttack', kind: 'status', amount: 2 },
      { stat: 'perception', kind: 'status', amount: 2 },
    ],
  },
  {
    id: 'bless',
    name: 'Bless',
    modifiers: [{ stat: 'meleeAttack', kind: 'status', amount: 1 }],
  },
  {
    id: 'aid',
    name: 'Aid',
    modifiers: [{ stat: 'meleeAttack', kind: 'circumstance', amount: 2 }],
  },
  {
    id: 'shield-spell',
    name: 'Shield',
    modifiers: [{ stat: 'ac', kind: 'circumstance', amount: 1 }],
  },
  {
    id: 'mage-armor',
    name: 'Mage Armor',
    modifiers: [{ stat: 'ac', kind: 'item', amount: 1 }],
  },
  {
    id: 'no-mods',
    name: 'No Mods',
    modifiers: [],
  },
];

const entry = (id) => ({ id: `uid-${id}`, effectId: id });

describe('computeEffectBonuses', () => {
  describe('with no active effects', () => {
    const result = computeEffectBonuses([], catalog);
    it('returns zero totals for all stats', () => {
      expect(result.meleeAttack.total).toBe(0);
      expect(result.ac.total).toBe(0);
      expect(result.fort.total).toBe(0);
    });
    it('returns empty sources', () => {
      expect(result.meleeAttack.sources).toHaveLength(0);
    });
  });

  describe('with null/undefined active effects', () => {
    it('handles null gracefully', () => {
      expect(() => computeEffectBonuses(null, catalog)).not.toThrow();
      expect(computeEffectBonuses(null, catalog).ac.total).toBe(0);
    });
    it('handles undefined gracefully', () => {
      expect(() => computeEffectBonuses(undefined, catalog)).not.toThrow();
    });
  });

  describe('single status bonus', () => {
    const result = computeEffectBonuses([entry('heroism-1')], catalog);
    it('applies +1 status to meleeAttack', () => {
      expect(result.meleeAttack.total).toBe(1);
    });
    it('records the source label', () => {
      expect(result.meleeAttack.sources[0].label).toBe('Heroism 1');
      expect(result.meleeAttack.sources[0].bonus).toBe(1);
    });
    it('applies to all stats that heroism-1 modifies', () => {
      expect(result.rangedAttack.total).toBe(1);
      expect(result.spellAttack.total).toBe(1);
      expect(result.perception.total).toBe(1);
      expect(result.fort.total).toBe(1);
      expect(result.reflex.total).toBe(1);
      expect(result.will.total).toBe(1);
    });
    it('unrelated stats remain 0', () => {
      expect(result.ac.total).toBe(0);
      expect(result.speed.total).toBe(0);
    });
  });

  describe('status bonuses do not stack — highest wins', () => {
    it('heroism-2 beats heroism-1 on meleeAttack', () => {
      const result = computeEffectBonuses(
        [entry('heroism-1'), entry('heroism-2')],
        catalog
      );
      expect(result.meleeAttack.total).toBe(2);
      expect(result.meleeAttack.sources).toHaveLength(1);
      expect(result.meleeAttack.sources[0].label).toBe('Heroism 2');
    });

    it('bless (+1 status) does not stack with heroism-1 (+1 status)', () => {
      const result = computeEffectBonuses(
        [entry('heroism-1'), entry('bless')],
        catalog
      );
      // Both +1 status — only one applies (same amount, one wins)
      expect(result.meleeAttack.total).toBe(1);
      expect(result.meleeAttack.sources).toHaveLength(1);
    });
  });

  describe('different bonus kinds stack', () => {
    it('status (heroism-1) and circumstance (aid) stack on meleeAttack', () => {
      const result = computeEffectBonuses(
        [entry('heroism-1'), entry('aid')],
        catalog
      );
      expect(result.meleeAttack.total).toBe(3); // 1 status + 2 circumstance
    });

    it('circumstance (shield) and item (mage-armor) stack on ac', () => {
      const result = computeEffectBonuses(
        [entry('shield-spell'), entry('mage-armor')],
        catalog
      );
      expect(result.ac.total).toBe(2); // 1 circumstance + 1 item
    });
  });

  describe('raised shield circumstance bonus to AC (Slice 1)', () => {
    // Mirrors the synthetic def useShield injects: +shieldBonus circumstance AC.
    const raisedShield = (amount) => ({
      id: 'raised-shield',
      name: 'Raised Shield',
      modifiers: [{ stat: 'ac', kind: 'circumstance', amount }],
    });

    it('raised shield (+2) and the Shield cantrip (+1) do not stack — highest applies', () => {
      const result = computeEffectBonuses(
        [entry('raised-shield'), entry('shield-spell')],
        [...catalog, raisedShield(2)]
      );
      expect(result.ac.total).toBe(2); // only the higher circumstance bonus
      expect(result.ac.sources).toEqual([{ label: 'Raised Shield', bonus: 2 }]);
    });

    it('raised shield (circumstance) still stacks with Mage Armor (item)', () => {
      const result = computeEffectBonuses(
        [entry('raised-shield'), entry('mage-armor')],
        [...catalog, raisedShield(2)]
      );
      expect(result.ac.total).toBe(3); // 2 circumstance + 1 item
    });
  });

  describe('effects without modifiers', () => {
    it('effects with empty modifiers array are ignored', () => {
      const result = computeEffectBonuses([entry('no-mods')], catalog);
      expect(result.meleeAttack.total).toBe(0);
    });
  });

  describe('unknown effect ids', () => {
    it('unknown effect id is ignored without throwing', () => {
      const result = computeEffectBonuses(
        [{ id: 'uid-x', effectId: 'nonexistent-effect' }],
        catalog
      );
      expect(result.meleeAttack.total).toBe(0);
    });
  });

  // Worn gear now rides resistance/weakness/immunity modifiers on the same
  // synthetic def the bonus pipeline reads (#922). Those special stats have no
  // bonus bucket, so they must never net as a bonus nor land in _conditional —
  // the defense readers consume them separately.
  describe('special damage modifiers are ignored as bonuses (#922)', () => {
    const specialCat = [
      { id: 'fire-robe', name: 'Energy Robe', modifiers: [
        { stat: 'ac', kind: 'item', amount: 1 },
        { stat: 'resistance', amount: 5, vs: 'fire' },
      ] },
    ];
    it('nets the ac bonus but drops the resistance from totals and _conditional', () => {
      const result = computeEffectBonuses([entry('fire-robe')], specialCat);
      expect(result.ac.total).toBe(1);
      expect(result.resistance).toBeUndefined();
      expect(result._conditional.resistance).toBeUndefined();
    });
  });

  describe('skill check bonuses (#447)', () => {
    const skillCat = [
      {
        id: 'upstage',
        name: 'Upstage',
        modifiers: [
          { stat: 'perception', kind: 'status', amount: 1 },
          { stat: 'skills', kind: 'status', amount: 1 },
        ],
      },
      // A targeted single-skill bonus (the future Gecko-Potion shape).
      { id: 'gecko', name: 'Gecko Potion', modifiers: [{ stat: 'athletics', kind: 'item', amount: 1 }] },
    ];

    it("'skills' fans out to every skill key", () => {
      const result = computeEffectBonuses([entry('upstage')], skillCat);
      expect(result.deception.total).toBe(1);
      expect(result.athletics.total).toBe(1);
      expect(result.stealth.total).toBe(1);
      expect(result.deception.sources[0].label).toBe('Upstage');
    });

    it('perception stays its own stat (not double-counted by the skills fan-out)', () => {
      const result = computeEffectBonuses([entry('upstage')], skillCat);
      expect(result.perception.total).toBe(1);
      expect(result.perception.sources).toHaveLength(1);
    });

    it('a targeted skill modifier only hits that skill', () => {
      const result = computeEffectBonuses([entry('gecko')], skillCat);
      expect(result.athletics.total).toBe(1);
      expect(result.acrobatics.total).toBe(0);
    });

    it('same-kind skill bonuses do not stack — highest wins', () => {
      const result = computeEffectBonuses([entry('upstage'), entry('gecko')], skillCat);
      // Upstage (+1 status) and Gecko (+1 item) are different kinds → stack.
      expect(result.athletics.total).toBe(2);
      // Deception only gets Upstage's status.
      expect(result.deception.total).toBe(1);
    });

    it('the empty-effects result includes skill keys', () => {
      const result = computeEffectBonuses([], skillCat);
      expect(result.deception).toEqual({ total: 0, sources: [] });
    });
  });

  describe('negative amounts / penalties (#338)', () => {
    const penaltyCat = [
      { id: 'drakeheart', name: 'Drakeheart Mutagen', modifiers: [
        { stat: 'ac', kind: 'status', amount: 5 },
        { stat: 'will', kind: 'status', amount: -1 },
        { stat: 'reflex', kind: 'status', amount: -1 },
      ] },
      // A status bonus that should net against a status penalty of the same kind.
      { id: 'guidance', name: 'Guidance', modifiers: [{ stat: 'will', kind: 'circumstance', amount: 1 }] },
      { id: 'sap', name: 'Sapping Curse', modifiers: [{ stat: 'will', kind: 'status', amount: -2 }] },
    ];

    it('nets a flat negative modifier onto the stat', () => {
      const result = computeEffectBonuses([entry('drakeheart')], penaltyCat);
      expect(result.will.total).toBe(-1);
      expect(result.reflex.total).toBe(-1);
      expect(result.ac.total).toBe(5);
    });

    it('records the penalty source with a negative penalty field', () => {
      const result = computeEffectBonuses([entry('drakeheart')], penaltyCat);
      expect(result.will.sources).toEqual([{ label: 'Drakeheart Mutagen', penalty: -1 }]);
    });

    it('worst penalty of a kind wins (like the bonus best-of-kind rule)', () => {
      const result = computeEffectBonuses([entry('drakeheart'), entry('sap')], penaltyCat);
      // both are status will penalties: -1 and -2 → only the -2 applies
      expect(result.will.total).toBe(-2);
      expect(result.will.sources).toEqual([{ label: 'Sapping Curse', penalty: -2 }]);
    });

    it('a same-stat bonus and penalty of different kinds both apply and net', () => {
      const result = computeEffectBonuses([entry('drakeheart'), entry('guidance')], penaltyCat);
      // -1 status (Drakeheart) + +1 circumstance (Guidance) = 0, two sources
      expect(result.will.total).toBe(0);
      expect(result.will.sources).toHaveLength(2);
    });
  });

  describe('conditional "vs" modifiers (#338)', () => {
    const condCat = [
      { id: 'antidote', name: 'Antidote', modifiers: [{ stat: 'fort', kind: 'item', amount: 2, vs: 'poison' }] },
      { id: 'eld-charged', name: 'Charged', modifiers: [
        { stat: 'reflex', kind: 'status', amount: -2, vs: 'electricity' },
        { stat: 'will', kind: 'status', amount: -2, vs: 'electricity' },
        { stat: 'fort', kind: 'status', amount: -2, vs: 'electricity' },
      ] },
      { id: 'gecko-climb', name: 'Gecko Potion', modifiers: [{ stat: 'athletics', kind: 'item', amount: 1, vs: 'Climb' }] },
    ];

    it('does NOT net a conditional modifier into the always-on stat total', () => {
      const result = computeEffectBonuses([entry('antidote')], condCat);
      expect(result.fort.total).toBe(0);
      expect(result.fort.sources).toHaveLength(0);
    });

    it('collects the conditional modifier in _conditional keyed by stat', () => {
      const result = computeEffectBonuses([entry('antidote')], condCat);
      expect(result._conditional.fort).toEqual([
        { amount: 2, kind: 'item', label: 'Antidote', vs: 'poison' },
      ]);
    });

    it('conditionalModifiersFor returns the modifiers for a stat', () => {
      const mods = conditionalModifiersFor([entry('eld-charged')], 'reflex', condCat);
      expect(mods).toEqual([{ amount: -2, kind: 'status', label: 'Charged', vs: 'electricity' }]);
    });

    it('conditionalModifiersFor returns [] when none target the stat', () => {
      expect(conditionalModifiersFor([entry('antidote')], 'will', condCat)).toEqual([]);
      expect(conditionalModifiersFor([], 'fort', condCat)).toEqual([]);
    });

    it('a conditional skill modifier surfaces under that skill', () => {
      const mods = conditionalModifiersFor([entry('gecko-climb')], 'athletics', condCat);
      expect(mods[0].vs).toBe('Climb');
      expect(mods[0].amount).toBe(1);
    });
  });

  describe('existing positive/unconditional effects are unaffected (#338 regression)', () => {
    it('an unconditional positive effect nets exactly as before', () => {
      const result = computeEffectBonuses([entry('heroism-1'), entry('aid')], catalog);
      expect(result.meleeAttack.total).toBe(3);
      expect(result._conditional).toEqual({});
    });
  });

  describe("'attacks' meta-stat fan-out (#274)", () => {
    const atkCat = [
      { id: 'inspire', name: 'Inspire', modifiers: [{ stat: 'attacks', kind: 'status', amount: 1 }] },
      { id: 'limned', name: 'Limned', modifiers: [{ stat: 'attacks', kind: 'circumstance', amount: 1, vs: 'limned target' }] },
    ];

    it('an unconditional attacks modifier nets into all three attack stats', () => {
      const result = computeEffectBonuses([entry('inspire')], atkCat);
      expect(result.meleeAttack.total).toBe(1);
      expect(result.rangedAttack.total).toBe(1);
      expect(result.spellAttack.total).toBe(1);
      // does not leak to saves/skills
      expect(result.will.total).toBe(0);
      expect(result.athletics.total).toBe(0);
    });

    it('a conditional attacks modifier lands in _conditional under every attack stat, not the total', () => {
      const result = computeEffectBonuses([entry('limned')], atkCat);
      expect(result.meleeAttack.total).toBe(0);
      expect(result._conditional.meleeAttack).toEqual([{ amount: 1, kind: 'circumstance', label: 'Limned', vs: 'limned target' }]);
      expect(result._conditional.rangedAttack[0].vs).toBe('limned target');
      expect(result._conditional.spellAttack[0].vs).toBe('limned target');
    });
  });

  describe('conditionalTogglesFor (#274)', () => {
    const cat = [
      { id: 'limned', name: 'Limned', modifiers: [{ stat: 'attacks', kind: 'circumstance', amount: 1, vs: 'limned target' }] },
    ];
    it('maps conditional modifiers on a stat to toggle line items', () => {
      const toggles = conditionalTogglesFor([entry('limned')], 'meleeAttack', cat);
      expect(toggles).toEqual([{ id: 'effect-Limned-limned target', label: 'Limned (vs limned target)', bonus: 1 }]);
    });
    it('returns [] when nothing conditional targets the stat', () => {
      expect(conditionalTogglesFor([entry('limned')], 'will', cat)).toEqual([]);
      expect(conditionalTogglesFor([], 'meleeAttack', cat)).toEqual([]);
    });
  });

  describe('dexCap modifiers are not netted as additive bonuses (#507)', () => {
    const dexCat = [
      { id: 'drakeheart', name: 'Drakeheart Mutagen', modifiers: [{ stat: 'dexCap', amount: 2 }] },
    ];
    it('produces no spurious AC (or any) bonus from a dexCap modifier', () => {
      const result = computeEffectBonuses([entry('drakeheart')], dexCat);
      expect(result.ac).toEqual({ total: 0, sources: [] });
    });
  });
});

describe('dexCapFor (#507)', () => {
  const cat = [
    { id: 'drakeheart', name: 'Drakeheart Mutagen', modifiers: [{ stat: 'dexCap', amount: 2 }] },
    { id: 'tighter', name: 'Tighter Cap', modifiers: [{ stat: 'dexCap', amount: 1 }] },
    { id: 'mixed', name: 'Mixed', modifiers: [
      { stat: 'ac', kind: 'item', amount: 1 },
      { stat: 'dexCap', amount: 3 },
    ] },
    { id: 'scoped', name: 'Scoped', modifiers: [{ stat: 'dexCap', amount: 4, vs: 'while prone' }] },
    { id: 'flat', name: 'Flat', modifiers: [{ stat: 'reflex', kind: 'status', amount: 1 }] },
  ];

  it('returns the absolute Dex cap from a matching effect', () => {
    expect(dexCapFor([entry('drakeheart')], cat)).toBe(2);
  });

  it('reads the dexCap modifier even when bundled with other stats', () => {
    expect(dexCapFor([entry('mixed')], cat)).toBe(3);
  });

  it('takes the lowest (most restrictive) when several apply — PF2e "use your lowest"', () => {
    expect(dexCapFor([entry('drakeheart'), entry('tighter')], cat)).toBe(1);
  });

  it('ignores vs-scoped dexCap modifiers (a cap is not a roll-time toggle)', () => {
    expect(dexCapFor([entry('scoped')], cat)).toBe(Infinity);
  });

  it('returns Infinity (no cap) when no dexCap modifier is present', () => {
    expect(dexCapFor([entry('flat')], cat)).toBe(Infinity);
  });

  it('returns Infinity for empty / null / unknown effects', () => {
    expect(dexCapFor([], cat)).toBe(Infinity);
    expect(dexCapFor(null, cat)).toBe(Infinity);
    expect(dexCapFor([entry('nope')], cat)).toBe(Infinity);
  });
});

describe('resistanceFor / flatCheckEasedFor (#900)', () => {
  const cat = [
    { id: 'bb-lesser', name: 'Blood Booster (Lesser)', modifiers: [
      { stat: 'resistance', amount: 5, vs: 'persistent-bleed,persistent-poison', flatCheckEase: true },
    ] },
    { id: 'bb-greater', name: 'Blood Booster (Greater)', modifiers: [
      { stat: 'resistance', amount: 20, vs: 'persistent-bleed,persistent-poison', flatCheckEase: true },
    ] },
    { id: 'fire-ward', name: 'Fire Ward', modifiers: [{ stat: 'resistance', amount: 10, vs: 'fire' }] },
    { id: 'no-vs', name: 'Bad Resistance', modifiers: [{ stat: 'resistance', amount: 99 }] },
    { id: 'bonus', name: 'Bless', modifiers: [{ stat: 'meleeAttack', kind: 'status', amount: 1 }] },
  ];

  it('returns the matching resistance amount for a descriptor in the vs list', () => {
    expect(resistanceFor([entry('bb-lesser')], 'persistent-bleed', cat)).toBe(5);
    expect(resistanceFor([entry('bb-lesser')], 'persistent-poison', cat)).toBe(5);
  });

  it('does not stack — highest matching amount wins', () => {
    expect(resistanceFor([entry('bb-lesser'), entry('bb-greater')], 'persistent-bleed', cat)).toBe(20);
  });

  it('distinguishes persistent from direct damage of the same type', () => {
    expect(resistanceFor([entry('fire-ward')], 'fire', cat)).toBe(10);
    expect(resistanceFor([entry('fire-ward')], 'persistent-fire', cat)).toBe(0);
    expect(resistanceFor([entry('bb-lesser')], 'bleed', cat)).toBe(0);
  });

  it('returns 0 for non-matching, vs-less, empty, null, or unknown effects', () => {
    expect(resistanceFor([entry('bb-lesser')], 'fire', cat)).toBe(0);
    expect(resistanceFor([entry('no-vs')], 'persistent-bleed', cat)).toBe(0);
    expect(resistanceFor([entry('bonus')], 'persistent-bleed', cat)).toBe(0);
    expect(resistanceFor([], 'persistent-bleed', cat)).toBe(0);
    expect(resistanceFor(null, 'persistent-bleed', cat)).toBe(0);
    expect(resistanceFor([entry('nope')], 'persistent-bleed', cat)).toBe(0);
    expect(resistanceFor([entry('bb-lesser')], '', cat)).toBe(0);
  });

  it('flatCheckEasedFor is true only for a matching resistance carrying the flag', () => {
    expect(flatCheckEasedFor([entry('bb-lesser')], 'persistent-bleed', cat)).toBe(true);
    expect(flatCheckEasedFor([entry('fire-ward')], 'fire', cat)).toBe(false);
    expect(flatCheckEasedFor([entry('bb-lesser')], 'fire', cat)).toBe(false);
    expect(flatCheckEasedFor([], 'persistent-bleed', cat)).toBe(false);
    expect(flatCheckEasedFor(null, 'persistent-bleed', cat)).toBe(false);
  });
});

// Inline (parametrized) effect modifiers (#1001 S2) — an effect entry can carry
// its own `modifiers` so a dynamic value/descriptor (Energy Ablation resistance
// = cast rank vs a chosen type) works without a static catalog def.
describe('inline effect modifiers (#1001 S2)', () => {
  const cat = [
    { id: 'fire-ward', name: 'Fire Ward', modifiers: [{ stat: 'resistance', amount: 10, vs: 'fire' }] },
  ];
  // An entry with no catalog def, carrying its own modifiers.
  const inline = (mods) => ({ id: 'uid-inline', effectId: 'energy-ablation', modifiers: mods });

  it('resistanceFor reads inline modifiers with no catalog def', () => {
    const e = inline([{ stat: 'resistance', vs: 'fire', amount: 3 }]);
    expect(resistanceFor([e], 'fire', cat)).toBe(3);
    expect(resistanceFor([e], 'cold', cat)).toBe(0);
  });

  it('weaknessFor reads inline modifiers', () => {
    const e = inline([{ stat: 'weakness', vs: 'cold', amount: 4 }]);
    expect(weaknessFor([e], 'cold', cat)).toBe(4);
  });

  it('inline and catalog modifiers both count — highest matching wins', () => {
    const e = inline([{ stat: 'resistance', vs: 'fire', amount: 3 }]);
    // catalog fire-ward = 10 vs inline 3 → 10
    expect(resistanceFor([entry('fire-ward'), e], 'fire', cat)).toBe(10);
    // inline 12 beats catalog 10
    const bigger = inline([{ stat: 'resistance', vs: 'fire', amount: 12 }]);
    expect(resistanceFor([entry('fire-ward'), bigger], 'fire', cat)).toBe(12);
  });

  it('flatCheckEasedFor honours an inline flag', () => {
    const e = inline([{ stat: 'resistance', vs: 'persistent-bleed', amount: 2, flatCheckEase: true }]);
    expect(flatCheckEasedFor([e], 'persistent-bleed', cat)).toBe(true);
  });

  it('entries with neither a catalog def nor inline modifiers contribute nothing', () => {
    expect(resistanceFor([{ id: 'x', effectId: 'unknown' }], 'fire', cat)).toBe(0);
  });
});

describe('weaknessFor (#918)', () => {
  const cat = [
    { id: 'fire-vuln', name: 'Fire Vulnerability', modifiers: [{ stat: 'weakness', amount: 5, vs: 'fire' }] },
    { id: 'big-vuln', name: 'Greater Vulnerability', modifiers: [{ stat: 'weakness', amount: 10, vs: 'fire,cold' }] },
    { id: 'fire-ward', name: 'Fire Ward', modifiers: [{ stat: 'resistance', amount: 10, vs: 'fire' }] },
    { id: 'no-vs', name: 'Bad Weakness', modifiers: [{ stat: 'weakness', amount: 99 }] },
  ];

  it('returns the matching weakness amount for a descriptor in the vs list', () => {
    expect(weaknessFor([entry('fire-vuln')], 'fire', cat)).toBe(5);
    expect(weaknessFor([entry('big-vuln')], 'cold', cat)).toBe(10);
  });

  it('does not stack — highest matching amount wins', () => {
    expect(weaknessFor([entry('fire-vuln'), entry('big-vuln')], 'fire', cat)).toBe(10);
  });

  it('reads weakness only — ignores resistance modifiers and vice versa', () => {
    expect(weaknessFor([entry('fire-ward')], 'fire', cat)).toBe(0);
    expect(resistanceFor([entry('fire-vuln')], 'fire', cat)).toBe(0);
  });

  it('returns 0 for non-matching, vs-less, empty, null, or unknown effects', () => {
    expect(weaknessFor([entry('fire-vuln')], 'cold', cat)).toBe(0);
    expect(weaknessFor([entry('no-vs')], 'fire', cat)).toBe(0);
    expect(weaknessFor([], 'fire', cat)).toBe(0);
    expect(weaknessFor(null, 'fire', cat)).toBe(0);
    expect(weaknessFor([entry('nope')], 'fire', cat)).toBe(0);
    expect(weaknessFor([entry('fire-vuln')], '', cat)).toBe(0);
  });
});

describe('combineModifiers', () => {
  const penalty = { total: -2, sources: [{ label: 'Frightened 2', penalty: -2 }] };
  const bonus = { total: 1, sources: [{ label: 'Heroism 1', bonus: 1 }] };
  const EMPTY = { total: 0, sources: [] };

  it('returns total = penalty + bonus', () => {
    expect(combineModifiers(penalty, bonus).total).toBe(-1);
  });

  it('marks penalty sources with isBuff: false', () => {
    const result = combineModifiers(penalty, bonus);
    const penaltySrc = result.sources.find((s) => s.label === 'Frightened 2');
    expect(penaltySrc.isBuff).toBe(false);
  });

  it('marks bonus sources with isBuff: true', () => {
    const result = combineModifiers(penalty, bonus);
    const bonusSrc = result.sources.find((s) => s.label === 'Heroism 1');
    expect(bonusSrc.isBuff).toBe(true);
  });

  it('handles null penalty gracefully', () => {
    const result = combineModifiers(null, bonus);
    expect(result.total).toBe(1);
    expect(result.sources[0].isBuff).toBe(true);
  });

  it('handles null bonus gracefully', () => {
    const result = combineModifiers(penalty, null);
    expect(result.total).toBe(-2);
    expect(result.sources[0].isBuff).toBe(false);
  });

  it('returns EMPTY when both totals are 0', () => {
    const result = combineModifiers(EMPTY, EMPTY);
    expect(result.total).toBe(0);
    expect(result.sources).toHaveLength(0);
  });

  it('handles undefined both inputs', () => {
    expect(() => combineModifiers(undefined, undefined)).not.toThrow();
    expect(combineModifiers(undefined, undefined).total).toBe(0);
  });

  it('pure bonus case (no penalty) has correct total', () => {
    expect(combineModifiers(null, bonus).total).toBe(1);
  });

  it('pure penalty case (no bonus) has correct total', () => {
    expect(combineModifiers(penalty, null).total).toBe(-2);
  });
});

describe('isEncounterScopedEffect (#275)', () => {
  const cat = [
    { id: 'eld-charged', name: 'Charged', encounterScoped: true },
    { id: 'mage-armor', name: 'Mage Armor' },
  ];

  it('is true for turn/round-bound effects (carry expireAt)', () => {
    expect(isEncounterScopedEffect({ effectId: 'x', expireAt: { round: 2 } }, cat)).toBe(true);
  });

  it('is true for catalog-flagged encounterScoped effects with no expireAt', () => {
    expect(isEncounterScopedEffect({ effectId: 'eld-charged' }, cat)).toBe(true);
  });

  it('is false for manual effects (no expiry, not flagged)', () => {
    expect(isEncounterScopedEffect({ effectId: 'mage-armor' }, cat)).toBe(false);
  });

  it('resolves eld-charged against the bundled catalog by default', () => {
    expect(isEncounterScopedEffect({ effectId: 'eld-charged' })).toBe(true);
  });
});

describe('clearsOnDamageType (#275)', () => {
  const cat = [{ id: 'eld-charged', name: 'Charged', clearOnDamageType: 'electricity' }];

  it('matches the declared damage type', () => {
    expect(clearsOnDamageType({ effectId: 'eld-charged' }, 'electricity', cat)).toBe(true);
  });

  it('does not match a different damage type', () => {
    expect(clearsOnDamageType({ effectId: 'eld-charged' }, 'fire', cat)).toBe(false);
  });

  it('is false when no type is given', () => {
    expect(clearsOnDamageType({ effectId: 'eld-charged' }, '', cat)).toBe(false);
  });

  it('resolves eld-charged → electricity against the bundled catalog by default', () => {
    expect(clearsOnDamageType({ effectId: 'eld-charged' }, 'electricity')).toBe(true);
  });
});
