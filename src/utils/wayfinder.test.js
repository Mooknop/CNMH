import { describe, it, expect } from 'vitest';
import {
  wayfinderKey, isAeonStone, isWayfinder, slottedStoneUid, wayfinderOfStone,
  slottedStoneUidSet, slotStone, unslotStone, validSlotStones,
  resonantActiveStoneUids, resonantMerge, applyResonant,
} from './wayfinder';

// Worn+invested items (aeon stones + wayfinders carry the Invested trait, so
// they must be invested to contribute — `state` defaults to 'worn').
const wayfinder = { uid: 'wf1', id: 'wayfinder', name: 'Wayfinder', traits: ['Invested', 'Magical'] };
const archaic = { uid: 'wf2', id: 'archaic-wayfinder', name: 'Archaic Wayfinder', traits: ['Invested', 'Magical'] };
const pearly = {
  uid: 'st1', id: 'aeon-stone-pearly-white-spindle', name: 'Aeon Stone (Pearly White Spindle)',
  traits: ['Invested', 'Magical'], resonant: { resistance: { amount: 1, type: 'void' } },
};
const pebble = {
  uid: 'st2', id: 'aeon-stone-polished-pebble', name: 'Aeon Stone (Polished Pebble)',
  traits: ['Invested', 'Magical'], resonant: { grantedSpells: [{ ref: 'grease', tradition: 'primal' }] },
};
const rope = { uid: 'r1', name: 'Rope' };

// isInvested helper over a set of invested uids.
const investedOf = (...uids) => (uid) => uids.includes(uid);

describe('wayfinder util (#928)', () => {
  it('keys the overlay per character', () => {
    expect(wayfinderKey('izzy')).toBe('cnmh_wayfinder_izzy');
  });

  it('detects aeon stones by id or name', () => {
    expect(isAeonStone(pearly)).toBe(true);
    expect(isAeonStone({ name: 'Aeon Stone (Consumed)' })).toBe(true);
    expect(isAeonStone({ id: 'aeon-stone-gold-nodule' })).toBe(true);
    expect(isAeonStone(wayfinder)).toBe(false);
    expect(isAeonStone(rope)).toBe(false);
    expect(isAeonStone(null)).toBe(false);
  });

  it('detects wayfinders by id or name', () => {
    expect(isWayfinder(wayfinder)).toBe(true);
    expect(isWayfinder(archaic)).toBe(true);
    expect(isWayfinder({ name: 'Wayfinder' })).toBe(true);
    expect(isWayfinder(pearly)).toBe(false);
    expect(isWayfinder(null)).toBe(false);
  });

  describe('slot overlay', () => {
    it('reads the slotted stone and reverse-maps the socket', () => {
      const ov = { wf1: 'st1' };
      expect(slottedStoneUid(ov, 'wf1')).toBe('st1');
      expect(slottedStoneUid(ov, 'wf2')).toBeNull();
      expect(slottedStoneUid(null, 'wf1')).toBeNull();
      expect(wayfinderOfStone(ov, 'st1')).toBe('wf1');
      expect(wayfinderOfStone(ov, 'st2')).toBeNull();
    });

    it('slotStone binds a stone and is immutable', () => {
      const ov = {};
      const next = slotStone(ov, 'wf1', 'st1');
      expect(next).toEqual({ wf1: 'st1' });
      expect(ov).toEqual({}); // unchanged
    });

    it('slotStone moves a stone out of its previous socket', () => {
      const ov = { wf1: 'st1' };
      const next = slotStone(ov, 'wf2', 'st1');
      expect(next).toEqual({ wf2: 'st1' }); // wf1 emptied
    });

    it('slotStone displaces a socket’s previous stone', () => {
      const ov = { wf1: 'st1' };
      const next = slotStone(ov, 'wf1', 'st2');
      expect(next).toEqual({ wf1: 'st2' });
    });

    it('unslotStone empties a socket and is immutable', () => {
      const ov = { wf1: 'st1', wf2: 'st2' };
      const next = unslotStone(ov, 'wf1');
      expect(next).toEqual({ wf2: 'st2' });
      expect(ov).toEqual({ wf1: 'st1', wf2: 'st2' });
    });

    it('slottedStoneUidSet collects occupied stones', () => {
      expect(slottedStoneUidSet({ wf1: 'st1', wf2: 'st2' })).toEqual(new Set(['st1', 'st2']));
      expect(slottedStoneUidSet({})).toEqual(new Set());
      expect(slottedStoneUidSet(null)).toEqual(new Set());
    });

    it('validSlotStones lists aeon stones only, excluding the wayfinder', () => {
      const items = [wayfinder, pearly, pebble, rope];
      const valid = validSlotStones(items, wayfinder);
      expect(valid.map((i) => i.uid)).toEqual(['st1', 'st2']);
    });
  });

  describe('resonantActiveStoneUids', () => {
    const inv = [wayfinder, pearly];

    it('is active when slotted, wayfinder worn+invested, stone invested', () => {
      const active = resonantActiveStoneUids(inv, { wf1: 'st1' }, investedOf('wf1', 'st1'));
      expect(active).toEqual(new Set(['st1']));
    });

    it('is inactive with no binding', () => {
      expect(resonantActiveStoneUids(inv, {}, investedOf('wf1', 'st1'))).toEqual(new Set());
    });

    it('is inactive when the wayfinder is not invested', () => {
      expect(resonantActiveStoneUids(inv, { wf1: 'st1' }, investedOf('st1'))).toEqual(new Set());
    });

    it('is inactive when the stone is not invested', () => {
      expect(resonantActiveStoneUids(inv, { wf1: 'st1' }, investedOf('wf1'))).toEqual(new Set());
    });

    it('is inactive when the wayfinder is not worn', () => {
      const stowedWf = { ...wayfinder, state: 'stowed' };
      const active = resonantActiveStoneUids([stowedWf, pearly], { wf1: 'st1' }, investedOf('wf1', 'st1'));
      expect(active).toEqual(new Set());
    });

    it('is inactive when the binding points at a missing / non-stone item', () => {
      expect(resonantActiveStoneUids([wayfinder], { wf1: 'st1' }, investedOf('wf1', 'st1'))).toEqual(new Set());
      const active = resonantActiveStoneUids([wayfinder, rope], { wf1: 'r1' }, investedOf('wf1', 'r1'));
      expect(active).toEqual(new Set());
    });

    it('activates at most one stone per character (first qualifying wayfinder wins)', () => {
      const items = [wayfinder, archaic, pearly, pebble];
      const active = resonantActiveStoneUids(
        items, { wf1: 'st1', wf2: 'st2' }, investedOf('wf1', 'wf2', 'st1', 'st2')
      );
      expect(active).toEqual(new Set(['st1']));
    });
  });

  describe('resonantMerge', () => {
    it('hoists the resistance family', () => {
      const merged = resonantMerge(pearly);
      expect(merged.resistance).toEqual({ amount: 1, type: 'void' });
      expect(pearly.resistance).toBeUndefined(); // non-destructive
    });

    it('hoists and concatenates the modifiers family', () => {
      const stone = {
        uid: 's', id: 'aeon-stone-x', modifiers: [{ stat: 'fort', amount: 1 }],
        resonant: { modifiers: [{ stat: 'will', amount: 1 }] },
      };
      expect(resonantMerge(stone).modifiers).toEqual([
        { stat: 'fort', amount: 1 }, { stat: 'will', amount: 1 },
      ]);
    });

    it('hoists and concatenates the grantedSpells family', () => {
      expect(resonantMerge(pebble).grantedSpells).toEqual([{ ref: 'grease', tradition: 'primal' }]);
    });

    it('returns the item untouched when it has no resonant block', () => {
      expect(resonantMerge(rope)).toBe(rope);
      expect(resonantMerge(null)).toBeNull();
    });
  });

  describe('applyResonant', () => {
    it('merges only active stones, leaving others referentially identical', () => {
      const inv = [wayfinder, pearly, pebble];
      const out = applyResonant(inv, { wf1: 'st1' }, investedOf('wf1', 'st1'));
      const outPearly = out.find((i) => i.uid === 'st1');
      const outPebble = out.find((i) => i.uid === 'st2');
      expect(outPearly.resistance).toEqual({ amount: 1, type: 'void' });
      expect(outPebble).toBe(pebble); // untouched (not slotted)
      expect(out.find((i) => i.uid === 'wf1')).toBe(wayfinder);
    });

    it('returns the same array reference when nothing is active', () => {
      const inv = [wayfinder, pearly];
      expect(applyResonant(inv, {}, investedOf('wf1', 'st1'))).toBe(inv);
    });
  });
});
