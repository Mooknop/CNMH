// buildRollFx (#1490 S3) — the compact roll payload riding the 'ability' fx
// event. Null when there is no resolved roll, so pre-S3 event shapes survive.
import { buildRollFx, ROLL_TOAST_TARGET_CAP } from './rollToast';

const result = (name, degree, total = 17) => ({ entryId: name, name, degree, total });

describe('buildRollFx', () => {
  test('null without a d20 face or without results', () => {
    expect(buildRollFx({ d20: null, flavor: 'x', results: [result('Goblin', 'success')] })).toBeNull();
    expect(buildRollFx({ d20: 14, flavor: 'x', results: null })).toBeNull();
    expect(buildRollFx({ d20: 14, flavor: 'x', results: [] })).toBeNull();
  });

  test('carries face, first total, flavor, and attack flag', () => {
    const fx = buildRollFx({
      d20: 14,
      flavor: 'Strike: Longsword (MAP -5)',
      results: [result('Goblin', 'success', 19)],
      attack: true,
    });
    expect(fx).toEqual({
      d20: 14,
      total: 19,
      flavor: 'Strike: Longsword (MAP -5)',
      attack: true,
      targets: [{ name: 'Goblin', degree: 'success' }],
      more: 0,
    });
  });

  test('degree-less results (no DC) still toast the die, with no chips', () => {
    const fx = buildRollFx({ d20: 8, flavor: 'Use: Whip', results: [result('Mystery', null)] });
    expect(fx.targets).toEqual([]);
    expect(fx.more).toBe(0);
    expect(fx.d20).toBe(8);
  });

  test('caps targets and counts the overflow', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => result(n, 'failure'));
    const fx = buildRollFx({ d20: 3, flavor: 'x', results: many });
    expect(fx.targets).toHaveLength(ROLL_TOAST_TARGET_CAP);
    expect(fx.more).toBe(many.length - ROLL_TOAST_TARGET_CAP);
  });
});
