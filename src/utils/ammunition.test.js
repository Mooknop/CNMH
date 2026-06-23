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
  loadedAmmoRef,
  emptyChamberState,
  normalizeChamberState,
  loadedCount,
  firstLoadedChamber,
  nextEmptyChamber,
  pointerChamber,
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

describe('loadedAmmoRef', () => {
  it('captures fire-relevant fields from a special-ammunition item', () => {
    expect(loadedAmmoRef(beaconShot)).toEqual({
      name: 'Beacon Shot',
      item: 'Beacon Shot',
      default: false,
      infinite: false,
      activate: 1,
      onHit: true,
      effectId: 'beacon-shot',
    });
  });

  it('degrades gracefully for an item with no ammunition block', () => {
    expect(loadedAmmoRef(elixir)).toEqual({
      name: 'Eagle-eye Elixir',
      item: 'Eagle-eye Elixir',
      default: false,
      infinite: false,
      activate: 0,
      onHit: false,
      effectId: null,
    });
  });
});

// ── Chamber state (S2) ───────────────────────────────────────────────────────

describe('emptyChamberState', () => {
  it('builds capacity empty chambers at pointer 0', () => {
    expect(emptyChamberState(3)).toEqual({ chambers: [null, null, null], pointer: 0 });
  });

  it('is a zero-length state for a non-capacity weapon', () => {
    expect(emptyChamberState(0)).toEqual({ chambers: [], pointer: 0 });
    expect(emptyChamberState(undefined)).toEqual({ chambers: [], pointer: 0 });
  });
});

describe('normalizeChamberState', () => {
  it('returns a fresh empty state for an absent/garbage value', () => {
    expect(normalizeChamberState(null, 3)).toEqual({ chambers: [null, null, null], pointer: 0 });
    expect(normalizeChamberState({}, 2)).toEqual({ chambers: [null, null], pointer: 0 });
  });

  it('pads missing chambers and drops extras to fit capacity', () => {
    const stored = { chambers: [defaultAmmo(crescentBolt)], pointer: 0 };
    const norm = normalizeChamberState(stored, 3);
    expect(norm.chambers).toHaveLength(3);
    expect(norm.chambers[0]).toMatchObject({ default: true });
    expect(norm.chambers[1]).toBeNull();
    const shrunk = normalizeChamberState({ chambers: [1, 2, 3, 4, 5] }, 2);
    expect(shrunk.chambers).toHaveLength(2);
  });

  it('wraps an out-of-range pointer into capacity', () => {
    expect(normalizeChamberState({ chambers: [], pointer: 5 }, 3).pointer).toBe(2);
    expect(normalizeChamberState({ chambers: [], pointer: -1 }, 3).pointer).toBe(2);
  });

  it('does not mutate the stored object', () => {
    const stored = { chambers: [null], pointer: 0 };
    normalizeChamberState(stored, 3);
    expect(stored.chambers).toHaveLength(1);
  });
});

describe('chamber selectors', () => {
  const state = { chambers: [null, defaultAmmo(crescentBolt), null], pointer: 1 };

  it('loadedCount counts only filled chambers', () => {
    expect(loadedCount(state)).toBe(1);
    expect(loadedCount(emptyChamberState(3))).toBe(0);
    expect(loadedCount(null)).toBe(0);
  });

  it('firstLoadedChamber finds the earliest filled index (-1 when empty)', () => {
    expect(firstLoadedChamber(state)).toBe(1);
    expect(firstLoadedChamber(emptyChamberState(3))).toBe(-1);
  });

  it('nextEmptyChamber finds the earliest empty index (-1 when full)', () => {
    expect(nextEmptyChamber(state)).toBe(0);
    const full = { chambers: [1, 2], pointer: 0 };
    expect(nextEmptyChamber(full)).toBe(-1);
  });

  it('pointerChamber returns the ammo under the pointer, else null', () => {
    expect(pointerChamber(state)).toMatchObject({ default: true });
    expect(pointerChamber({ chambers: [null, null], pointer: 0 })).toBeNull();
  });
});
