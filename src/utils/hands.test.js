import { describe, it, expect } from 'vitest';
import { deriveHands, isTwoHanded, wieldableWorn, handCandidates } from './hands';

describe('deriveHands', () => {
  it('returns empty slots for no held items', () => {
    expect(deriveHands([{ uid: 'a', state: 'worn' }])).toEqual({ slot1: null, slot2: null });
    expect(deriveHands([])).toEqual({ slot1: null, slot2: null });
  });

  it('places held1 items by their hand assignment', () => {
    const sword = { uid: 's', state: 'held1', hand: 1 };
    const shield = { uid: 'b', state: 'held1', hand: 2 };
    expect(deriveHands([shield, sword])).toEqual({ slot1: sword, slot2: shield });
  });

  it('fills both slots with a two-handed grip', () => {
    const bow = { uid: 'bow', state: 'held2' };
    expect(deriveHands([bow])).toEqual({ slot1: bow, slot2: bow });
  });

  it('drops hand-less held1 items into the first free slots', () => {
    const a = { uid: 'a', state: 'held1' };
    const b = { uid: 'b', state: 'held1' };
    expect(deriveHands([a, b])).toEqual({ slot1: a, slot2: b });
  });

  it('prefers an explicit hand over a hand-less item for that slot', () => {
    const assigned = { uid: 'a', state: 'held1', hand: 2 };
    const loose = { uid: 'l', state: 'held1' };
    const { slot1, slot2 } = deriveHands([assigned, loose]);
    expect(slot2).toBe(assigned);
    expect(slot1).toBe(loose);
  });

  it('tolerates a non-array argument', () => {
    expect(deriveHands(undefined)).toEqual({ slot1: null, slot2: null });
    expect(deriveHands(null)).toEqual({ slot1: null, slot2: null });
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

describe('wieldableWorn / handCandidates', () => {
  const sword = { uid: 's', name: 'Sword', state: 'held1', hand: 1 };
  const dagger = { uid: 'd', name: 'Dagger', state: 'worn' };
  const pack = { uid: 'p', name: 'Backpack', state: 'worn', container: { capacity: 4 } };
  const tattoo = { uid: 't', name: 'Warding Tattoo', state: 'worn', traits: ['Tattoo'] };

  it('keeps worn wieldables, dropping containers and body-bound gear', () => {
    expect(wieldableWorn([sword, dagger, pack, tattoo])).toEqual([dagger]);
  });

  it('lists held items (one row per 2H grip) followed by the worn pool', () => {
    expect(handCandidates([dagger, sword])).toEqual([sword, dagger]);
    const great = { uid: 'g', name: 'Greatsword', state: 'held2' };
    expect(handCandidates([great, dagger])).toEqual([great, dagger]);
  });

  it('tolerates non-array arguments', () => {
    expect(wieldableWorn(undefined)).toEqual([]);
    expect(handCandidates(undefined)).toEqual([]);
  });
});
