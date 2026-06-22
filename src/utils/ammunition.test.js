import { describe, it, expect } from 'vitest';
import {
  weaponCapacity,
  reloadCost,
  isCapacityWeapon,
  weaponAmmoType,
  ammoBlock,
  isAmmoEligible,
  ammoActivateCost,
  defaultAmmo,
} from './ammunition';

// The Crescent Cross ranged strike, as it will look after the S1 content edit:
// structured capacity/reload/ammoType alongside the kept "Capacity 3" trait.
const crescentBolt = {
  name: 'Crescent Cross Bolt',
  type: 'ranged',
  capacity: 3,
  reload: 1,
  ammoType: 'bolt',
  traits: ['Attack', 'Capacity 3', 'Parry', 'Ranged'],
};

// Beacon Shot's structured ammunition block (arrow or bolt, Activate 1).
const beaconShot = {
  id: 'beacon-shot',
  name: 'Beacon Shot',
  traits: ['Consumable', 'Magical'],
  ammunition: {
    types: ['arrow', 'bolt'],
    activate: 1,
    traits: ['Manipulate'],
    effectId: 'beacon-shot',
    onHit: true,
  },
};

// An elixir — a consumable, but not ammunition.
const elixir = {
  id: 'eagle-eye-elixir',
  name: 'Eagle-eye Elixir',
  traits: ['Alchemical', 'Consumable', 'Elixir'],
  consumable: { kind: 'effect', effectId: 'eagle-eye-elixir' },
};

describe('weaponCapacity', () => {
  it('reads the structured capacity field', () => {
    expect(weaponCapacity(crescentBolt)).toBe(3);
  });

  it('falls back to the "Capacity N" display trait', () => {
    expect(weaponCapacity({ traits: ['Attack', 'Capacity 5', 'Ranged'] })).toBe(5);
  });

  it('prefers the structured field over the trait', () => {
    expect(weaponCapacity({ capacity: 2, traits: ['Capacity 9'] })).toBe(2);
  });

  it('is null for a non-capacity strike', () => {
    expect(weaponCapacity({ name: 'Crescent Cross Blade', traits: ['Attack', 'Melee'] })).toBeNull();
    expect(weaponCapacity(null)).toBeNull();
    expect(weaponCapacity({ capacity: 0 })).toBeNull();
  });
});

describe('reloadCost', () => {
  it('reads the structured reload field', () => {
    expect(reloadCost(crescentBolt)).toBe(1);
  });

  it('falls back to a "Reload N" trait', () => {
    expect(reloadCost({ traits: ['Reload 2'] })).toBe(2);
  });

  it('allows a 0-action reload', () => {
    expect(reloadCost({ reload: 0 })).toBe(0);
  });

  it('is null when no reload cost is declared', () => {
    expect(reloadCost({ traits: ['Attack', 'Ranged'] })).toBeNull();
    expect(reloadCost(null)).toBeNull();
  });
});

describe('isCapacityWeapon / weaponAmmoType', () => {
  it('flags a capacity weapon', () => {
    expect(isCapacityWeapon(crescentBolt)).toBe(true);
    expect(isCapacityWeapon({ traits: ['Ranged'] })).toBe(false);
  });

  it('reads and lower-cases the weapon ammo type', () => {
    expect(weaponAmmoType(crescentBolt)).toBe('bolt');
    expect(weaponAmmoType({ ammoType: 'Bolt' })).toBe('bolt');
    expect(weaponAmmoType({})).toBeNull();
  });
});

describe('ammoBlock', () => {
  it('returns the ammunition block for special ammo', () => {
    expect(ammoBlock(beaconShot)).toEqual(beaconShot.ammunition);
  });

  it('is null for a non-ammunition item', () => {
    expect(ammoBlock(elixir)).toBeNull();
    expect(ammoBlock({ ammunition: [] })).toBeNull();
    expect(ammoBlock(null)).toBeNull();
  });
});

describe('isAmmoEligible', () => {
  it('accepts Beacon Shot into a bolt weapon', () => {
    expect(isAmmoEligible(beaconShot, crescentBolt)).toBe(true);
  });

  it('rejects an elixir (not ammunition)', () => {
    expect(isAmmoEligible(elixir, crescentBolt)).toBe(false);
  });

  it('rejects ammo whose types do not match the weapon', () => {
    const sling = { name: 'Sling', capacity: 1, ammoType: 'sling' };
    expect(isAmmoEligible(beaconShot, sling)).toBe(false);
  });

  it('rejects loading into a non-capacity weapon', () => {
    expect(isAmmoEligible(beaconShot, { name: 'Crescent Cross Blade', traits: ['Melee'] })).toBe(false);
  });

  it('accepts when weapon declares no ammoType (any ammunition)', () => {
    expect(isAmmoEligible(beaconShot, { capacity: 3 })).toBe(true);
  });
});

describe('ammoActivateCost', () => {
  it('is the block activate cost for special ammo', () => {
    expect(ammoActivateCost(beaconShot)).toBe(1);
  });

  it('is 0 for a plain bolt / default ammo', () => {
    expect(ammoActivateCost(defaultAmmo(crescentBolt))).toBe(0);
    expect(ammoActivateCost(elixir)).toBe(0);
    expect(ammoActivateCost(null)).toBe(0);
  });
});

describe('defaultAmmo', () => {
  it('names the infinite bolt after the strike and costs no extra action', () => {
    expect(defaultAmmo(crescentBolt)).toEqual({
      name: 'Crescent Cross Bolt',
      default: true,
      infinite: true,
      activate: 0,
      onHit: false,
    });
  });
});
