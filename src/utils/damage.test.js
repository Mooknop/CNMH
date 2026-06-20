// Damage-step algebra (#222): expression parsing, rider amounts, crit
// ordering (riders double, weakness never does), exploit-weakness scoping,
// and the combat-log breakdown format.

import {
  parseDamageExpression,
  weaponDiceCount,
  doubleDice,
  addExpressions,
  riderAmount,
  riderEnabled,
  computeTargetDamage,
  computeSaveDamage,
  serializeRidersForSave,
  formatDamageBreakdown,
  buildDamageProfile,
  damageHintParts,
  traitGatedEntryIds,
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

describe('addExpressions', () => {
  it('merges dice of the same size', () => {
    expect(addExpressions('2d12', '1d12')).toBe('3d12');
    expect(addExpressions('2d12', '1d12', 3)).toBe('5d12');
  });

  it('keeps distinct die sizes and sums flats', () => {
    expect(addExpressions('1d8+4', '1d6')).toBe('1d8+1d6+4');
    expect(addExpressions('1d4', '1', 2)).toBe('1d4+2');
    expect(addExpressions('1d4', 1, 2)).toBe('1d4+2');
  });

  it('returns the base unchanged on unparseable input', () => {
    expect(addExpressions('??', '1d6')).toBe('??');
    expect(addExpressions('1d6', 'junk')).toBe('1d6');
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

  it('condition riders surface on their degree without changing the total (#228)', () => {
    const critClumsy = {
      id: 'clumsy', label: 'Clumsy 1', condition: 'clumsy 1', on: ['criticalSuccess'], defaultOn: true,
    };
    const hit = computeTargetDamage({ entered: 9, degree: 'success', riders: [critClumsy], entryId: 'e-gob' });
    expect(hit.conditions).toEqual([]);
    expect(hit.final).toBe(9);
    const crit = computeTargetDamage({ entered: 9, degree: 'criticalSuccess', riders: [critClumsy], entryId: 'e-gob' });
    expect(crit.final).toBe(18);
    expect(crit.conditions).toEqual([{ label: 'Clumsy 1', condition: 'clumsy 1' }]);
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

describe('computeSaveDamage', () => {
  // Riders here are serializeRidersForSave snapshots: amounts pre-resolved.
  const rune = { id: 'rune', label: 'Striking Rune', amount: 1 };
  const weakness = {
    id: 'exploit-weakness', label: 'weakness (fire 5)',
    weakness: 5, appliesToEntryIds: ['e-gob'],
  };
  const basePersistent = {
    id: 'zap', label: 'Persistent electricity',
    persistent: { dice: '1d4', type: 'electricity' },
  };
  const critOnlyBleed = {
    id: 'shard-bleed', label: 'Shards: persistent bleed',
    persistent: { dice: '1d6', type: 'bleed' }, on: ['criticalFailure'],
  };

  it('null on a critical success or missing degree', () => {
    expect(computeSaveDamage({ entered: 12, degree: 'criticalSuccess' })).toBeNull();
    expect(computeSaveDamage({ entered: 12, degree: null })).toBeNull();
  });

  it('failure takes the full total plus bonus riders', () => {
    const out = computeSaveDamage({ entered: 12, degree: 'failure', riders: [rune], entryId: 'e-gob' });
    expect(out.final).toBe(13);
    expect(out.parts.multiplier).toBeNull();
    expect(out.parts.riders).toEqual([{ label: 'Striking Rune', amount: 1 }]);
  });

  it('success halves after bonuses, rounded down', () => {
    const out = computeSaveDamage({ entered: 12, degree: 'success', riders: [rune], entryId: 'e-gob' });
    // floor((12 + 1) / 2) = 6
    expect(out.final).toBe(6);
    expect(out.parts.multiplier).toBe('half');
  });

  it('critical failure doubles after bonuses', () => {
    const out = computeSaveDamage({ entered: 12, degree: 'criticalFailure', riders: [rune], entryId: 'e-gob' });
    expect(out.final).toBe(26);
    expect(out.parts.multiplier).toBe('double');
  });

  it('weakness applies after the multiplier, never halved or doubled, scoped by entryId', () => {
    const half = computeSaveDamage({ entered: 12, degree: 'success', riders: [weakness], entryId: 'e-gob' });
    expect(half.final).toBe(11); // 6 + 5
    const dbl = computeSaveDamage({ entered: 12, degree: 'criticalFailure', riders: [weakness], entryId: 'e-gob' });
    expect(dbl.final).toBe(29); // 24 + 5
    const other = computeSaveDamage({ entered: 12, degree: 'failure', riders: [weakness], entryId: 'e-other' });
    expect(other.final).toBe(12);
    expect(other.parts.weaknesses).toEqual([]);
  });

  it('weakness does not trigger when no damage got through', () => {
    const out = computeSaveDamage({ entered: 1, degree: 'success', riders: [weakness], entryId: 'e-gob' });
    // floor(1/2) = 0 → weakness skipped
    expect(out.final).toBe(0);
    expect(out.parts.weaknesses).toEqual([]);
  });

  it('persistent defaults to failure/criticalFailure, doubled on a crit fail', () => {
    const success = computeSaveDamage({ entered: 12, degree: 'success', riders: [basePersistent], entryId: 'e-gob' });
    expect(success.persistent).toEqual([]);
    const failure = computeSaveDamage({ entered: 12, degree: 'failure', riders: [basePersistent], entryId: 'e-gob' });
    expect(failure.persistent).toEqual([{ dice: '1d4', type: 'electricity', label: 'Persistent electricity' }]);
    const critFail = computeSaveDamage({ entered: 12, degree: 'criticalFailure', riders: [basePersistent], entryId: 'e-gob' });
    expect(critFail.persistent).toEqual([{ dice: '2d4', type: 'electricity', label: 'Persistent electricity' }]);
  });

  it('a crit-fail-exclusive persistent rider keeps its authored dice (Shard Strike)', () => {
    const failure = computeSaveDamage({ entered: 6, degree: 'failure', riders: [critOnlyBleed], entryId: 'e-gob' });
    expect(failure.persistent).toEqual([]);
    const critFail = computeSaveDamage({ entered: 6, degree: 'criticalFailure', riders: [critOnlyBleed], entryId: 'e-gob' });
    expect(critFail.persistent).toEqual([{ dice: '1d6', type: 'bleed', label: 'Shards: persistent bleed' }]);
  });

  it('a rider authored to apply on a success is flagged half (Polarize)', () => {
    const allDegrees = { ...basePersistent, on: ['success', 'failure', 'criticalFailure'] };
    const out = computeSaveDamage({ entered: null, degree: 'success', riders: [allDegrees], entryId: 'e-gob' });
    expect(out.persistent).toEqual([
      { dice: '1d4', type: 'electricity', label: 'Persistent electricity', half: true },
    ]);
  });

  it('persistent-only profiles work without an entered total', () => {
    const out = computeSaveDamage({ entered: null, degree: 'failure', riders: [basePersistent], entryId: 'e-gob' });
    expect(out.final).toBeNull();
    expect(out.persistent).toHaveLength(1);
    expect(computeSaveDamage({ entered: null, degree: 'success', riders: [basePersistent], entryId: 'e-gob' })).toBeNull();
  });

  it('snapshot-disabled riders are skipped', () => {
    const out = computeSaveDamage({
      entered: 12, degree: 'failure',
      riders: [{ ...rune, enabled: false }], entryId: 'e-gob',
    });
    expect(out.final).toBe(12);
  });

  // Condition riders (#228 — Spines' clumsy 1)
  const spineClumsy = {
    id: 'spine-clumsy', label: 'Spines: clumsy 1',
    condition: 'clumsy 1 until the start of your next turn', on: ['criticalFailure'],
  };

  it('condition riders surface on their degree and never change the total', () => {
    const failure = computeSaveDamage({ entered: 6, degree: 'failure', riders: [spineClumsy], entryId: 'e-gob' });
    expect(failure.conditions).toEqual([]);
    expect(failure.final).toBe(6);
    const critFail = computeSaveDamage({ entered: 6, degree: 'criticalFailure', riders: [spineClumsy], entryId: 'e-gob' });
    expect(critFail.final).toBe(12);
    expect(critFail.conditions).toEqual([
      { label: 'Spines: clumsy 1', condition: 'clumsy 1 until the start of your next turn' },
    ]);
  });

  it('condition-only results work without an entered total', () => {
    const out = computeSaveDamage({ entered: null, degree: 'criticalFailure', riders: [spineClumsy], entryId: 'e-gob' });
    expect(out.final).toBeNull();
    expect(out.conditions).toHaveLength(1);
    expect(computeSaveDamage({ entered: null, degree: 'failure', riders: [spineClumsy], entryId: 'e-gob' })).toBeNull();
  });
});

describe('serializeRidersForSave', () => {
  const character = { abilities: { constitution: 18 } };
  const riders = [
    { id: 'con', label: '+Con', bonus: { ability: 'constitution' }, ctx: { expression: '2d6', character } },
    {
      id: 'exploit-weakness', label: 'weakness (fire 5)', weakness: 5,
      appliesToEntryIds: ['e-gob'], defaultOn: true, ctx: { expression: '2d6', character },
    },
    {
      id: 'bleed', label: 'Bleed', persistent: { dice: '1d6', type: 'bleed' },
      on: ['criticalFailure'], ctx: { expression: '2d6', character },
    },
    { id: 'noop', label: 'Nothing', note: 'flavor only', ctx: { expression: '2d6', character } },
  ];

  it('pre-resolves amounts, strips ctx, and drops no-op riders', () => {
    const out = serializeRidersForSave(riders, {});
    expect(out).toEqual([
      { id: 'con', label: '+Con', amount: 4 },
      { id: 'exploit-weakness', label: 'weakness (fire 5)', weakness: 5, appliesToEntryIds: ['e-gob'] },
      { id: 'bleed', label: 'Bleed', persistent: { dice: '1d6', type: 'bleed' }, on: ['criticalFailure'] },
    ]);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it('omits riders the caster unticked', () => {
    const out = serializeRidersForSave(riders, { con: false });
    expect(out.map((r) => r.id)).toEqual(['exploit-weakness', 'bleed']);
  });

  it('condition riders survive serialization (#228)', () => {
    const out = serializeRidersForSave([
      { id: 'spine-clumsy', label: 'Spines: clumsy 1', condition: 'clumsy 1', on: ['criticalFailure'] },
    ], {});
    expect(out).toEqual([
      { id: 'spine-clumsy', label: 'Spines: clumsy 1', condition: 'clumsy 1', on: ['criticalFailure'] },
    ]);
  });
});

describe('formatDamageBreakdown', () => {
  it('renders the save-degree multiplier', () => {
    expect(formatDamageBreakdown({
      final: 6, parts: { base: 12, riders: [], multiplier: 'half', weaknesses: [] }, persistent: [],
    })).toBe('6 (12 half)');
    expect(formatDamageBreakdown({
      final: 26,
      parts: { base: 12, riders: [{ label: 'Rune', amount: 1 }], multiplier: 'double', weaknesses: [] },
      persistent: [],
    })).toBe('26 (12 +1 Rune ×2)');
  });

  it('marks halved persistent entries', () => {
    expect(formatDamageBreakdown({
      final: 6, parts: { base: 12, riders: [], multiplier: 'half', weaknesses: [] },
      persistent: [{ dice: '1d4', type: 'electricity', label: 'x', half: true }],
    })).toBe('6 (12 half) · 1d4 persistent electricity (half) (DC 15 flat to end)');
  });

  it('persistent-only results log just the persistent fragments', () => {
    expect(formatDamageBreakdown({
      final: null, parts: { base: null, riders: [], multiplier: null, weaknesses: [] },
      persistent: [{ dice: '2d4', type: 'electricity', label: 'x' }],
    })).toBe('2d4 persistent electricity (DC 15 flat to end)');
  });

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

  it('appends condition fragments after persistent (#228)', () => {
    expect(formatDamageBreakdown({
      final: 12, parts: { base: 6, riders: [], multiplier: 'double', weaknesses: [] },
      persistent: [],
      conditions: [{ label: 'Spines: clumsy 1', condition: 'clumsy 1 until the start of your next turn' }],
    })).toBe('12 (6 ×2) · clumsy 1 until the start of your next turn');
  });

  it('condition-only results log just the condition', () => {
    expect(formatDamageBreakdown({
      final: null, parts: { base: null, riders: [], multiplier: null, weaknesses: [] },
      persistent: [],
      conditions: [{ label: 'x', condition: 'clumsy 1' }],
    })).toBe('clumsy 1');
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

  // ── heightened damageData (slice 2) ───────────────────────────────────────

  const shockingGrasp = {
    name: 'Shocking Grasp',
    level: 1,
    traits: ['Attack', 'Electricity'],
    damageData: {
      base: '2d12',
      type: 'electricity',
      heightened: { '+1': { base: '1d12', persistent: 1 } },
      riders: [{
        id: 'sg-metal', label: 'Persistent electricity (metal armor)',
        persistent: { dice: '1d4', type: 'electricity' }, defaultOn: false,
      }],
    },
  };

  it('native-rank cast keeps the authored base and persistent dice', () => {
    const profile = buildDamageProfile(shockingGrasp, { id: 'c' }, { castRank: 1 });
    expect(profile.expression).toBe('2d12');
    expect(profile.typeLabel).toBe('electricity');
    expect(profile.riders[0].persistent.dice).toBe('1d4');
  });

  it('heightened cast scales base dice and persistent riders per step', () => {
    const profile = buildDamageProfile(shockingGrasp, { id: 'c' }, { castRank: 3 });
    // +1d12 × 2 steps; persistent +1 × 2 steps
    expect(profile.expression).toBe('4d12');
    expect(profile.riders[0].persistent.dice).toBe('1d4+2');
  });

  it('no castRank → no heightening', () => {
    const profile = buildDamageProfile(shockingGrasp, { id: 'c' }, {});
    expect(profile.expression).toBe('2d12');
  });

  it('absolute heightened keys apply once at or above their rank', () => {
    const spell = {
      name: 'Test', level: 1,
      damageData: { base: '1d6', heightened: { '3rd': { base: '1d6' } } },
    };
    expect(buildDamageProfile(spell, { id: 'c' }, { castRank: 2 }).expression).toBe('1d6');
    expect(buildDamageProfile(spell, { id: 'c' }, { castRank: 3 }).expression).toBe('2d6');
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

  // ── variant damage override (#268) ─────────────────────────────────────────

  const blazingBolt = {
    name: 'Blazing Bolt',
    level: 2,
    traits: ['Attack', 'Fire'],
    damageData: { base: '9d9', type: 'acid' }, // wrong on purpose — override must win
  };
  const oneRay = { base: '2d6', type: 'fire', heightened: { '+1': { base: '1d6' } } };
  const multiRay = { base: '4d6', type: 'fire', heightened: { '+1': { base: '2d6' } } };

  it('damageOverride replaces base, type, and heightened map field-for-field', () => {
    const one = buildDamageProfile(blazingBolt, { id: 'c' }, { damageOverride: oneRay });
    expect(one.expression).toBe('2d6');
    expect(one.typeLabel).toBe('fire');
    const multi = buildDamageProfile(blazingBolt, { id: 'c' }, { damageOverride: multiRay, castRank: 3 });
    // 4d6 + 2d6 per rank above 2
    expect(multi.expression).toBe('6d6');
  });

  it('no override → damageData unchanged', () => {
    const profile = buildDamageProfile(blazingBolt, { id: 'c' }, {});
    expect(profile.expression).toBe('9d9');
    expect(profile.typeLabel).toBe('acid');
  });

  // ── level-scaled content phrases (Eld/amulet powers) ───────────────────────

  it('scales authored per-level phrases to the character level', () => {
    const chains = {
      name: 'Chains of Rust',
      damageData: { base: '2d6 (+1d6 per level)', type: 'bludgeoning' },
    };
    expect(buildDamageProfile(chains, { id: 'c', level: 4 }, {}).expression).toBe('6d6');
    // No level → authored string passes through untouched.
    expect(buildDamageProfile(chains, { id: 'c' }, {}).expression).toBe('2d6 (+1d6 per level)');
  });

  it('scales persistent rider dice phrases (Polarize)', () => {
    const polarize = {
      name: 'Polarize',
      damageData: {
        riders: [{
          id: 'polarize-persistent', label: 'Persistent electricity',
          persistent: { dice: '1d4 per two levels you have', type: 'electricity' },
          on: ['success', 'failure', 'criticalFailure'],
        }],
      },
    };
    const profile = buildDamageProfile(polarize, { id: 'c', level: 6 }, {});
    expect(profile.riders[0].persistent.dice).toBe('3d4');
  });

  it('plain dice expressions are never touched by scaling', () => {
    const profile = buildDamageProfile(strike, { ...character, level: 7 }, {});
    expect(profile.expression).toBe('2d6+4');
  });

  it('scales immediate extra-dice rider phrases (Gloaming Backstab hidden precision)', () => {
    const gloaming = {
      name: 'Gloaming Backstab',
      damageData: {
        base: '2d6 (+1d6 per level)', type: 'void',
        riders: [{
          id: 'gloaming-hidden-precision', label: 'Hidden',
          dice: '2d4 (+1d4 per level)', type: 'precision', defaultOn: false,
        }],
      },
    };
    const profile = buildDamageProfile(gloaming, { id: 'c', level: 4 }, {});
    expect(profile.expression).toBe('6d6');
    expect(profile.riders[0].dice).toBe('6d4');
    // No level → authored phrase passes through untouched.
    expect(buildDamageProfile(gloaming, { id: 'c' }, {}).riders[0].dice)
      .toBe('2d4 (+1d4 per level)');
  });
});

describe('damageHintParts', () => {
  const profile = {
    expression: '6d6', typeLabel: 'void',
    riders: [{
      id: 'gloaming-hidden-precision', label: 'Hidden',
      dice: '6d4', type: 'precision', defaultOn: false,
    }],
  };

  it('returns null profile as an empty list', () => {
    expect(damageHintParts(null, {})).toEqual([]);
  });

  it('omits a defaultOn:false extra-dice rider until it is toggled on', () => {
    expect(damageHintParts(profile, {})).toEqual([
      { dice: '6d6', typeLabel: 'void' },
    ]);
  });

  it('folds an enabled extra-dice rider in with its own type', () => {
    expect(damageHintParts(profile, { 'gloaming-hidden-precision': true })).toEqual([
      { dice: '6d6', typeLabel: 'void' },
      { dice: '6d4', typeLabel: 'precision' },
    ]);
  });

  it('ignores riders without their own dice (flat/persistent)', () => {
    const p = {
      expression: '2d6', typeLabel: 'fire',
      riders: [{ id: 'flat', label: '+2', bonus: { flat: 2 }, defaultOn: true }],
    };
    expect(damageHintParts(p, {})).toEqual([{ dice: '2d6', typeLabel: 'fire' }]);
  });
});

describe('trait-conditional riders (#548 Vitalizing)', () => {
  const ghoul = { entryId: 'e-ghoul', bestiary: { traits: ['undead', 'medium'] } };
  const goblin = { entryId: 'e-gob', bestiary: { traits: ['goblin', 'humanoid'] } };
  const manual = { entryId: 'e-manual' }; // no bestiary → unknown traits

  describe('traitGatedEntryIds', () => {
    it('matches the trait, keeps unknown-trait targets, drops mismatches', () => {
      expect(traitGatedEntryIds('undead', [ghoul, goblin, manual])).toEqual(['e-ghoul', 'e-manual']);
    });
    it('is case-insensitive on the trait slug', () => {
      expect(traitGatedEntryIds('Undead', [ghoul])).toEqual(['e-ghoul']);
    });
  });

  describe('buildDamageProfile resolves appliesVsTrait → appliesToEntryIds', () => {
    const strike = {
      name: 'Greataxe', attackMod: 10, damage: '1d12',
      riders: [{
        id: 'rune-vitalizing-persistent', label: 'Vitalizing (vs undead)',
        persistent: { dice: '1d6', type: 'vitality' }, appliesVsTrait: 'undead',
      }],
    };
    it('scopes the rider to the undead targets', () => {
      const profile = buildDamageProfile(strike, { level: 5 }, { enemyEntries: [ghoul, goblin] });
      const rider = profile.riders.find((r) => r.id === 'rune-vitalizing-persistent');
      expect(rider.appliesToEntryIds).toEqual(['e-ghoul']);
    });
  });

  describe('computeTargetDamage honors the allow-list for persistent + conditions', () => {
    const riders = [
      {
        id: 'vit-p', label: 'Vitalizing (vs undead)',
        persistent: { dice: '1d6', type: 'vitality' }, appliesToEntryIds: ['e-ghoul'],
      },
      {
        id: 'vit-c', label: 'Vitalizing — enfeebled 1 (vs undead)',
        condition: 'enfeebled 1', on: ['criticalSuccess'], appliesToEntryIds: ['e-ghoul'],
      },
    ];
    it('applies persistent vitality on a hit vs the undead target', () => {
      const out = computeTargetDamage({ entered: 12, degree: 'success', riders, entryId: 'e-ghoul' });
      expect(out.persistent).toEqual([{ dice: '1d6', type: 'vitality', label: 'Vitalizing (vs undead)' }]);
    });
    it('suppresses everything vs a non-undead target', () => {
      const out = computeTargetDamage({ entered: 12, degree: 'criticalSuccess', riders, entryId: 'e-gob' });
      expect(out.persistent).toEqual([]);
      expect(out.conditions).toEqual([]);
    });
    it('crit vs undead doubles the persistent dice and surfaces the condition', () => {
      const out = computeTargetDamage({ entered: 12, degree: 'criticalSuccess', riders, entryId: 'e-ghoul' });
      expect(out.persistent[0].dice).toBe('2d6');
      expect(out.conditions).toEqual([{ label: 'Vitalizing — enfeebled 1 (vs undead)', condition: 'enfeebled 1' }]);
    });
  });
});
