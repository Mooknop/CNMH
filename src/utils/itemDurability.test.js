import {
  MATERIAL_STATS,
  durabilityFor,
  isDurableItem,
  isBrokenHp,
  isDestroyedHp,
  applyItemDamage,
  restoreItemHp,
} from './itemDurability';
import { applyShieldBlock } from './shieldBlock';

describe('durabilityFor — resolution order', () => {
  it('returns null for non-items and plain gear', () => {
    expect(durabilityFor(null)).toBeNull();
    expect(durabilityFor(undefined)).toBeNull();
    expect(durabilityFor({ id: 'rope-50ft', name: 'Rope' })).toBeNull();
  });

  it('an authored durability block wins over everything', () => {
    const item = {
      id: 'odd-blade',
      strikes: [{ damage: '1d8' }],
      material: 'Cold Iron',
      durability: { hardness: 13, hp: 40, brokenThreshold: 20 },
    };
    expect(durabilityFor(item)).toEqual({ hardness: 13, hp: 40, brokenThreshold: 20 });
  });

  it('authored block defaults brokenThreshold to half max HP', () => {
    expect(durabilityFor({ id: 'x', durability: { hardness: 5, hp: 25 } })).toEqual({
      hardness: 5, hp: 25, brokenThreshold: 12,
    });
  });

  it('authored block without a positive hp is not durable', () => {
    expect(durabilityFor({ id: 'x', durability: { hardness: 5 } })).toBeNull();
  });

  it('shields use their authored stat block', () => {
    const shield = { id: 'steel-shield', shield: { bonus: 2, hardness: 5, hp: 20, brokenThreshold: 10 } };
    expect(durabilityFor(shield)).toEqual({ hardness: 5, hp: 20, brokenThreshold: 10 });
  });

  it('shields tolerate the legacy health/breakThreshold spelling', () => {
    const shield = { id: 's', shield: { bonus: 2, hardness: 5, health: 20, breakThreshold: 10 } };
    expect(durabilityFor(shield)).toEqual({ hardness: 5, hp: 20, brokenThreshold: 10 });
  });

  it('a reinforcing rune raises the shield durability (#1165)', () => {
    const plain = durabilityFor({ id: 's', shield: { bonus: 2, hardness: 5, hp: 20, brokenThreshold: 10 } });
    const reinforced = durabilityFor({
      id: 's',
      shield: { bonus: 2, hardness: 5, hp: 20, brokenThreshold: 10 },
      runes: { reinforcing: 'minor' },
    });
    expect(reinforced.hardness).toBeGreaterThan(plain.hardness);
    expect(reinforced.hp).toBeGreaterThan(plain.hp);
  });
});

describe('durabilityFor — material table (GM Core p. 252)', () => {
  it('metal armor is ordinary steel: H9 / 36 HP / BT 18', () => {
    const fullPlate = { id: 'full-plate', armor: { category: 'heavy', group: 'plate', acBonus: 6 } };
    expect(durabilityFor(fullPlate)).toEqual({ hardness: 9, hp: 36, brokenThreshold: 18 });
  });

  it('leather armor uses the leather items row: H4 / 16 HP / BT 8', () => {
    const studded = { id: 'studded-leather-armor', armor: { category: 'light', group: 'leather' } };
    expect(durabilityFor(studded)).toEqual({ hardness: 4, hp: 16, brokenThreshold: 8 });
  });

  it('cloth armor uses the cloth row: H1 / 4 HP / BT 2', () => {
    const padded = { id: 'padded-armor', armor: { category: 'light', group: 'cloth' } };
    expect(durabilityFor(padded)).toEqual({ hardness: 1, hp: 4, brokenThreshold: 2 });
  });

  it('armor without a group falls back on its category', () => {
    expect(durabilityFor({ id: 'x', armor: { category: 'light' } })).toEqual(
      MATERIAL_STATS.leather.items
    );
    expect(durabilityFor({ id: 'x', armor: { category: 'heavy' } })).toEqual(
      MATERIAL_STATS.steel.items
    );
  });

  it('metal weapons are thin steel: H5 / 20 HP / BT 10', () => {
    const longsword = { id: 'longsword', strikes: [{ damage: '1d8' }] };
    expect(durabilityFor(longsword)).toEqual({ hardness: 5, hp: 20, brokenThreshold: 10 });
  });

  it('bows and clubs are thin wood: H3 / 12 HP / BT 6', () => {
    expect(durabilityFor({ id: 'longbow', name: 'Longbow', strikes: [{}] })).toEqual({
      hardness: 3, hp: 12, brokenThreshold: 6,
    });
    expect(durabilityFor({ id: 'club', name: 'Club', strikes: [{}] })).toEqual({
      hardness: 3, hp: 12, brokenThreshold: 6,
    });
  });

  it('an authored material overrides the weapon heuristic', () => {
    const gloomBlade = { id: 'gloom-blade', strikes: [{}], material: 'Wood' };
    expect(durabilityFor(gloomBlade)).toEqual(MATERIAL_STATS.wood.thin);
  });

  it('cold iron and iron share the steel row', () => {
    expect(durabilityFor({ id: 'x', strikes: [{}], material: 'Cold Iron' })).toEqual(
      MATERIAL_STATS.steel.thin
    );
    expect(durabilityFor({ id: 'x', armor: { group: 'chain' }, material: 'Iron' })).toEqual(
      MATERIAL_STATS.steel.items
    );
  });

  it('single-object strikes count as a weapon (schema tolerates both shapes)', () => {
    expect(durabilityFor({ id: 'x', strikes: { damage: '1d8' } })).toEqual(
      MATERIAL_STATS.steel.thin
    );
  });

  it('consumable weapons (bombs, holy water) are not tracked', () => {
    expect(durabilityFor({ id: 'holy-water', strikes: {}, traits: ['Consumable', 'Splash'] })).toBeNull();
    expect(durabilityFor({ id: 'acid-flask', strikes: {}, consumable: { uses: 1 } })).toBeNull();
    expect(isDurableItem({ id: 'acid-flask', strikes: {}, consumable: { uses: 1 } })).toBe(false);
  });
});

describe('isBrokenHp / isDestroyedHp', () => {
  it('broken at or below the threshold, destroyed at 0', () => {
    expect(isBrokenHp(11, 10)).toBe(false);
    expect(isBrokenHp(10, 10)).toBe(true);
    expect(isBrokenHp(0, 10)).toBe(true);
    expect(isDestroyedHp(1)).toBe(false);
    expect(isDestroyedHp(0)).toBe(true);
  });

  it('does not report broken for incomplete inputs', () => {
    expect(isBrokenHp(undefined, 10)).toBe(false);
    expect(isBrokenHp(5, undefined)).toBe(false);
    expect(isDestroyedHp(undefined)).toBe(false);
  });
});

describe('applyItemDamage', () => {
  it('hardness reduces each instance of damage before HP is lost', () => {
    const r = applyItemDamage({ dealt: 12, hardness: 5, hp: 20, brokenThreshold: 10 });
    expect(r).toEqual({ prevented: 5, taken: 7, hpAfter: 13, broken: false, destroyed: false });
  });

  it('damage at or below hardness is fully prevented', () => {
    const r = applyItemDamage({ dealt: 4, hardness: 5, hp: 20, brokenThreshold: 10 });
    expect(r.taken).toBe(0);
    expect(r.hpAfter).toBe(20);
  });

  it('crossing the broken threshold marks broken; 0 HP marks destroyed', () => {
    expect(applyItemDamage({ dealt: 15, hardness: 5, hp: 20, brokenThreshold: 10 }).broken).toBe(true);
    const dead = applyItemDamage({ dealt: 99, hardness: 5, hp: 20, brokenThreshold: 10 });
    expect(dead.hpAfter).toBe(0);
    expect(dead.destroyed).toBe(true);
  });

  it('hardnessBonus adds for this hit only and never lowers hardness', () => {
    expect(applyItemDamage({ dealt: 8, hardness: 5, hp: 20, brokenThreshold: 10, hardnessBonus: 2 }).prevented).toBe(7);
    expect(applyItemDamage({ dealt: 8, hardness: 5, hp: 20, brokenThreshold: 10, hardnessBonus: -3 }).prevented).toBe(5);
  });

  it('applyShieldBlock delegates to the same math (no Shield Block regression)', () => {
    const block = applyShieldBlock({ dealt: 12, hardness: 5, shieldHp: 20, brokenThreshold: 10 });
    expect(block).toEqual({
      prevented: 5, characterTakes: 7, shieldTakes: 7, shieldHpAfter: 13,
      broken: false, destroyed: false,
    });
  });
});

describe('restoreItemHp', () => {
  it('restores toward max and clamps there', () => {
    expect(restoreItemHp({ hp: 8, maxHp: 20, amount: 5 })).toBe(13);
    expect(restoreItemHp({ hp: 18, maxHp: 20, amount: 40 })).toBe(20);
  });

  it('a non-positive amount is a no-op', () => {
    expect(restoreItemHp({ hp: 8, maxHp: 20, amount: 0 })).toBe(8);
    expect(restoreItemHp({ hp: 8, maxHp: 20, amount: -3 })).toBe(8);
  });

  it('never reduces HP when maxHp is malformed', () => {
    expect(restoreItemHp({ hp: 8, maxHp: 0, amount: 5 })).toBe(8);
  });
});
