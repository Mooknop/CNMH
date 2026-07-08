import { deriveSpeed, speedModifier, SPEED_FLOOR } from './speed';
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
