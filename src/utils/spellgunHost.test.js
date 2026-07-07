import { describe, it, expect } from 'vitest';
import {
  absorbedKey,
  isSpellgunHost,
  spellgunHostCapacity,
  absorbedHostUid,
  absorbedUidSet,
  absorbedOnHost,
  absorbedCountOn,
  canAbsorb,
  absorb,
  retrieve,
  absorbedSpellgunsByHost,
  validSpellgunHosts,
} from './spellgunHost';
import { items } from '../data';

const glove = (uid = 'g1', capacity = 1) => ({ uid, name: 'Arcane Duelist\'s Gloves', spellgunHost: { capacity } });
const gun = (uid) => ({ uid, name: `Gun ${uid}`, traits: ['Spellgun'], spellgun: { against: 'ac' } });

describe('spellgunHost', () => {
  it('keys the overlay per character', () => {
    expect(absorbedKey('petra')).toBe('cnmh_absorbed_petra');
  });

  it('identifies hosts and their capacity', () => {
    expect(isSpellgunHost(glove('g1', 2))).toBe(true);
    expect(isSpellgunHost(gun('x'))).toBe(false);
    expect(isSpellgunHost({ name: 'Gloves' })).toBe(false);
    expect(spellgunHostCapacity(glove('g1', 2))).toBe(2);
    expect(spellgunHostCapacity(gun('x'))).toBe(0);
  });

  describe('absorb — capacity enforcement', () => {
    it('binds a spellgun to a glove with room', () => {
      const next = absorb({}, 'gun1', glove('g1', 1));
      expect(next).toEqual({ gun1: 'g1' });
      expect(absorbedHostUid(next, 'gun1')).toBe('g1');
    });

    it('rejects a spellgun when the glove is full (capacity 1)', () => {
      const full = { gun1: 'g1' };
      const next = absorb(full, 'gun2', glove('g1', 1));
      expect(next).toBe(full); // unchanged
    });

    it('accepts a second spellgun on a capacity-2 glove, rejects a third', () => {
      let ov = absorb({}, 'gun1', glove('g1', 2));
      ov = absorb(ov, 'gun2', glove('g1', 2));
      expect(absorbedOnHost(ov, 'g1').sort()).toEqual(['gun1', 'gun2']);
      const rejected = absorb(ov, 'gun3', glove('g1', 2));
      expect(rejected).toBe(ov); // full at 2
    });

    it('re-absorbing the same spellgun into the same glove is a no-op', () => {
      const ov = { gun1: 'g1' };
      expect(absorb(ov, 'gun1', glove('g1', 1))).toBe(ov);
    });

    it('moves a spellgun from a full glove to one with room', () => {
      const ov = { gun1: 'gA' };
      const moved = absorb(ov, 'gun1', glove('gB', 1));
      expect(moved.gun1).toBe('gB');
    });
  });

  it('retrieve clears a binding (returning the item to inventory)', () => {
    expect(retrieve({ gun1: 'g1', gun2: 'g1' }, 'gun1')).toEqual({ gun2: 'g1' });
  });

  it('canAbsorb / absorbedCountOn reflect current fill', () => {
    const g = glove('g1', 2);
    expect(canAbsorb({}, g)).toBe(true);
    expect(canAbsorb({ gun1: 'g1' }, g)).toBe(true);
    expect(absorbedCountOn({ gun1: 'g1', gun2: 'g1' }, 'g1')).toBe(2);
    expect(canAbsorb({ gun1: 'g1', gun2: 'g1' }, g)).toBe(false);
  });

  it('absorbedUidSet + absorbedSpellgunsByHost resolve display data', () => {
    const overlay = { gun1: 'g1', gun2: 'g1', stale: 'g1' };
    expect(absorbedUidSet(overlay)).toEqual(new Set(['gun1', 'gun2', 'stale']));
    const flat = [gun('gun1'), gun('gun2')]; // 'stale' does not resolve
    const byHost = absorbedSpellgunsByHost(overlay, flat);
    expect(byHost.g1.map((i) => i.uid).sort()).toEqual(['gun1', 'gun2']);
  });

  describe('validSpellgunHosts', () => {
    it('lists hosts with free capacity, excluding non-hosts and full gloves', () => {
      const inv = [glove('gFull', 1), glove('gOpen', 2), gun('gunX'), { uid: 'sword', name: 'Sword', strikes: [] }];
      const overlay = { gunY: 'gFull' }; // gFull is full
      const hosts = validSpellgunHosts(inv, gun('gunX'), overlay);
      expect(hosts.map((h) => h.uid)).toEqual(['gOpen']);
    });

    it('returns [] for a non-spellgun', () => {
      expect(validSpellgunHosts([glove('g1', 1)], { name: 'Potion', traits: ['Consumable'] }, {})).toEqual([]);
    });
  });

  describe('seed content', () => {
    it('ships both gloves as capacity 1 / 2 hosts', () => {
      const base = items.find((i) => i.id === 'arcane-duelists-gloves');
      const greater = items.find((i) => i.id === 'arcane-duelists-gloves-greater');
      expect(isSpellgunHost(base)).toBe(true);
      expect(spellgunHostCapacity(base)).toBe(1);
      expect(spellgunHostCapacity(greater)).toBe(2);
      expect(base.usage).toMatch(/worn/i);
      expect(base.traits).toContain('3rd Party');
    });
  });
});
