// Damage-step algebra (#222): expression parsing, rider amounts, crit
// ordering (riders double, weakness never does), exploit-weakness scoping,
// and the combat-log breakdown format.

import {
  parseDamageExpression,
  weaponDiceCount,
  doubleDice,
  riderAmount,
  riderEnabled,
  computeTargetDamage,
  formatDamageBreakdown,
  buildDamageProfile,
} from './damage';

describe('parseDamageExpression', () => {
  it('parses dice with a flat modifier', () => {
    expect(parseDamageExpression('2d6+3')).toEqual({ dice: [{ count: 2, size: 6 }], flat: 3 });
  });

  it('parses bare dice and negative modifiers', () => {
    expect(parseDamageExpression('1d8')).toEqual({ dice: [{ count: 1, size: 8 }], flat: 0 });
    expect(parseDamageExpression('1d4-1')).toEqual({ dice: [{ count: 1, size: 4 }], flat: -1 });
  });

  it('parses multi-term expressions', () => {
    expect(parseDamageExpression('1d8+1d6+4')).toEqual({
      dice: [{ count: 1, size: 8 }, { count: 1, size: 6 }],
      flat: 4,
    });
  });

  it('returns null on hand-curated junk instead of throwing', () => {
    expect(parseDamageExpression('??')).toBeNull();
    expect(parseDamageExpression('2d6 fire')).toBeNull();
    expect(parseDamageExpression('')).toBeNull();
    expect(parseDamageExpression(null)).toBeNull();
  });
});

describe('weaponDiceCount / doubleDice', () => {
  it('counts all dice in the expression', () => {
    expect(weaponDiceCount('2d8+4')).toBe(2);
    expect(weaponDiceCount('1d8+1d6')).toBe(2);
    expect(weaponDiceCount('??')).toBe(0);
  });

  it('doubles dice counts and flat parts', () => {
    expect(doubleDice('1d4')).toBe('2d4');
    expect(doubleDice('2d6+3')).toBe('4d6+6');
  });

  it('passes unparseable expressions through unchanged', () => {
    expect(doubleDice('??')).toBe('??');
  });
});

describe('riderAmount', () => {
  const character = { abilities: { constitution: 18 } };

  it('flat bonus', () => {
    expect(riderAmount({ bonus: { flat: 2 } })).toBe(2);
  });

  it('perWeaponDie scales with the base expression dice count', () => {
    expect(riderAmount({ bonus: { perWeaponDie: 2 } }, { expression: '2d8+4' })).toBe(4);
    expect(riderAmount({ bonus: { perWeaponDie: 2 } }, { expression: '1d6' })).toBe(2);
  });

  it('ability bonus reads the actor modifier', () => {
    expect(riderAmount({ bonus: { ability: 'constitution' } }, { character })).toBe(4);
  });

  it('no bonus → 0', () => {
    expect(riderAmount({ persistent: { dice: '1d4' } })).toBe(0);
  });
});

describe('riderEnabled', () => {
  it('defaults on unless authored defaultOn:false', () => {
    expect(riderEnabled({ id: 'a' }, {})).toBe(true);
    expect(riderEnabled({ id: 'a', defaultOn: false }, {})).toBe(false);
  });

  it('player toggles override the default', () => {
    expect(riderEnabled({ id: 'a' }, { a: false })).toBe(false);
    expect(riderEnabled({ id: 'a', defaultOn: false }, { a: true })).toBe(true);
  });
});

describe('computeTargetDamage', () => {
  const empowerment = {
    id: 'ie', label: "Implement's Empowerment",
    bonus: { flat: 4 }, defaultOn: true,
  };
  const weakness = {
    id: 'exploit-weakness', label: 'weakness (fire 5)',
    weakness: 5, appliesToEntryIds: ['e-gob'], defaultOn: true,
  };
  const bleed = {
    id: 'bleed', label: 'Persistent bleed',
    persistent: { dice: '1d4', type: 'bleed' }, defaultOn: true,
  };

  it('returns null without an entered total or on a miss', () => {
    expect(computeTargetDamage({ entered: null, degree: 'success' })).toBeNull();
    expect(computeTargetDamage({ entered: 9, degree: 'failure' })).toBeNull();
    expect(computeTargetDamage({ entered: 9, degree: null })).toBeNull();
  });

  it('hit: base + numeric riders', () => {
    const out = computeTargetDamage({
      entered: 9, degree: 'success', riders: [empowerment], entryId: 'e-gob',
    });
    expect(out.final).toBe(13);
    expect(out.parts.riders).toEqual([{ label: "Implement's Empowerment", amount: 4 }]);
  });

  it('crit doubles base + riders, weakness added after and never doubled', () => {
    const out = computeTargetDamage({
      entered: 9, degree: 'criticalSuccess',
      riders: [empowerment, weakness], entryId: 'e-gob',
    });
    // (9 + 4) × 2 + 5 = 31
    expect(out.final).toBe(31);
    expect(out.parts.crit).toBe(true);
    expect(out.parts.weaknesses).toEqual([{ label: 'weakness (fire 5)', amount: 5 }]);
  });

  it('weakness only applies to matching targets', () => {
    const out = computeTargetDamage({
      entered: 9, degree: 'success', riders: [weakness], entryId: 'e-other',
    });
    expect(out.final).toBe(9);
    expect(out.parts.weaknesses).toEqual([]);
  });

  it('the crit ×2 toggle off keeps the entered total un-doubled', () => {
    const out = computeTargetDamage({
      entered: 20, degree: 'criticalSuccess', riders: [weakness],
      entryId: 'e-gob', critDouble: false,
    });
    // 20 + 5 weakness, no doubling
    expect(out.final).toBe(25);
    expect(out.parts.crit).toBe(false);
  });

  it('unticked riders are skipped', () => {
    const out = computeTargetDamage({
      entered: 9, degree: 'success', riders: [empowerment],
      riderState: { ie: false }, entryId: 'e-gob',
    });
    expect(out.final).toBe(9);
    expect(out.riderIds).toEqual([]);
  });

  it('degree-gated riders only apply on their listed degrees', () => {
    const critOnly = { ...empowerment, on: ['criticalSuccess'] };
    const hit = computeTargetDamage({
      entered: 9, degree: 'success', riders: [critOnly], entryId: 'e-gob',
    });
    expect(hit.final).toBe(9);
    const crit = computeTargetDamage({
      entered: 9, degree: 'criticalSuccess', riders: [critOnly], entryId: 'e-gob',
    });
    expect(crit.final).toBe(26);
  });

  it('persistent riders carry through, dice doubled on a crit', () => {
    const hit = computeTargetDamage({
      entered: 9, degree: 'success', riders: [bleed], entryId: 'e-gob',
    });
    expect(hit.persistent).toEqual([{ dice: '1d4', type: 'bleed', label: 'Persistent bleed' }]);
    const crit = computeTargetDamage({
      entered: 9, degree: 'criticalSuccess', riders: [bleed], entryId: 'e-gob',
    });
    expect(crit.persistent).toEqual([{ dice: '2d4', type: 'bleed', label: 'Persistent bleed' }]);
  });
});

describe('formatDamageBreakdown', () => {
  it('bare total when nothing modified it', () => {
    expect(formatDamageBreakdown({
      final: 9, parts: { base: 9, riders: [], crit: false, weaknesses: [] }, persistent: [],
    })).toBe('9');
  });

  it('shows riders, crit, and weakness in damage order', () => {
    expect(formatDamageBreakdown({
      final: 31,
      parts: {
        base: 9,
        riders: [{ label: "Implement's Empowerment", amount: 4 }],
        crit: true,
        weaknesses: [{ label: 'weakness (fire 5)', amount: 5 }],
      },
      persistent: [],
    })).toBe("31 (9 +4 Implement's Empowerment ×2 +5 weakness (fire 5))");
  });

  it('appends persistent entries with the flat-check note', () => {
    expect(formatDamageBreakdown({
      final: 9, parts: { base: 9, riders: [], crit: false, weaknesses: [] },
      persistent: [{ dice: '1d4', type: 'electricity', label: 'x' }],
    })).toBe('9 · 1d4 persistent electricity (DC 15 flat to end)');
  });
});

describe('buildDamageProfile', () => {
  const character = {
    id: 'char-ashka',
    abilities: { constitution: 16 },
    damageRiders: [{
      id: 'implements-empowerment',
      label: "Implement's Empowerment",
      appliesTo: 'strikes',
      bonus: { perWeaponDie: 2 },
      defaultOn: true,
    }],
  };
  const strike = { name: 'Mace Strike', attackMod: 11, damage: '2d6+4', traits: ['Attack'] };
  const order = [
    { entryId: 'e-gob-1', kind: 'enemy', name: 'Goblin', creatureKey: 'goblin-warrior' },
    { entryId: 'e-gob-2', kind: 'enemy', name: 'Goblin 2', creatureKey: 'goblin-warrior' },
    { entryId: 'e-ogre', kind: 'enemy', name: 'Ogre', creatureKey: 'ogre' },
  ];

  it('uses the strike damage string and scopes character riders to strikes', () => {
    const profile = buildDamageProfile(strike, character, {});
    expect(profile.expression).toBe('2d6+4');
    expect(profile.riders).toHaveLength(1);
    expect(profile.riders[0].id).toBe('implements-empowerment');
    // perWeaponDie 2 on 2 dice → +4
    expect(riderAmount(profile.riders[0], profile.riders[0].ctx)).toBe(4);
  });

  it('character strike riders do not attach to non-strike abilities', () => {
    const spell = { name: 'Zappy Ray', damage: '2d6', traits: ['Attack'] };
    const profile = buildDamageProfile(spell, character, {});
    expect(profile.riders).toHaveLength(0);
  });

  it('gates ability riders on the chosen action count', () => {
    const blast = {
      name: 'Melee Metal Blast', attackMod: 11, damage: '1d8+4',
      riders: [{ id: 'blast-2a-con', label: '+Con', bonus: { ability: 'constitution' }, when: { actions: 2 } }],
    };
    const oneAction = buildDamageProfile(blast, { abilities: { constitution: 16 } }, { chosenActions: 1 });
    expect(oneAction.riders).toHaveLength(0);
    const twoActions = buildDamageProfile(blast, { abilities: { constitution: 16 } }, { chosenActions: 2 });
    expect(twoActions.riders).toHaveLength(1);
    expect(riderAmount(twoActions.riders[0], twoActions.riders[0].ctx)).toBe(3);
  });

  it('antithesis exploit applies to the exact combatant only', () => {
    const exploit = { targetEntryId: 'e-gob-1', targetName: 'Goblin', type: 'antithesis', value: 4 };
    const profile = buildDamageProfile(strike, character, {
      exploit, enemyEntries: order, order,
    });
    const rider = profile.riders.find((r) => r.id === 'exploit-weakness');
    expect(rider.weakness).toBe(4);
    expect(rider.appliesToEntryIds).toEqual(['e-gob-1']);
  });

  it('mortal weakness matches every combatant sharing the creatureKey', () => {
    const exploit = {
      targetEntryId: 'e-gob-1', targetName: 'Goblin',
      type: 'mortal', weaknessType: 'fire', value: 5,
    };
    const profile = buildDamageProfile(strike, character, {
      exploit, enemyEntries: order, order,
    });
    const rider = profile.riders.find((r) => r.id === 'exploit-weakness');
    expect(rider.appliesToEntryIds).toEqual(['e-gob-1', 'e-gob-2']);
    expect(rider.label).toContain('fire 5');
  });

  it('mortal weakness without a creatureKey degrades to exact-entry match', () => {
    const bareOrder = [{ entryId: 'e-manual', kind: 'enemy', name: 'Custom Foe' }];
    const exploit = {
      targetEntryId: 'e-manual', targetName: 'Custom Foe',
      type: 'mortal', weaknessType: 'cold', value: 3,
    };
    const profile = buildDamageProfile(strike, character, {
      exploit, enemyEntries: bareOrder, order: bareOrder,
    });
    const rider = profile.riders.find((r) => r.id === 'exploit-weakness');
    expect(rider.appliesToEntryIds).toEqual(['e-manual']);
  });

  it('a stale exploit (target gone) adds no rider', () => {
    const exploit = { targetEntryId: 'e-dead', targetName: 'Gone', type: 'mortal', weaknessType: 'fire', value: 5 };
    const profile = buildDamageProfile(strike, character, {
      exploit, enemyEntries: order, order,
    });
    expect(profile.riders.find((r) => r.id === 'exploit-weakness')).toBeUndefined();
  });

  it('no exploit, no riders, no damage string → null profile', () => {
    expect(buildDamageProfile({ name: 'Shove' }, { id: 'c' }, {})).toBeNull();
  });

  it('riders without a damage expression still produce a profile', () => {
    const profile = buildDamageProfile(strike, character, {});
    const noDice = buildDamageProfile(
      { name: 'Odd Attack', attackMod: 5 }, character, {}
    );
    expect(profile.expression).toBe('2d6+4');
    expect(noDice).not.toBeNull();
    expect(noDice.expression).toBeNull();
  });
});
