import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import {
  affixedKey, itemUidOf, isTalisman, affixTargetType, hostMatchesType,
  validAffixHosts, affixedHostUid, affix, unaffix, affixedUidSet, affixedTalismansByHost,
  affixedTalismanItems, deactivateTalisman,
} from './affix';

const wolfFang = { uid: 't1', name: 'Wolf Fang', traits: ['Consumable', 'Talisman'], talisman: { affixTo: 'weapon' } };
const pin = { uid: 't2', name: 'Sanitizing Pin', traits: ['Talisman'], talisman: { affixTo: 'armor' } };
const sword = { uid: 'w1', name: 'Longsword', strikes: [{ damage: '1d8' }] };
const plate = { uid: 'a1', name: 'Full Plate', armor: { ac: 6 } };
const shield = { uid: 's1', name: 'Steel Shield', shield: { hardness: 5 } };
const rope = { uid: 'r1', name: 'Rope' };

describe('affix util (#254/#339)', () => {
  it('keys the overlay per character', () => {
    expect(affixedKey('izzy')).toBe('cnmh_affixed_izzy');
  });

  it('itemUidOf prefers uid → id → name', () => {
    expect(itemUidOf({ uid: 'u', id: 'i', name: 'n' })).toBe('u');
    expect(itemUidOf({ id: 'i', name: 'n' })).toBe('i');
    expect(itemUidOf({ name: 'n' })).toBe('n');
    expect(itemUidOf(null)).toBeNull();
  });

  it('isTalisman detects the Talisman trait (case-insensitive)', () => {
    expect(isTalisman(wolfFang)).toBe(true);
    expect(isTalisman({ traits: ['talisman'] })).toBe(true);
    expect(isTalisman(sword)).toBe(false);
  });

  it('affixTargetType reads the declared host type', () => {
    expect(affixTargetType(wolfFang)).toBe('weapon');
    expect(affixTargetType({})).toBeNull();
  });

  describe('hostMatchesType', () => {
    it('matches weapons by strikes, armor by armor block, shield by shield block', () => {
      expect(hostMatchesType(sword, 'weapon')).toBe(true);
      expect(hostMatchesType(plate, 'armor')).toBe(true);
      expect(hostMatchesType(shield, 'shield')).toBe(true);
      expect(hostMatchesType(sword, 'armor')).toBe(false);
    });
    it('null/unknown type matches any non-talisman item', () => {
      expect(hostMatchesType(rope, null)).toBe(true);
      expect(hostMatchesType(wolfFang, null)).toBe(false); // a talisman is never a host
    });
  });

  it('validAffixHosts filters by type and excludes the talisman itself', () => {
    const items = [wolfFang, pin, sword, plate, shield, rope];
    expect(validAffixHosts(items, wolfFang).map((i) => i.uid)).toEqual(['w1']); // weapons only
    expect(validAffixHosts(items, pin).map((i) => i.uid)).toEqual(['a1']);      // armor only
  });

  it('a base + runes weapon is a valid talisman host — runes and affix coexist (#609)', () => {
    const runedAxe = {
      uid: 'w2', name: 'Greataxe',
      runes: { potency: 2, property: [{ id: 'vitalizing', name: 'Vitalizing' }] },
      strikes: [{ damage: '1d12' }],
    };
    expect(hostMatchesType(runedAxe, 'weapon')).toBe(true); // matched by its strikes, runes are irrelevant here
    expect(validAffixHosts([wolfFang, runedAxe], wolfFang).map((i) => i.uid)).toEqual(['w2']);
  });

  describe('affix / unaffix / affixedHostUid', () => {
    it('binds and reads back the host uid immutably', () => {
      const o1 = affix({}, 't1', 'w1');
      expect(o1).toEqual({ t1: 'w1' });
      expect(affixedHostUid(o1, 't1')).toBe('w1');
      expect(affixedHostUid(o1, 'nope')).toBeNull();
      const o2 = affix(o1, 't2', 'a1');
      expect(o1).toEqual({ t1: 'w1' }); // original untouched
      expect(o2).toEqual({ t1: 'w1', t2: 'a1' });
    });
    it('unaffix removes a binding immutably', () => {
      const o = { t1: 'w1', t2: 'a1' };
      expect(unaffix(o, 't1')).toEqual({ t2: 'a1' });
      expect(o).toEqual({ t1: 'w1', t2: 'a1' });
    });
  });

  it('affixedUidSet lists the affixed talisman uids', () => {
    expect([...affixedUidSet({ t1: 'w1', t2: 'a1' })]).toEqual(['t1', 't2']);
    expect([...affixedUidSet(null)]).toEqual([]);
  });

  describe('affixedTalismansByHost', () => {
    it('groups resolved talismans under their host uid', () => {
      const flat = [wolfFang, pin, sword, plate];
      const out = affixedTalismansByHost({ t1: 'w1', t2: 'a1' }, flat);
      expect(out.w1.map((t) => t.name)).toEqual(['Wolf Fang']);
      expect(out.a1.map((t) => t.name)).toEqual(['Sanitizing Pin']);
    });
    it('skips stale talisman uids that no longer resolve', () => {
      const out = affixedTalismansByHost({ gone: 'w1' }, [sword]);
      expect(out).toEqual({});
    });
  });

  it('affixedTalismanItems resolves the affixed talismans as items', () => {
    const flat = [wolfFang, pin, sword, plate];
    expect(affixedTalismanItems({ t1: 'w1' }, flat).map((t) => t.name)).toEqual(['Wolf Fang']);
    expect(affixedTalismanItems({}, flat)).toEqual([]);
  });

  describe('deactivateTalisman', () => {
    it('bumps the consumed count (by name) and drops the affix binding (by uid)', () => {
      let consumed = {};
      let affixed = { t1: 'w1', t2: 'a1' };
      const setConsumed = vi.fn((fn) => { consumed = fn(consumed); });
      const setAffixed = vi.fn((fn) => { affixed = fn(affixed); });
      deactivateTalisman({ talisman: wolfFang, setConsumed, setAffixed });
      expect(consumed).toEqual({ 'Wolf Fang': 1 });
      expect(affixed).toEqual({ t2: 'a1' });
    });
    it('is a no-op without a talisman', () => {
      const setConsumed = vi.fn();
      expect(() => deactivateTalisman({ talisman: null, setConsumed })).not.toThrow();
      expect(setConsumed).not.toHaveBeenCalled();
    });
  });
});
