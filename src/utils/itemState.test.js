import {
  ITEM_STATES,
  STOWED,
  HELD_STATES,
  isHeldState,
  itemAbilitiesActive,
  normalizeItemState,
} from './itemState';

describe('itemState', () => {
  describe('isHeldState', () => {
    it('is true only for the two held states', () => {
      expect(isHeldState('held1')).toBe(true);
      expect(isHeldState('held2')).toBe(true);
    });

    it('is false for worn / stowed / dropped / unknown / missing', () => {
      expect(isHeldState('worn')).toBe(false);
      expect(isHeldState(STOWED)).toBe(false);
      expect(isHeldState('dropped')).toBe(false);
      expect(isHeldState('bogus')).toBe(false);
      expect(isHeldState(undefined)).toBe(false);
    });

    it('HELD_STATES are a subset of the mutable ITEM_STATES', () => {
      HELD_STATES.forEach((s) => expect(ITEM_STATES).toContain(s));
    });
  });

  describe('itemAbilitiesActive', () => {
    it('is true when the item is held in one or both hands', () => {
      expect(itemAbilitiesActive({ state: 'held1' })).toBe(true);
      expect(itemAbilitiesActive({ state: 'held2' })).toBe(true);
    });

    it('is false when the item is worn / stowed / dropped / stateless', () => {
      expect(itemAbilitiesActive({ state: 'worn' })).toBe(false);
      expect(itemAbilitiesActive({ state: STOWED })).toBe(false);
      expect(itemAbilitiesActive({ state: 'dropped' })).toBe(false);
      expect(itemAbilitiesActive({})).toBe(false);
    });

    it('noHandRequired overrides any non-held state (worn-but-functional gear)', () => {
      expect(itemAbilitiesActive({ state: 'worn', noHandRequired: true })).toBe(true);
      expect(itemAbilitiesActive({ state: STOWED, noHandRequired: true })).toBe(true);
      expect(itemAbilitiesActive({ noHandRequired: true })).toBe(true);
    });

    it('only an explicit true unlocks the override', () => {
      expect(itemAbilitiesActive({ state: 'worn', noHandRequired: false })).toBe(false);
      expect(itemAbilitiesActive({ state: 'worn', noHandRequired: 'yes' })).toBe(false);
    });

    it('is false for a null / undefined item', () => {
      expect(itemAbilitiesActive(null)).toBe(false);
      expect(itemAbilitiesActive(undefined)).toBe(false);
    });
  });

  describe('normalizeItemState (unchanged behaviour)', () => {
    it('keeps the held states intact', () => {
      expect(normalizeItemState('held1')).toBe('held1');
      expect(normalizeItemState('held2')).toBe('held2');
    });
  });
});
