import { renderHook, act } from '@testing-library/react';

vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) =>
      ReactLib.useState(typeof init === 'function' ? init() : init),
  };
});

vi.mock('./useCharacter', () => ({
  useCharacter: vi.fn(),
}));

import { useCastingResources } from './useCastingResources';
import { useCharacter } from './useCharacter';

const character = {
  id: 'jade',
  level: 5,
  spellcasting: {
    ability: 'charisma',
    spell_slots: { 1: 3, 2: 2 },
    focus: { max: 2, current: 2 },
  },
};

const charModel = {
  staff: { name: "Xanderghul's Flawless Hammer", charges: { max: 3, current: 3 } },
  scrollItems: [{ name: 'Scroll of Heal', quantity: 2, scroll: { name: 'Heal' } }],
  wandSpells: [{ id: 'w1', name: 'Light', wandName: 'Wand of Light', fromWand: true }],
};

const setup = () => renderHook(() => useCastingResources(character));

beforeEach(() => {
  useCharacter.mockReturnValue(charModel);
});
afterEach(() => vi.clearAllMocks());

describe('useCastingResources', () => {
  describe('optionsFor — free casts', () => {
    it('cantrips cost nothing and carry the auto-heightened rank (#271)', () => {
      const { result } = setup();
      const opts = result.current.optionsFor({ name: 'Detect Magic', level: 0 }, 'slot');
      // Level-5 caster → rank ceil(5/2) = 3; label unchanged.
      expect(opts).toEqual([expect.objectContaining({
        type: 'cantrip', enabled: true, rank: 3, label: 'Cantrip — no cost',
      })]);
    });

    it('innate spells cost nothing', () => {
      const { result } = setup();
      const opts = result.current.optionsFor({ name: 'Darkness', level: 2, innate: true }, 'innate');
      expect(opts).toEqual([expect.objectContaining({ type: 'innate', enabled: true })]);
    });

    it('spend returns a null label for free casts', () => {
      const { result } = setup();
      let outcome;
      act(() => { outcome = result.current.spend({ type: 'cantrip' }); });
      expect(outcome).toEqual({ ok: true, label: null });
    });
  });

  describe('slots', () => {
    it('non-signature spell offers only its native rank', () => {
      const { result } = setup();
      const opts = result.current.optionsFor({ name: 'Heal', level: 2 }, 'slot');
      expect(opts).toHaveLength(1);
      expect(opts[0]).toMatchObject({ type: 'slot', rank: 2, enabled: true });
      expect(opts[0].label).toContain('2 left');
    });

    it('signature spell offers every rank from native up', () => {
      const { result } = setup();
      const opts = result.current.optionsFor({ name: 'Heal', level: 1, signature: true }, 'slot');
      expect(opts.map((o) => o.rank)).toEqual([1, 2]);
    });

    it('an untracked rank yields no options (no gating)', () => {
      const { result } = setup();
      expect(result.current.optionsFor({ name: 'Wish', level: 9 }, 'slot')).toEqual([]);
    });

    it('spend decrements the rank pool and disables it at 0', () => {
      const { result } = setup();
      let outcome;
      act(() => { outcome = result.current.spend({ type: 'slot', rank: 2 }); });
      expect(outcome.label).toBe('rank 2 slot');
      act(() => { result.current.spend({ type: 'slot', rank: 2 }); });
      const opts = result.current.optionsFor({ name: 'Heal', level: 2 }, 'slot');
      expect(opts[0].enabled).toBe(false);
      expect(opts[0].reason).toMatch(/No rank-2 slots/);
    });

    it('spend clamps at the pool total', () => {
      const { result } = setup();
      act(() => { result.current.spend({ type: 'slot', rank: 2 }); });
      act(() => { result.current.spend({ type: 'slot', rank: 2 }); });
      act(() => { result.current.spend({ type: 'slot', rank: 2 }); });
      expect(result.current.slots.remainingFor(2)).toBe(0);
    });
  });

  describe('focus', () => {
    it('offers one focus point with the remaining count', () => {
      const { result } = setup();
      const opts = result.current.optionsFor({ name: 'Lay on Hands', level: 1 }, 'focus');
      expect(opts[0]).toMatchObject({ type: 'focus', enabled: true });
      expect(opts[0].label).toContain('2 left');
    });

    it('blocks at 0 focus points', () => {
      const { result } = setup();
      act(() => { result.current.spend({ type: 'focus' }); });
      act(() => { result.current.spend({ type: 'focus' }); });
      const opts = result.current.optionsFor({ name: 'Lay on Hands', level: 1 }, 'focus');
      expect(opts[0].enabled).toBe(false);
    });

    it('spend label is "1 Focus Point"', () => {
      const { result } = setup();
      let outcome;
      act(() => { outcome = result.current.spend({ type: 'focus' }); });
      expect(outcome.label).toBe('1 Focus Point');
    });
  });

  describe('staff', () => {
    const staffSpell = { name: 'Fireball', level: 2, fromStaff: true };

    it('offers charges equal to rank plus the slot alternative', () => {
      const { result } = setup();
      const opts = result.current.optionsFor(staffSpell, 'staff');
      expect(opts).toHaveLength(2);
      expect(opts[0]).toMatchObject({ type: 'staff', rank: 2, enabled: true });
      expect(opts[1]).toMatchObject({ type: 'staff-slot', rank: 2, enabled: true });
    });

    it('disables the charge option when charges run short', () => {
      const { result } = setup();
      act(() => { result.current.spend({ type: 'staff', rank: 2 }); }); // 3 → 1 left
      const opts = result.current.optionsFor(staffSpell, 'staff');
      expect(opts[0].enabled).toBe(false);
      expect(opts[1].enabled).toBe(true); // slot path still open
    });

    it('staff spend label includes the charge count', () => {
      const { result } = setup();
      let outcome;
      act(() => { outcome = result.current.spend({ type: 'staff', rank: 2 }); });
      expect(outcome.label).toBe('staff — 2 charges');
      expect(result.current.staff.remaining).toBe(1);
    });

    it('staff-slot spend uses the slot pool, not charges', () => {
      const { result } = setup();
      let outcome;
      act(() => { outcome = result.current.spend({ type: 'staff-slot', rank: 2 }); });
      expect(outcome.label).toBe('rank 2 slot (staff)');
      expect(result.current.staff.remaining).toBe(3);
      expect(result.current.slots.remainingFor(2)).toBe(1);
    });
  });

  describe('wands', () => {
    const wandSpell = { id: 'w1', name: 'Light', level: 1, fromWand: true, wandName: 'Wand of Light' };

    it('offers the daily use while available', () => {
      const { result } = setup();
      const opts = result.current.optionsFor(wandSpell, 'wand');
      expect(opts[0]).toMatchObject({ type: 'wand', key: 'Wand of Light', enabled: true });
    });

    it('blocks once used today', () => {
      const { result } = setup();
      act(() => { result.current.spend({ type: 'wand', key: 'Wand of Light' }); });
      const opts = result.current.optionsFor(wandSpell, 'wand');
      expect(opts[0].enabled).toBe(false);
      expect(opts[0].reason).toMatch(/already used/i);
    });
  });

  describe('scrolls / consumables', () => {
    const scrollSpell = { name: 'Heal', level: 1, fromScroll: true, scrollName: 'Scroll of Heal' };

    it('offers consumption with the remaining count from inventory quantity', () => {
      const { result } = setup();
      const opts = result.current.optionsFor(scrollSpell, 'scroll');
      expect(opts[0]).toMatchObject({ type: 'scroll', key: 'Scroll of Heal', enabled: true });
      expect(opts[0].label).toContain('2 left');
    });

    it('blocks when all copies are consumed; restore re-enables', () => {
      const { result } = setup();
      act(() => { result.current.spend({ type: 'scroll', key: 'Scroll of Heal' }); });
      act(() => { result.current.spend({ type: 'scroll', key: 'Scroll of Heal' }); });
      expect(result.current.optionsFor(scrollSpell, 'scroll')[0].enabled).toBe(false);
      act(() => { result.current.consumables.restore('Scroll of Heal'); });
      expect(result.current.optionsFor(scrollSpell, 'scroll')[0].enabled).toBe(true);
    });

    it('a scroll cantrip still consumes the scroll', () => {
      const { result } = setup();
      const opts = result.current.optionsFor({ ...scrollSpell, level: 0 }, 'scroll');
      expect(opts[0].type).toBe('scroll');
    });

    it('scroll spend label names the scroll', () => {
      const { result } = setup();
      let outcome;
      act(() => { outcome = result.current.spend({ type: 'scroll', key: 'Scroll of Heal' }); });
      expect(outcome.label).toBe('scroll consumed — Scroll of Heal');
    });
  });

  it('falls back to spell flags when castSource is not given', () => {
    const { result } = setup();
    const fromWand = result.current.optionsFor({ id: 'w1', name: 'Light', level: 1, fromWand: true, wandName: 'Wand of Light' });
    expect(fromWand[0].type).toBe('wand');
    const fromScroll = result.current.optionsFor({ name: 'Heal', level: 1, fromScroll: true, scrollName: 'Scroll of Heal' });
    expect(fromScroll[0].type).toBe('scroll');
    const fromStaff = result.current.optionsFor({ name: 'Fireball', level: 2, fromStaff: true });
    expect(fromStaff[0].type).toBe('staff');
  });
});
