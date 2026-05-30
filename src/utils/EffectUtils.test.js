import { computeEffectBonuses, combineModifiers } from './EffectUtils';

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
