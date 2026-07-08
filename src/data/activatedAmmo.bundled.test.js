// Snapshot integrity gate for activated ammunition (#1272, AA3 of epic #1098):
// verifies the committed seed's ammo payload blocks and weapon ammoTypes
// satisfy the invariants the resolution layer (ammunition.js) and the fire
// flow (UseAbilityModal / RequestedSaves) rely on. Runs the REAL resolvers so
// a schema drift in either direction is caught here.
import { describe, it, expect } from 'vitest';
import { items } from './index';
import {
  ammoBlock,
  isAmmoEligible,
  isNockWeapon,
  strikeAmmoCapacity,
  loadedAmmoRef,
  ammoActivateCost,
  ammoSaveDc,
} from '../utils/ammunition';
import { getCondition } from './pf2eConditions';

const byId = (id) => items.find((i) => i.id === id);
const rangedStrike = (id) => {
  const item = byId(id);
  const strikes = Array.isArray(item.strikes) ? item.strikes : [item.strikes];
  return strikes.find((s) => s.type === 'ranged');
};

const SAVE_STATS = ['fortitude', 'reflex', 'will'];
const DEGREES = ['criticalSuccess', 'success', 'failure', 'criticalFailure'];

describe('nock-eligible weapons (#1270)', () => {
  it.each([
    ['shortbow', 'arrow'],
    ['longbow', 'arrow'],
    ['hunters-bow', 'arrow'],
    ['crossbow', 'bolt'],
  ])('%s is a single-slot nock weapon firing %s', (id, ammoType) => {
    const strike = rangedStrike(id);
    expect(strike.ammoType).toBe(ammoType);
    expect(isNockWeapon(strike)).toBe(true);
    expect(strikeAmmoCapacity(strike)).toBe(1);
  });

  it('the Crescent Cross keeps its capacity-weapon rail (not nock)', () => {
    const strike = rangedStrike('crescent-cross');
    expect(isNockWeapon(strike)).toBe(false);
    expect(strikeAmmoCapacity(strike)).toBe(3);
  });
});

describe('every seed ammunition block is well-formed and loadable', () => {
  const ammoItems = items.filter((i) => ammoBlock(i));

  it('covers the expected ammo set', () => {
    expect(ammoItems.map((i) => i.id).sort()).toEqual([
      'beacon-shot', 'sleep-arrow', 'storm-arrow',
    ]);
  });

  it.each(items.filter((i) => ammoBlock(i)).map((i) => [i.id, i]))(
    '%s loads at least one seed weapon and its payload shapes are valid',
    (id, item) => {
      const block = ammoBlock(item);
      expect(Array.isArray(block.types) && block.types.length).toBeTruthy();
      expect(ammoActivateCost(item)).toBeGreaterThanOrEqual(0);

      // Some held weapon in the catalog must accept this ammo.
      const loaders = items.filter((w) => {
        const strikes = Array.isArray(w.strikes) ? w.strikes : w.strikes ? [w.strikes] : [];
        return strikes.some((s) => isAmmoEligible(item, s));
      });
      expect(loaders.length).toBeGreaterThan(0);

      // The chamber ref carries the payload through to fire (#1271 schema).
      const ref = loadedAmmoRef(item);
      if (block.damage) {
        expect(ref.damage.dice).toMatch(/^\d+d\d+/);
        expect(typeof ref.damage.type).toBe('string');
      }
      if (block.save) {
        expect(SAVE_STATS).toContain(ref.save.stat);
        expect(typeof ref.save.dc).toBe('number');
        Object.entries(ref.save.conditions || {}).forEach(([degree, list]) => {
          expect(DEGREES).toContain(degree);
          list.forEach((c) => expect(typeof c.id).toBe('string'));
        });
      }
      if (block.effectId) {
        expect(ref.onHit).toBe(true);
      }
    }
  );
});

describe('Sleep Arrow (#1272)', () => {
  const sleepArrow = byId('sleep-arrow');

  it('nocks onto a bow and forces the sleep spell Will save (DC 17, rank 1)', () => {
    expect(isAmmoEligible(sleepArrow, rangedStrike('shortbow'))).toBe(true);
    const ref = loadedAmmoRef(sleepArrow);
    expect(ref.save).toMatchObject({ stat: 'will', dc: 17, rank: 1 });
    expect(ref.damage).toBeNull(); // "deals no damage"
  });

  it('its unconscious ladder uses the canonical condition on failure + critical failure', () => {
    const { conditions } = loadedAmmoRef(sleepArrow).save;
    expect(conditions.failure[0].id).toBe('unconscious');
    expect(conditions.criticalFailure[0].id).toBe('unconscious');
    expect(getCondition('unconscious')).toBeTruthy();
    expect(conditions.failure[0].note).toMatch(/1 minute/);
    expect(conditions.criticalFailure[0].note).toMatch(/1 hour/);
  });
});

describe('Storm Arrow (#1272)', () => {
  const stormArrow = byId('storm-arrow');

  it('nocks onto a bow with 3d12 electricity vs basic Reflex DC 25', () => {
    expect(isAmmoEligible(stormArrow, rangedStrike('longbow'))).toBe(true);
    const ref = loadedAmmoRef(stormArrow);
    expect(ref.damage).toEqual({ dice: '3d12', type: 'electricity' });
    expect(ref.save).toMatchObject({ stat: 'reflex', dc: 25, basic: true });
  });

  it('the shock-rune DC bump resolves through ammoSaveDc', () => {
    const { save } = loadedAmmoRef(stormArrow);
    expect(ammoSaveDc(save, rangedStrike('longbow'))).toBe(25);
    expect(ammoSaveDc(save, { runeBreakdown: { properties: ['Shock'] } })).toBe(27);
    expect(ammoSaveDc(save, { runeBreakdown: { properties: ['Greater Shock'] } })).toBe(27);
  });

  it('the wind rider lands on failure and critical failure', () => {
    const { conditions } = loadedAmmoRef(stormArrow).save;
    ['failure', 'criticalFailure'].forEach((degree) => {
      expect(conditions[degree][0].id).toBe('buffeted');
      expect(conditions[degree][0].note).toMatch(/ranged attack rolls/);
    });
  });
});
