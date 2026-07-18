import { describe, it, expect } from 'vitest';
import {
  deriveHands,
  isTwoHanded,
  isWieldable,
  wieldableWorn,
  handCandidates,
  isStrappedShield,
  handAllowsStrapUse,
  strappableWorn,
} from './hands';

const buckler = { uid: 'bk', name: 'Buckler', state: 'worn', strapHand: 1, weight: 0.1, shield: { bonus: 1, strapped: true } };

describe('deriveHands', () => {
  it('returns empty slots for no held items', () => {
    expect(deriveHands([{ uid: 'a', state: 'worn' }])).toEqual({ slot1: null, slot2: null, strap1: null, strap2: null });
    expect(deriveHands([])).toEqual({ slot1: null, slot2: null, strap1: null, strap2: null });
  });

  it('places held1 items by their hand assignment', () => {
    const sword = { uid: 's', state: 'held1', hand: 1 };
    const shield = { uid: 'b', state: 'held1', hand: 2 };
    expect(deriveHands([shield, sword])).toEqual({ slot1: sword, slot2: shield, strap1: null, strap2: null });
  });

  it('fills both slots with a two-handed grip', () => {
    const bow = { uid: 'bow', state: 'held2' };
    expect(deriveHands([bow])).toEqual({ slot1: bow, slot2: bow, strap1: null, strap2: null });
  });

  it('drops hand-less held1 items into the first free slots', () => {
    const a = { uid: 'a', state: 'held1' };
    const b = { uid: 'b', state: 'held1' };
    expect(deriveHands([a, b])).toEqual({ slot1: a, slot2: b, strap1: null, strap2: null });
  });

  it('prefers an explicit hand over a hand-less item for that slot', () => {
    const assigned = { uid: 'a', state: 'held1', hand: 2 };
    const loose = { uid: 'l', state: 'held1' };
    const { slot1, slot2 } = deriveHands([assigned, loose]);
    expect(slot2).toBe(assigned);
    expect(slot1).toBe(loose);
  });

  it('tolerates a non-array argument', () => {
    expect(deriveHands(undefined)).toEqual({ slot1: null, slot2: null, strap1: null, strap2: null });
    expect(deriveHands(null)).toEqual({ slot1: null, slot2: null, strap1: null, strap2: null });
  });

  it('overlays a strapped shield on its hand without occupying the slot', () => {
    const sword = { uid: 's', state: 'held1', hand: 1, strikes: { type: 'melee' } };
    expect(deriveHands([buckler, sword])).toEqual({
      slot1: sword,
      slot2: null,
      strap1: buckler,
      strap2: null,
    });
  });

  it('ignores strapped shields that are stowed/dropped or lack the catalog flag', () => {
    expect(deriveHands([{ ...buckler, state: 'stowed' }]).strap1).toBe(null);
    expect(deriveHands([{ ...buckler, state: 'dropped' }]).strap1).toBe(null);
    const plainShield = { uid: 'sh', state: 'worn', strapHand: 1, shield: { bonus: 2 } };
    expect(deriveHands([plainShield]).strap1).toBe(null);
  });
});

describe('isStrappedShield', () => {
  it('requires the shield.strapped catalog flag', () => {
    expect(isStrappedShield(buckler)).toBe(true);
    expect(isStrappedShield({ shield: { bonus: 2 } })).toBe(false);
    expect(isStrappedShield({ strikes: {} })).toBe(false);
    expect(isStrappedShield(null)).toBe(false);
  });
});

describe('handAllowsStrapUse', () => {
  const on = (occupant, hand = 1) =>
    handAllowsStrapUse(
      { slot1: hand === 1 ? occupant : null, slot2: hand === 2 ? occupant : null },
      hand
    );

  it('allows an empty hand', () => {
    expect(on(null)).toBe(true);
    expect(handAllowsStrapUse(undefined, 1)).toBe(true);
  });

  it('allows a light non-weapon (wand, torch), per the RAW buckler rule', () => {
    expect(on({ name: 'Wand of Heal', wand: {}, weight: 0 })).toBe(true);
    expect(on({ name: 'Torch', usage: 'held in 1 hand', weight: 0.1 }, 2)).toBe(true);
  });

  it('blocks weapons of any Bulk and non-light objects', () => {
    expect(on({ name: 'Dagger', strikes: { type: 'melee' }, weight: 0.1 })).toBe(false);
    expect(on({ name: 'Longsword', strikes: { type: 'melee' }, weight: 1 })).toBe(false);
    expect(on({ name: 'Healers Tools', usage: 'held in 2 hands', weight: 1 }, 2)).toBe(false);
  });
});

describe('isTwoHanded', () => {
  it('matches both usage spellings from the seed', () => {
    expect(isTwoHanded({ usage: 'held in 2 hands' })).toBe(true);
    expect(isTwoHanded({ usage: 'held in two hands' })).toBe(true);
  });

  it('rejects one-handers, missing usage, and non-objects', () => {
    expect(isTwoHanded({ usage: 'held in 1 hand' })).toBe(false);
    expect(isTwoHanded({ usage: 'held in one hand' })).toBe(false);
    expect(isTwoHanded({})).toBe(false);
    expect(isTwoHanded(null)).toBe(false);
  });
});

describe('isWieldable', () => {
  it('accepts weapons, shields, staves/wands, and held-usage gear', () => {
    expect(isWieldable({ strikes: { type: 'melee' } })).toBe(true);
    expect(isWieldable({ shield: { bonus: 2 } })).toBe(true);
    expect(isWieldable({ staff: { charges: { max: 5 } } })).toBe(true);
    expect(isWieldable({ wand: {} })).toBe(true);
    expect(isWieldable({ usage: 'held in 1 hand' })).toBe(true);
  });

  it('rejects potions, armor, worn trinkets, and non-objects', () => {
    expect(isWieldable({ name: 'Healing Potion', consumable: { kind: 'healing' } })).toBe(false);
    expect(isWieldable({ name: 'Full Plate', acBonus: 6 })).toBe(false);
    expect(isWieldable({ usage: 'worn cloak' })).toBe(false);
    expect(isWieldable(null)).toBe(false);
  });

  it('rejects strapped shields — they are strap-only, never Swap candidates', () => {
    expect(isWieldable(buckler)).toBe(false);
    expect(isWieldable({ shield: { bonus: 2 } })).toBe(true); // normal shields still wieldable
  });

  it('rejects attachments/runes/talismans even when they carry strike data', () => {
    // Seed shape: attachment field + Attached trait, no usage string.
    expect(isWieldable({ name: 'Shield Spikes', attachment: { to: 'shield' }, traits: ['Attached'], strikes: { type: 'melee' } })).toBe(false);
    expect(isWieldable({ name: 'Shield Boss', traits: ['Attached'], strikes: { type: 'melee' } })).toBe(false);
    expect(isWieldable({ name: 'Bayonet', usage: 'attached to a firearm', strikes: { type: 'melee' } })).toBe(false);
    expect(isWieldable({ name: 'Potency Rune', usage: 'applied to a weapon' })).toBe(false);
    expect(isWieldable({ name: 'Talisman', usage: 'affixed to armor' })).toBe(false);
  });
});

describe('wieldableWorn / handCandidates', () => {
  const sword = { uid: 's', name: 'Sword', state: 'held1', hand: 1, strikes: { type: 'melee' } };
  const dagger = { uid: 'd', name: 'Dagger', state: 'worn', strikes: { type: 'melee' } };
  const potion = { uid: 'po', name: 'Healing Potion', state: 'worn' };
  const pack = { uid: 'p', name: 'Backpack', state: 'worn', container: { capacity: 4 }, usage: 'held in 1 hand' };
  const tattoo = { uid: 't', name: 'Warding Tattoo', state: 'worn', traits: ['Tattoo'], strikes: { type: 'melee' } };

  it('keeps worn wieldables, dropping non-wieldables, containers and body-bound gear', () => {
    expect(wieldableWorn([sword, dagger, potion, pack, tattoo])).toEqual([dagger]);
  });

  it('lists held items (one row per 2H grip) followed by the worn pool', () => {
    expect(handCandidates([dagger, sword])).toEqual([sword, dagger]);
    const great = { uid: 'g', name: 'Greatsword', state: 'held2' };
    expect(handCandidates([great, dagger])).toEqual([great, dagger]);
  });

  it('tolerates non-array arguments', () => {
    expect(wieldableWorn(undefined)).toEqual([]);
    expect(handCandidates(undefined)).toEqual([]);
    expect(strappableWorn(undefined)).toEqual([]);
  });

  it('strappableWorn keeps on-person strapped-class shields, strapped or not', () => {
    const strapped = { ...buckler };
    const unstrapped = { uid: 'bk2', name: 'Gauntlet Buckler', state: 'worn', shield: { bonus: 1, strapped: true } };
    const stowedBk = { uid: 'bk3', state: 'stowed', shield: { bonus: 1, strapped: true } };
    const plainShield = { uid: 'sh', state: 'worn', shield: { bonus: 2 } };
    expect(strappableWorn([strapped, unstrapped, stowedBk, plainShield])).toEqual([strapped, unstrapped]);
  });

  it('handCandidates includes strappable shields so a buckler-only character keeps the Hands group', () => {
    expect(handCandidates([buckler])).toEqual([buckler]);
  });
});
