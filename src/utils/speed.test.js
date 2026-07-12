import {
  deriveSpeed,
  speedModifier,
  armorSpeedPenalty,
  shieldSpeedPenalty,
  formatSpeedBreakdown,
  SPEED_FLOOR,
} from './speed';
import { computeEffectBonuses, combineModifiers } from './EffectUtils';

describe('deriveSpeed (SP1 #1220)', () => {
  it('passes the base through untouched with no modifiers', () => {
    const result = deriveSpeed({ base: 30 });
    expect(result.base).toBe(30);
    expect(result.total).toBe(30);
    expect(result.derived).toBe(true);
    expect(result.breakdown).toEqual([
      { label: 'Base Speed', amount: 30, type: 'base' },
    ]);
  });

  it('treats a missing/non-numeric base as 0 (no more || 69 placeholder)', () => {
    expect(deriveSpeed({}).total).toBe(0);
    expect(deriveSpeed({ base: '25 feet' }).total).toBe(0);
    expect(deriveSpeed().total).toBe(0);
  });

  it('applies a net bonus above the base', () => {
    const result = deriveSpeed({
      base: 25,
      modifiers: { total: 10, sources: [{ label: 'Quicksilver Mutagen', bonus: 10 }] },
    });
    expect(result.total).toBe(35);
    expect(result.breakdown).toEqual([
      { label: 'Base Speed', amount: 25, type: 'base' },
      { label: 'Quicksilver Mutagen', amount: 10, type: 'bonus' },
    ]);
  });

  it('floors the total at 5 ft and records the floor row', () => {
    const result = deriveSpeed({
      base: 25,
      modifiers: { total: -30, sources: [{ label: 'Crushing Despair', penalty: -30 }] },
    });
    expect(result.total).toBe(SPEED_FLOOR);
    expect(result.breakdown).toEqual([
      { label: 'Base Speed', amount: 25, type: 'base' },
      { label: 'Crushing Despair', amount: -30, type: 'penalty' },
      { label: 'Minimum Speed (5 ft)', amount: 10, type: 'floor' },
    ]);
  });

  it('adds no floor row when a penalty lands exactly on 5', () => {
    const result = deriveSpeed({
      base: 25,
      modifiers: { total: -20, sources: [{ label: 'X', penalty: -20 }] },
    });
    expect(result.total).toBe(5);
    expect(result.breakdown.some((r) => r.type === 'floor')).toBe(false);
  });

  it('never inflates a base already below the floor', () => {
    const result = deriveSpeed({
      base: 0,
      modifiers: { total: -10, sources: [{ label: 'X', penalty: -10 }] },
    });
    expect(result.total).toBe(0);
  });

  it('stacks per PF2e via the existing effect engine (highest status bonus wins)', () => {
    // Two status speed bonuses — only the highest applies (bestOfKind).
    const catalog = [
      { id: 'drums', name: 'Drums of War', modifiers: [{ stat: 'speed', kind: 'status', amount: 5 }] },
      { id: 'quicksilver', name: 'Quicksilver Mutagen', modifiers: [{ stat: 'speed', kind: 'status', amount: 10 }] },
    ];
    const bonuses = computeEffectBonuses(
      [{ id: 'e1', effectId: 'drums' }, { id: 'e2', effectId: 'quicksilver' }],
      catalog,
    );
    const result = deriveSpeed({ base: 25, modifiers: combineModifiers(undefined, bonuses.speed) });
    expect(result.total).toBe(35);
    expect(result.breakdown).toEqual([
      { label: 'Base Speed', amount: 25, type: 'base' },
      { label: 'Quicksilver Mutagen', amount: 10, type: 'bonus' },
    ]);
  });

  it('nets a condition penalty against an effect bonus through combineModifiers', () => {
    const penalty = { total: -10, sources: [{ label: 'Encumbered', penalty: -10 }] };
    const bonus = { total: 5, sources: [{ label: 'Drums of War', bonus: 5 }] };
    const result = deriveSpeed({ base: 25, modifiers: combineModifiers(penalty, bonus) });
    expect(result.total).toBe(20);
    expect(result.breakdown.map((r) => r.type)).toEqual(['base', 'penalty', 'bonus']);
  });
});

describe('armorSpeedPenalty (SP2 #1221)', () => {
  const fullPlate = {
    uid: 'fp',
    name: 'Full Plate',
    armor: { category: 'heavy', acBonus: 6, dexCap: 0, strength: 18, speedPenalty: 10 },
  };
  const breastplate = {
    uid: 'bp',
    name: 'Breastplate',
    armor: { category: 'medium', acBonus: 4, dexCap: 1, strength: 16, speedPenalty: 5 },
  };

  it('applies the full penalty below the Strength threshold', () => {
    expect(armorSpeedPenalty(fullPlate, 10)).toEqual({ label: 'Full Plate', amount: -10 });
  });

  it('reduces the penalty by 5 ft at/above the Strength threshold', () => {
    expect(armorSpeedPenalty(fullPlate, 18)).toEqual({ label: 'Full Plate', amount: -5 });
    expect(armorSpeedPenalty(fullPlate, 20)).toEqual({ label: 'Full Plate', amount: -5 });
  });

  it('waives a −5 penalty entirely at the threshold', () => {
    expect(armorSpeedPenalty(breastplate, 16)).toBeNull();
    expect(armorSpeedPenalty(breastplate, 14)).toEqual({ label: 'Breastplate', amount: -5 });
  });

  it('never waives without an authored Strength threshold', () => {
    const noStr = { name: 'Odd Plate', armor: { category: 'heavy', speedPenalty: 10 } };
    expect(armorSpeedPenalty(noStr, 20)).toEqual({ label: 'Odd Plate', amount: -10 });
  });

  it('folds an armor augmentation Speed penalty + Strength-threshold delta (#1411)', () => {
    // Reinforced Surcoat adds a 5-ft Speed penalty to otherwise penalty-free armor.
    const surcoat = { name: 'Chain Shirt', armor: { category: 'light', acBonus: 2, strength: 12 }, augmentation: { id: 'reinforced-surcoat' } };
    expect(armorSpeedPenalty(surcoat, 8)).toEqual({ label: 'Chain Shirt', amount: -5 });
    // Meeting the (base) Strength threshold waives it.
    expect(armorSpeedPenalty(surcoat, 12)).toBeNull();
    // An augmentation that raises the Strength threshold makes the waiver harder:
    // Full Plate str 18 + Twining Chains (+2) → a Str-18 wearer no longer waives.
    const twined = { name: 'Full Plate', armor: { category: 'heavy', strength: 18, speedPenalty: 10 }, augmentation: { id: 'twining-chains' } };
    expect(armorSpeedPenalty(twined, 18)).toEqual({ label: 'Full Plate', amount: -10 });
    expect(armorSpeedPenalty(twined, 20)).toEqual({ label: 'Full Plate', amount: -5 });
  });

  it('is null for no armor, penalty-free armor, or a non-numeric penalty', () => {
    expect(armorSpeedPenalty(null, 10)).toBeNull();
    expect(armorSpeedPenalty({ name: 'Leather', armor: { category: 'light', acBonus: 1 } }, 10)).toBeNull();
    expect(armorSpeedPenalty({ name: 'X', armor: { speedPenalty: '10' } }, 10)).toBeNull();
  });
});

describe('shieldSpeedPenalty (SP2 #1221)', () => {
  const tower = (state) => ({
    uid: 'ts',
    name: 'Reinforced Tower Shield',
    state,
    shield: { bonus: 2, hardness: 8, hp: 40, brokenThreshold: 20, speedPenalty: 5 },
  });
  const steel = (state) => ({
    uid: 'ss',
    name: 'Steel Shield',
    state,
    shield: { bonus: 2, hardness: 5, hp: 20, brokenThreshold: 10 },
  });

  it('applies a held tower shield penalty', () => {
    expect(shieldSpeedPenalty([tower('held1')])).toEqual({
      label: 'Reinforced Tower Shield',
      amount: -5,
    });
  });

  it('ignores worn/stowed/dropped shields', () => {
    expect(shieldSpeedPenalty([tower('worn')])).toBeNull();
    expect(shieldSpeedPenalty([tower('stowed')])).toBeNull();
    expect(shieldSpeedPenalty([tower('dropped')])).toBeNull();
    expect(shieldSpeedPenalty([{ ...tower(undefined), state: undefined }])).toBeNull();
  });

  it('ignores held shields without a penalty', () => {
    expect(shieldSpeedPenalty([steel('held1')])).toBeNull();
  });

  it('applies the worst single penalty when several shields are held', () => {
    const pavise = {
      uid: 'pv', name: 'Pavise', state: 'held2',
      shield: { bonus: 2, speedPenalty: 10 },
    };
    expect(shieldSpeedPenalty([steel('held1'), tower('held1'), pavise])).toEqual({
      label: 'Pavise',
      amount: -10,
    });
  });
});

describe('deriveSpeed gear penalties (SP2 #1221)', () => {
  it('folds untyped gear rows into the total and breakdown', () => {
    const result = deriveSpeed({
      base: 25,
      gearPenalties: [{ label: 'Full Plate', amount: -5 }],
    });
    expect(result.total).toBe(20);
    expect(result.breakdown).toEqual([
      { label: 'Base Speed', amount: 25, type: 'base' },
      { label: 'Full Plate', amount: -5, type: 'penalty' },
    ]);
  });

  it('stacks gear penalties with typed modifiers (untyped stacks with everything)', () => {
    const result = deriveSpeed({
      base: 25,
      modifiers: {
        total: -5,
        sources: [{ label: 'Encumbered', penalty: -10 }, { label: 'Drums of War', bonus: 5 }],
      },
      gearPenalties: [
        { label: 'Full Plate', amount: -10 },
        { label: 'Reinforced Tower Shield', amount: -5 },
      ],
    });
    expect(result.total).toBe(5); // 25 − 10 − 5 − 10 + 5 = 5, on the floor exactly
    expect(result.breakdown.filter((r) => r.type === 'penalty')).toHaveLength(3);
  });

  it('gear penalties respect the 5 ft floor', () => {
    const result = deriveSpeed({
      base: 10,
      gearPenalties: [{ label: 'Full Plate', amount: -10 }],
    });
    expect(result.total).toBe(SPEED_FLOOR);
    expect(result.breakdown.some((r) => r.type === 'floor')).toBe(true);
  });

  it('drops null/zero/malformed gear rows', () => {
    const result = deriveSpeed({
      base: 25,
      gearPenalties: [null, { label: 'X', amount: 0 }, { label: 'Y' }],
    });
    expect(result.total).toBe(25);
    expect(result.breakdown).toHaveLength(1);
  });
});

describe('speedModifier', () => {
  it('re-shapes the breakdown for PenaltyDisplay (base row excluded)', () => {
    const derived = deriveSpeed({
      base: 25,
      modifiers: {
        total: -5,
        sources: [{ label: 'Encumbered', penalty: -10 }, { label: 'Drums of War', bonus: 5 }],
      },
    });
    expect(speedModifier(derived)).toEqual({
      total: -5,
      sources: [
        { label: 'Encumbered', penalty: -10, isBuff: false },
        { label: 'Drums of War', bonus: 5, isBuff: true },
      ],
    });
  });

  it('includes the floor row as a positive adjustment', () => {
    const derived = deriveSpeed({
      base: 25,
      modifiers: { total: -30, sources: [{ label: 'X', penalty: -30 }] },
    });
    const mod = speedModifier(derived);
    expect(mod.total).toBe(-20); // 25 → 5
    expect(mod.sources).toContainEqual({ label: 'Minimum Speed (5 ft)', bonus: 10, isBuff: true });
  });

  it('is a zero no-op for an unmodified speed or bad input', () => {
    expect(speedModifier(deriveSpeed({ base: 30 }))).toEqual({ total: 0, sources: [] });
    expect(speedModifier(null)).toEqual({ total: 0, sources: [] });
    expect(speedModifier(25)).toEqual({ total: 0, sources: [] });
  });
});

describe('formatSpeedBreakdown (SP4 #1223)', () => {
  it('formats the base row plain and modifier rows signed, in breakdown order', () => {
    const derived = deriveSpeed({
      base: 25,
      modifiers: {
        total: -5,
        sources: [{ label: 'Encumbered', penalty: -10 }, { label: 'Drums of War', bonus: 5 }],
      },
      gearPenalties: [{ label: 'Full Plate', amount: -5 }],
    });
    expect(formatSpeedBreakdown(derived)).toBe(
      'Base Speed 25, Full Plate -5, Encumbered -10, Drums of War +5'
    );
  });

  it('is just the base row for an unmodified speed', () => {
    expect(formatSpeedBreakdown(deriveSpeed({ base: 30 }))).toBe('Base Speed 30');
  });

  it('is empty for missing/invalid input', () => {
    expect(formatSpeedBreakdown(null)).toBe('');
    expect(formatSpeedBreakdown(25)).toBe('');
  });
});
