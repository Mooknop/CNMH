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
  damageEntryParts,
  hintTypeLabel,
  traitGatedEntryIds,
  damageRollFormulas,
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

  it('a crit-exclusive persistent rider keeps its authored dice (flaming, #1019)', () => {
    const flamingCrit = {
      id: 'rune-flaming-crit-persistent', label: 'Flaming (crit)',
      persistent: { dice: '1d10', type: 'fire' }, on: ['criticalSuccess'], defaultOn: true,
    };
    const hit = computeTargetDamage({
      entered: 9, degree: 'success', riders: [flamingCrit], entryId: 'e-gob',
    });
    expect(hit.persistent).toEqual([]);
    const crit = computeTargetDamage({
      entered: 9, degree: 'criticalSuccess', riders: [flamingCrit], entryId: 'e-gob',
    });
    // the authored 1d10 IS the crit amount — never re-doubled
    expect(crit.persistent).toEqual([{ dice: '1d10', type: 'fire', label: 'Flaming (crit)' }]);
  });

  describe('multi-instance entry (#1019)', () => {
    const inst = [
      { amount: 9, type: 'piercing' },
      { amount: 4, type: 'fire' },
    ];

    it('sums the instances into final and echoes them typed', () => {
      const out = computeTargetDamage({ instances: inst, degree: 'success', entryId: 'e-gob' });
      expect(out.final).toBe(13);
      expect(out.entered).toBe(13);
      expect(out.instances).toEqual([
        { amount: 9, type: 'piercing' },
        { amount: 4, type: 'fire' },
      ]);
    });

    it('crit doubles each instance; numeric riders and weakness attach to the base instance', () => {
      const out = computeTargetDamage({
        instances: inst, degree: 'criticalSuccess',
        riders: [empowerment, weakness], entryId: 'e-gob',
      });
      // base: (9 + 4) × 2 + 5 = 31, fire: 4 × 2 = 8
      expect(out.instances).toEqual([
        { amount: 31, type: 'piercing' },
        { amount: 8, type: 'fire' },
      ]);
      expect(out.final).toBe(39);
    });

    it('an unfilled instance keeps the result null until every part is entered', () => {
      expect(computeTargetDamage({
        instances: [{ amount: 9, type: 'piercing' }, { amount: NaN, type: 'fire' }],
        degree: 'success', entryId: 'e-gob',
      })).toBeNull();
    });

    it('single-total entry carries no instances field', () => {
      const out = computeTargetDamage({ entered: 9, degree: 'success', entryId: 'e-gob' });
      expect(out.instances).toBeUndefined();
    });
  });
});

describe('damageEntryParts', () => {
  const flaming = { id: 'rune-flaming-dice', label: 'Flaming', dice: '1d6', type: 'fire', defaultOn: true };
  const precision = { id: 'gb', label: 'Hidden precision', dice: '6d4', type: 'precision', defaultOn: true };
  const profile = {
    expression: '2d8+4', typeLabel: 'piercing',
    riders: [flaming, precision, { id: 'ie', label: 'flat', bonus: { flat: 4 } }],
  };

  it('splits distinct-typed rider dice into their own parts', () => {
    expect(damageEntryParts(profile, {})).toEqual([
      { key: 'base', dice: '2d8+4', type: 'piercing' },
      { key: 'rune-flaming-dice', dice: '1d6', type: 'fire', label: 'Flaming' },
    ]);
  });

  it('precision, untyped, and same-type rider dice fold into the base part', () => {
    const sameType = { id: 'x', label: 'more fire', dice: '1d6', type: 'Fire', defaultOn: true };
    const parts = damageEntryParts(
      { expression: '1d8', typeLabel: 'fire', riders: [sameType, precision] }, {}
    );
    expect(parts).toEqual([{ key: 'base', dice: '1d8', type: 'fire' }]);
  });

  it('a toggled-off rider drops its part', () => {
    expect(damageEntryParts(profile, { 'rune-flaming-dice': false })).toEqual([
      { key: 'base', dice: '2d8+4', type: 'piercing' },
    ]);
  });

  it('null profile → empty list', () => {
    expect(damageEntryParts(null, {})).toEqual([]);
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

  // Per-degree overrides (#987) — Agonizing Relocation (crit fail ×1.5) and
  // Boulder Crush (crit fail takes full, not double).
  it('a numeric degrees override multiplies and floors (Agonizing Relocation)', () => {
    const out = computeSaveDamage({
      entered: 13, degree: 'criticalFailure', entryId: 'e-gob',
      degrees: { criticalFailure: 1.5 },
    });
    expect(out.final).toBe(19); // floor(13 × 1.5)
    expect(out.parts.multiplier).toBe(1.5);
  });

  it("a 'full' degrees override suppresses the crit-fail doubling (Boulder Crush)", () => {
    const out = computeSaveDamage({
      entered: 12, degree: 'criticalFailure', entryId: 'e-gob',
      degrees: { criticalFailure: 'full' },
    });
    expect(out.final).toBe(12);
    expect(out.parts.multiplier).toBeNull();
  });

  it('degrees overrides leave unlisted degrees on the basic table', () => {
    const degrees = { criticalFailure: 1.5 };
    const success = computeSaveDamage({ entered: 12, degree: 'success', entryId: 'e-gob', degrees });
    expect(success.final).toBe(6);
    expect(success.parts.multiplier).toBe('half');
    const failure = computeSaveDamage({ entered: 12, degree: 'failure', entryId: 'e-gob', degrees });
    expect(failure.final).toBe(12);
  });

  it('degrees overrides apply after bonus riders, before weakness', () => {
    const out = computeSaveDamage({
      entered: 12, degree: 'criticalFailure', riders: [rune, weakness], entryId: 'e-gob',
      degrees: { criticalFailure: 1.5 },
    });
    expect(out.final).toBe(24); // floor((12 + 1) × 1.5) + 5
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

  it('renders a numeric degrees-override multiplier (#987)', () => {
    expect(formatDamageBreakdown({
      final: 19, parts: { base: 13, riders: [], multiplier: 1.5, weaknesses: [] }, persistent: [],
    })).toBe('19 (13 ×1.5)');
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

  it('carries damageData.degrees into the profile, damageOverride winning (#987)', () => {
    const spell = {
      name: 'Boulder Crush', level: 4,
      damageData: { base: '4d12', type: 'bludgeoning', degrees: { criticalFailure: 'full' } },
    };
    const profile = buildDamageProfile(spell, character, {});
    expect(profile.degrees).toEqual({ criticalFailure: 'full' });
    const overridden = buildDamageProfile(spell, character, {
      damageOverride: { degrees: { criticalFailure: 1.5 } },
    });
    expect(overridden.degrees).toEqual({ criticalFailure: 1.5 });
    const plain = buildDamageProfile({ name: 'Zap', damage: '2d6' }, character, {});
    expect(plain.degrees).toBeUndefined();
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

  // ── strike damage types (#1018) ────────────────────────────────────────────

  it('falls back to the strike-level damageType when there is no damageData', () => {
    const strike = { name: 'Longsword Strike', attackMod: 8, damage: '1d8+4', damageType: 'slashing' };
    const profile = buildDamageProfile(strike, { id: 'c' }, {});
    expect(profile.typeLabel).toBe('slashing');
  });

  it('damageData.type and overrides still win over the strike damageType', () => {
    const odd = {
      name: 'Odd Blade', attackMod: 8, damage: '1d8', damageType: 'slashing',
      damageData: { base: '1d8', type: 'fire' },
    };
    expect(buildDamageProfile(odd, { id: 'c' }, {}).typeLabel).toBe('fire');
    expect(buildDamageProfile(odd, { id: 'c' }, { damageOverride: { type: 'cold' } }).typeLabel).toBe('cold');
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

  // ── hint type suppression (#1018) ──────────────────────────────────────────

  it('hintTypeLabel suppresses a type the expression text already names', () => {
    expect(hintTypeLabel('1d6 cold', 'cold')).toBeNull();
    expect(hintTypeLabel('1d4 persistent fire', 'fire')).toBeNull();
    expect(hintTypeLabel('1 nonlethal Bludgeoning', 'bludgeoning')).toBeNull();
    expect(hintTypeLabel('1d8+4', 'slashing')).toBe('slashing');
    expect(hintTypeLabel(null, 'fire')).toBe('fire');
    expect(hintTypeLabel('1d6 cold', null)).toBeNull();
  });

  it('a bomb whose damage string names its type does not render it twice', () => {
    const bomb = { name: 'Frost Vial', attackMod: 5, damage: '1d6 cold', damageType: 'cold' };
    const profile = buildDamageProfile(bomb, { id: 'c' }, {});
    expect(profile.typeLabel).toBe('cold'); // relay/save payloads keep the type
    expect(damageHintParts(profile, {})).toEqual([{ dice: '1d6 cold', typeLabel: null }]);
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

// ── Monster IWR in the outgoing damage step (#1014) ─────────────────────────

describe('computeTargetDamage — monster IWR', () => {
  const troll = {
    immunities: [],
    weaknesses: [{ type: 'fire', value: 5 }],
    resistances: [],
  };
  const golem = {
    immunities: ['fire'],
    weaknesses: [],
    resistances: [{ type: 'cold', value: 7 }],
  };

  it('no defenses / untyped profile: result shape unchanged', () => {
    const plain = computeTargetDamage({ entered: 9, degree: 'success', entryId: 'e-gob' });
    expect(plain.iwr).toBeUndefined();
    expect(plain.rawFinal).toBeUndefined();
    const untyped = computeTargetDamage({
      entered: 9, degree: 'success', entryId: 'e-gob', defenses: golem,
    });
    expect(untyped.final).toBe(9);
    expect(untyped.iwr).toBeUndefined();
  });

  it('non-matching type leaves the result untouched (exact token match)', () => {
    const out = computeTargetDamage({
      entered: 9, degree: 'success', entryId: 'e-troll',
      typeLabel: 'slashing', defenses: troll,
    });
    expect(out.final).toBe(9);
    expect(out.iwr).toBeUndefined();
    expect(out.rawFinal).toBeUndefined();
  });

  it('weakness adds after the crit multiplier; rawFinal keeps the relay raw', () => {
    const out = computeTargetDamage({
      entered: 9, degree: 'criticalSuccess', entryId: 'e-troll',
      typeLabel: 'fire', defenses: troll,
    });
    // 9 × 2 = 18 raw, + weakness 5 = 23 netted
    expect(out.final).toBe(23);
    expect(out.rawFinal).toBe(18);
    expect(out.iwr).toEqual([{ kind: 'weakness', type: 'fire', amount: 5 }]);
  });

  it('resistance reduces after weakness, floored at 0', () => {
    const out = computeTargetDamage({
      entered: 4, degree: 'success', entryId: 'e-golem',
      typeLabel: 'cold', defenses: golem,
    });
    expect(out.final).toBe(0);
    expect(out.rawFinal).toBe(4);
    expect(out.iwr).toEqual([{ kind: 'resistance', type: 'cold', amount: -4 }]);
  });

  it('immunity zeroes the damage outright, precedence over weakness/resistance', () => {
    const weird = {
      immunities: ['fire'],
      weaknesses: [{ type: 'fire', value: 5 }],
      resistances: [{ type: 'fire', value: 2 }],
    };
    const out = computeTargetDamage({
      entered: 13, degree: 'success', entryId: 'e-x',
      typeLabel: 'fire', defenses: weird,
    });
    expect(out.final).toBe(0);
    expect(out.rawFinal).toBe(13);
    expect(out.iwr).toEqual([{ kind: 'immunity', type: 'fire', amount: -13 }]);
  });

  it('type matching is case-insensitive on both sides', () => {
    const out = computeTargetDamage({
      entered: 9, degree: 'success', entryId: 'e-troll',
      typeLabel: 'Fire', defenses: { weaknesses: [{ type: 'FIRE', value: 5 }] },
    });
    expect(out.final).toBe(14);
  });

  it('multi-instance: IWR applies per instance type; rawInstances stay pre-IWR', () => {
    const out = computeTargetDamage({
      instances: [{ amount: 13, type: 'piercing' }, { amount: 4, type: 'fire' }],
      degree: 'success', entryId: 'e-golem', defenses: golem,
    });
    // piercing untouched, fire zeroed by immunity
    expect(out.instances).toEqual([
      { amount: 13, type: 'piercing' }, { amount: 0, type: 'fire' },
    ]);
    expect(out.rawInstances).toEqual([
      { amount: 13, type: 'piercing' }, { amount: 4, type: 'fire' },
    ]);
    expect(out.final).toBe(13);
    expect(out.rawFinal).toBe(17);
    expect(out.iwr).toEqual([{ kind: 'immunity', type: 'fire', amount: -4 }]);
  });

  it('a Mortal Weakness rider dedupes the same monster weakness type (applies once)', () => {
    const mortal = {
      id: 'exploit-weakness', label: 'weakness (fire 5)', weakness: 5,
      weaknessType: 'fire', appliesToEntryIds: ['e-troll'], defaultOn: true,
    };
    const out = computeTargetDamage({
      entered: 9, degree: 'success', riders: [mortal], entryId: 'e-troll',
      typeLabel: 'fire', defenses: troll,
    });
    // 9 + 5 (rider) and NOT another +5 from the monster weakness
    expect(out.final).toBe(14);
    expect(out.iwr).toBeUndefined();
  });

  it('Personal Antithesis (no weaknessType) never dedupes the monster weakness', () => {
    const antithesis = {
      id: 'exploit-weakness', label: 'weakness (Personal Antithesis 4)', weakness: 4,
      appliesToEntryIds: ['e-troll'], defaultOn: true,
    };
    const out = computeTargetDamage({
      entered: 9, degree: 'success', riders: [antithesis], entryId: 'e-troll',
      typeLabel: 'fire', defenses: troll,
    });
    // 9 + 4 (rider) + 5 (monster fire weakness) = 18
    expect(out.final).toBe(18);
    expect(out.iwr).toEqual([{ kind: 'weakness', type: 'fire', amount: 5 }]);
  });
});

describe('computeSaveDamage — monster IWR', () => {
  const golem = {
    immunities: ['fire'],
    weaknesses: [],
    resistances: [{ type: 'cold', value: 7 }],
  };

  it('nets IWR after the multiplier; rawFinal keeps the relay raw', () => {
    const out = computeSaveDamage({
      entered: 21, degree: 'success', entryId: 'e-golem',
      typeLabel: 'cold', defenses: golem,
    });
    // 21 halved → 10 raw, − resistance 7 = 3
    expect(out.final).toBe(3);
    expect(out.rawFinal).toBe(10);
    expect(out.iwr).toEqual([{ kind: 'resistance', type: 'cold', amount: -7 }]);
  });

  it('immunity zeroes save damage', () => {
    const out = computeSaveDamage({
      entered: 10, degree: 'criticalFailure', entryId: 'e-golem',
      typeLabel: 'fire', defenses: golem,
    });
    expect(out.final).toBe(0);
    expect(out.rawFinal).toBe(20);
    expect(out.iwr).toEqual([{ kind: 'immunity', type: 'fire', amount: -20 }]);
  });

  it('no defenses / untyped: unchanged shape', () => {
    const out = computeSaveDamage({
      entered: 10, degree: 'failure', entryId: 'e-golem', defenses: golem,
    });
    expect(out.final).toBe(10);
    expect(out.iwr).toBeUndefined();
    expect(out.rawFinal).toBeUndefined();
  });
});

describe('serializeRidersForSave — weaknessType', () => {
  it('carries weaknessType through the snapshot', () => {
    const out = serializeRidersForSave([{
      id: 'exploit-weakness', label: 'weakness (fire 5)', weakness: 5,
      weaknessType: 'fire', appliesToEntryIds: ['e-1'],
    }], {});
    expect(out[0].weaknessType).toBe('fire');
  });
});

describe('formatDamageBreakdown — fired IWR', () => {
  it('renders weakness/resistance amounts and bare immunity', () => {
    expect(formatDamageBreakdown({
      final: 12,
      parts: { base: 17, riders: [], crit: false, weaknesses: [] },
      iwr: [{ kind: 'weakness', type: 'fire', amount: 5 },
            { kind: 'resistance', type: 'fire', amount: -10 }],
    })).toBe('12 (17 +5 weakness (fire) -10 resistance (fire))');
    expect(formatDamageBreakdown({
      final: 0,
      parts: { base: 13, riders: [], crit: false, weaknesses: [] },
      iwr: [{ kind: 'immunity', type: 'fire', amount: -13 }],
    })).toBe('0 (13 immune (fire))');
  });
});

describe('counts-as iwrTags (#1214 — whetstone material / ghost touch)', () => {
  test('a monster weakness keyed by the tag fires once on the base instance', () => {
    const out = computeTargetDamage({
      entered: 10, degree: 'success', entryId: 'e1',
      typeLabel: 'slashing',
      defenses: { weaknesses: [{ type: 'silver', value: 5 }] },
      iwrTags: ['silver'],
    });
    expect(out.final).toBe(15);
    expect(out.iwr).toEqual([{ kind: 'weakness', type: 'silver', amount: 5 }]);
    expect(out.rawFinal).toBe(10);
  });

  test('tags fire alongside a type weakness, before resistance nets', () => {
    const out = computeTargetDamage({
      entered: 10, degree: 'success', entryId: 'e1',
      typeLabel: 'slashing',
      defenses: {
        weaknesses: [{ type: 'slashing', value: 3 }, { type: 'ghost touch', value: 5 }],
        resistances: [{ type: 'slashing', value: 4 }],
      },
      iwrTags: ['ghost touch'],
    });
    // 10 + 3 (slashing weak) + 5 (ghost touch weak) - 4 (slashing resist) = 14
    expect(out.final).toBe(14);
  });

  test('multi-instance: the tag weakness lands on the first damaging instance only', () => {
    const out = computeTargetDamage({
      instances: [{ amount: 8, type: 'slashing' }, { amount: 4, type: 'fire' }],
      degree: 'success', entryId: 'e1',
      defenses: { weaknesses: [{ type: 'cold iron', value: 5 }] },
      iwrTags: ['cold iron'],
    });
    expect(out.instances.map((i) => i.amount)).toEqual([13, 4]);
    expect(out.final).toBe(17);
  });

  test('no matching weakness → tags are inert', () => {
    const out = computeTargetDamage({
      entered: 10, degree: 'success', entryId: 'e1',
      typeLabel: 'slashing',
      defenses: { weaknesses: [{ type: 'fire', value: 5 }] },
      iwrTags: ['silver'],
    });
    expect(out.final).toBe(10);
    expect(out.iwr).toBeUndefined();
  });

  test('buildDamageProfile carries strike-level iwrTags into the profile', () => {
    const strike = { name: 'Silvered Strike', attackMod: 7, damage: '1d8+4', damageType: 'slashing', iwrTags: ['silver'] };
    const profile = buildDamageProfile(strike, { level: 5 });
    expect(profile.iwrTags).toEqual(['silver']);
    const plain = buildDamageProfile({ name: 'Plain', attackMod: 7, damage: '1d8' }, { level: 5 });
    expect(plain.iwrTags).toBeUndefined();
  });
});

describe('traitGatedEntryIds trait lists (#1215)', () => {
  const entries = [
    { entryId: 'e1', bestiary: { traits: ['Fungus'] } },
    { entryId: 'e2', bestiary: { traits: ['Plant'] } },
    { entryId: 'e3', bestiary: { traits: ['Undead'] } },
    { entryId: 'e4' }, // no trait data — stays in
  ];

  test('a single trait matches as before', () => {
    expect(traitGatedEntryIds('undead', entries)).toEqual(['e3', 'e4']);
  });

  test('a trait list matches any-of', () => {
    expect(traitGatedEntryIds(['fungus', 'plant'], entries)).toEqual(['e1', 'e2', 'e4']);
  });
});

describe('persistent recoveryDc pass-through (#1215)', () => {
  test('computeTargetDamage keeps the rider persistent recoveryDc', () => {
    const riders = [{
      id: 'r1', label: 'Bleed',
      persistent: { dice: '1d6', type: 'bleed', recoveryDc: { base: 17, assisted: 12 } },
    }];
    const out = computeTargetDamage({ entered: 9, degree: 'success', riders, entryId: 'e1' });
    expect(out.persistent[0]).toMatchObject({
      dice: '1d6', type: 'bleed', recoveryDc: { base: 17, assisted: 12 },
    });
  });
});

// ── damageRollFormulas (#1490 S5) ────────────────────────────────────────────
// Keys mirror damageEntryParts; the base formula folds exactly the rider dice
// the entry parts DON'T split out, so a delegated roll matches what the player
// would have hand-rolled into each input.
describe('damageRollFormulas', () => {
  it('base expression only', () => {
    expect(damageRollFormulas({ expression: '2d8+4', typeLabel: 'piercing', riders: [] }, {}))
      .toEqual({ base: '2d8+4' });
  });

  it('folds enabled precision / same-type / untyped rider dice into base', () => {
    const profile = {
      expression: '6d6', typeLabel: 'void',
      riders: [
        { id: 'prec', dice: '6d4', type: 'precision', defaultOn: false },
        { id: 'same', dice: '1d6', type: 'Void', defaultOn: true },
        { id: 'untyped', dice: '1d4', defaultOn: true },
      ],
    };
    expect(damageRollFormulas(profile, { prec: true }))
      .toEqual({ base: '6d6+6d4+1d6+1d4' });
  });

  it('a different-type rider splits into its own keyed formula', () => {
    const profile = {
      expression: '2d8', typeLabel: 'piercing',
      riders: [{ id: 'flaming', dice: '1d6', type: 'fire', defaultOn: true }],
    };
    expect(damageRollFormulas(profile, {}))
      .toEqual({ base: '2d8', flaming: '1d6' });
  });

  it('disabled riders contribute nothing; rider-only profiles still key correctly', () => {
    const profile = {
      expression: null, typeLabel: 'piercing',
      riders: [
        { id: 'flaming', dice: '1d6', type: 'fire', defaultOn: true },
        { id: 'off', dice: '2d6', type: 'cold', defaultOn: false },
      ],
    };
    expect(damageRollFormulas(profile, {})).toEqual({ flaming: '1d6' });
  });
});
