import {
  getHoursForActivity,
  getRollsForActivity,
  getDaysCommitted,
  getRemainingDays,
  isFatigued,
  isCurrentPeriod,
  periodState,
  stampPeriod,
} from './downtimeUtils';

describe('downtimeUtils', () => {
  describe('getDaysCommitted', () => {
    it('returns 0 for an empty ledger', () => {
      expect(getDaysCommitted([])).toBe(0);
    });

    it('returns 0 for null/undefined', () => {
      expect(getDaysCommitted(null)).toBe(0);
      expect(getDaysCommitted(undefined)).toBe(0);
    });

    it('returns the ledger length', () => {
      const ledger = [
        { day: 'Research', night: null },
        { day: 'Research', night: 'Crafting' },
      ];
      expect(getDaysCommitted(ledger)).toBe(2);
    });
  });

  describe('getRemainingDays', () => {
    it('returns the full budget for an empty ledger', () => {
      expect(getRemainingDays([], 7)).toBe(7);
    });

    it('decrements by days committed', () => {
      const ledger = [{ day: 'Research', night: null }];
      expect(getRemainingDays(ledger, 7)).toBe(6);
    });

    it('clamps to 0, never negative', () => {
      const ledger = [
        { day: 'Research', night: null },
        { day: 'Research', night: null },
      ];
      expect(getRemainingDays(ledger, 2)).toBe(0);
      expect(getRemainingDays(ledger, 1)).toBe(0);
    });

    it('returns 0 when blockDays is falsy', () => {
      expect(getRemainingDays([], null)).toBe(0);
      expect(getRemainingDays([], 0)).toBe(0);
    });
  });

  describe('isFatigued', () => {
    it('is false for an empty ledger', () => {
      expect(isFatigued([])).toBe(false);
    });

    it('is false when the last entry has no night block', () => {
      const ledger = [
        { day: 'Research', night: 'Crafting' },
        { day: 'Research', night: null },
      ];
      expect(isFatigued(ledger)).toBe(false);
    });

    it('is true when the last entry has a night block', () => {
      const ledger = [
        { day: 'Research', night: null },
        { day: 'Crafting', night: 'Research' },
      ];
      expect(isFatigued(ledger)).toBe(true);
    });

    it('looks only at the last entry (most-recent day)', () => {
      const ledger = [
        { day: 'Research', night: 'Crafting' },
        { day: 'Research', night: null },
        { day: 'Crafting', night: 'Earn Income' },
      ];
      expect(isFatigued(ledger)).toBe(true);
    });

    it('handles null/undefined ledger gracefully', () => {
      expect(isFatigued(null)).toBe(false);
      expect(isFatigued(undefined)).toBe(false);
    });
  });

  describe('getHoursForActivity (accumulate)', () => {
    it('returns 0 when the activity has no blocks', () => {
      const ledger = [{ day: 'Retrain', night: null }];
      expect(getHoursForActivity(ledger, 'Research')).toBe(0);
    });

    it('counts day blocks (8h each)', () => {
      const ledger = [
        { day: 'Research', night: null },
        { day: 'Research', night: null },
      ];
      expect(getHoursForActivity(ledger, 'Research')).toBe(16);
    });

    it('counts night blocks (8h each)', () => {
      const ledger = [{ day: 'Retrain', night: 'Research' }];
      expect(getHoursForActivity(ledger, 'Research')).toBe(8);
    });

    it('counts both day and night blocks for the same activity', () => {
      const ledger = [{ day: 'Research', night: 'Research' }];
      expect(getHoursForActivity(ledger, 'Research')).toBe(16);
    });

    it('counts only blocks for the named activity across mixed entries', () => {
      const ledger = [
        { day: 'Research', night: 'Crafting' },
        { day: 'Crafting', night: null },
        { day: 'Research', night: null },
      ];
      expect(getHoursForActivity(ledger, 'Research')).toBe(16);
      expect(getHoursForActivity(ledger, 'Crafting')).toBe(16);
    });

    it('returns 0 for an empty or null ledger', () => {
      expect(getHoursForActivity([], 'Research')).toBe(0);
      expect(getHoursForActivity(null, 'Research')).toBe(0);
    });
  });

  describe('getRollsForActivity (instant)', () => {
    it('counts each block as one roll', () => {
      const ledger = [
        { day: 'Earn Income', night: null },
        { day: 'Earn Income', night: 'Earn Income' },
      ];
      expect(getRollsForActivity(ledger, 'Earn Income')).toBe(3);
    });

    it('returns 0 when the activity has no blocks', () => {
      const ledger = [{ day: 'Research', night: null }];
      expect(getRollsForActivity(ledger, 'Earn Income')).toBe(0);
    });
  });

  describe('period scoping', () => {
    const dt = {
      periodStartedAt: 'P1',
      selected: ['Research'],
      ledger: [{ day: 'Research', night: null }],
    };

    describe('isCurrentPeriod', () => {
      it('is true when the stamp matches the active block', () => {
        expect(isCurrentPeriod(dt, 'P1')).toBe(true);
      });

      it('is false when the stamp is from a prior period', () => {
        expect(isCurrentPeriod(dt, 'P2')).toBe(false);
      });

      it('is false for null state or null startedAt', () => {
        expect(isCurrentPeriod(null, 'P1')).toBe(false);
        expect(isCurrentPeriod(dt, null)).toBe(false);
        expect(isCurrentPeriod(dt, undefined)).toBe(false);
      });

      it('does not treat an unstamped state as the current period', () => {
        expect(isCurrentPeriod({ selected: ['X'], ledger: [] }, 'P1')).toBe(false);
      });

      it('compares startedAt by value (gameDate objects round-trip through JSON)', () => {
        // Distinct object references with equal contents — what you get after a
        // value round-trips through the synced-state serializer.
        const stored = { periodStartedAt: { day: 5, month: 2, year: 4725 } };
        const fresh = { day: 5, month: 2, year: 4725 };
        expect(stored.periodStartedAt).not.toBe(fresh); // different references
        expect(isCurrentPeriod(stored, fresh)).toBe(true);
        expect(isCurrentPeriod(stored, { day: 6, month: 2, year: 4725 })).toBe(false);
      });
    });

    describe('periodState', () => {
      it('returns the stored selected/ledger for the current period', () => {
        expect(periodState(dt, 'P1')).toEqual({
          selected: ['Research'],
          ledger: [{ day: 'Research', night: null }],
        });
      });

      it('returns empty for a stale (prior-period) state', () => {
        expect(periodState(dt, 'P2')).toEqual({ selected: [], ledger: [] });
      });

      it('returns empty for null/unstamped state', () => {
        expect(periodState(null, 'P1')).toEqual({ selected: [], ledger: [] });
        expect(periodState({ selected: ['X'], ledger: [{ day: 'X', night: null }] }, 'P1'))
          .toEqual({ selected: [], ledger: [] });
      });
    });

    describe('stampPeriod', () => {
      it('merges the patch onto the current-period base and stamps startedAt', () => {
        const next = stampPeriod(dt, 'P1', { selected: ['Research', 'Crafting'] });
        expect(next).toEqual({
          periodStartedAt: 'P1',
          selected: ['Research', 'Crafting'],
          ledger: [{ day: 'Research', night: null }],
        });
      });

      it('starts from a fresh base when the prior state is from another period', () => {
        const next = stampPeriod(dt, 'P2', { ledger: [{ day: 'Crafting', night: null }] });
        expect(next).toEqual({
          periodStartedAt: 'P2',
          selected: [],
          ledger: [{ day: 'Crafting', night: null }],
        });
      });

      it('stamps null when there is no active period', () => {
        expect(stampPeriod(null, null, { selected: ['X'] })).toEqual({
          periodStartedAt: null,
          selected: ['X'],
          ledger: [],
        });
      });
    });
  });
});
