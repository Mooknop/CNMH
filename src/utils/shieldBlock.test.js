import { applyShieldBlock } from './shieldBlock';

// Steel shield defaults used in most cases: Hardness 5, 20 HP, BT 10.
const steel = { hardness: 5, shieldHp: 20, brokenThreshold: 10 };

describe('applyShieldBlock', () => {
  it('plan spec: 12 dmg, H5, 20 HP, BT10 → char:7, shield→13, not broken', () => {
    const r = applyShieldBlock({ dealt: 12, ...steel });
    expect(r.prevented).toBe(5);
    expect(r.characterTakes).toBe(7);
    expect(r.shieldTakes).toBe(7);
    expect(r.shieldHpAfter).toBe(13);
    expect(r.broken).toBe(false);
    expect(r.destroyed).toBe(false);
  });

  it('hardness fully absorbs the hit: dealt ≤ hardness → char:0, shield HP unchanged', () => {
    const r = applyShieldBlock({ dealt: 3, ...steel });
    expect(r.prevented).toBe(3);
    expect(r.characterTakes).toBe(0);
    expect(r.shieldHpAfter).toBe(20);
    expect(r.broken).toBe(false);
  });

  it('hit that drops shield HP exactly to BT → broken', () => {
    // BT=10, HP=20, H=5; remaining=5 if dealt=10; shieldHp=20-5=15 not broken.
    // Need remaining = 10: dealt = 15, remaining = 10, shieldHP = 10 = BT → broken.
    const r = applyShieldBlock({ dealt: 15, ...steel });
    expect(r.shieldHpAfter).toBe(10);
    expect(r.broken).toBe(true);
    expect(r.destroyed).toBe(false);
  });

  it('hit that drops shield HP below BT → broken', () => {
    const r = applyShieldBlock({ dealt: 18, ...steel });
    expect(r.shieldHpAfter).toBe(7);
    expect(r.broken).toBe(true);
    expect(r.destroyed).toBe(false);
  });

  it('hit that drops shield HP to 0 → destroyed and broken', () => {
    const r = applyShieldBlock({ dealt: 25, ...steel });
    expect(r.shieldHpAfter).toBe(0);
    expect(r.broken).toBe(true);
    expect(r.destroyed).toBe(true);
  });

  it('shield with 0 HP remaining before the block → destroyed immediately', () => {
    const r = applyShieldBlock({ dealt: 1, hardness: 0, shieldHp: 0, brokenThreshold: 0 });
    expect(r.shieldHpAfter).toBe(0);
    expect(r.destroyed).toBe(true);
  });

  it('tower shield: H8, 64 HP, BT32 — massive hit still may not break', () => {
    const r = applyShieldBlock({ dealt: 20, hardness: 8, shieldHp: 64, brokenThreshold: 32 });
    expect(r.prevented).toBe(8);
    expect(r.shieldHpAfter).toBe(52); // 64 - 12
    expect(r.broken).toBe(false);
  });

  it('shieldHpAfter never goes below 0', () => {
    const r = applyShieldBlock({ dealt: 1000, ...steel });
    expect(r.shieldHpAfter).toBe(0);
  });

  it('character and shield always take the same damage', () => {
    const r = applyShieldBlock({ dealt: 12, ...steel });
    expect(r.characterTakes).toBe(r.shieldTakes);
  });

  it('prevented + characterTakes always equals dealt', () => {
    [0, 1, 5, 12, 100].forEach((dealt) => {
      const r = applyShieldBlock({ dealt, ...steel });
      expect(r.prevented + r.characterTakes).toBe(dealt);
    });
  });
});
