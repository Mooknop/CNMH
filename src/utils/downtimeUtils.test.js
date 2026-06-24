import {
  benchmarkReached,
  getHoursForActivity,
  getRollsForActivity,
  getDaysCommitted,
  getRemainingDays,
  isFatigued,
  isCurrentPeriod,
  periodState,
  stampPeriod,
  planDays,
  planSelected,
  planToLedger,
  clampPlan,
} from './downtimeUtils';

describe('downtimeUtils', () => {
  describe('benchmarkReached', () => {
    it('is true once banked hours meet benchmark days × 8', () => {
      expect(benchmarkReached(40, 5)).toBe(true); // 5 days = 40h
      expect(benchmarkReached(48, 5)).toBe(true);
    });
    it('is false below the benchmark', () => {
      expect(benchmarkReached(32, 5)).toBe(false);
    });
    it('is never reached for a zero/unset benchmark', () => {
      expect(benchmarkReached(100, 0)).toBe(false);
      expect(benchmarkReached(100, undefined)).toBe(false);
    });
  });

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
      it('returns the legacy stored selected/ledger for the current period', () => {
        expect(periodState(dt, 'P1')).toEqual({
          plan: {},
          status: 'planning',
          paired: {},
          craftApplied: {},
          selected: ['Research'],
          ledger: [{ day: 'Research', night: null }],
        });
      });

      it('returns empty for a stale (prior-period) state', () => {
        expect(periodState(dt, 'P2')).toEqual({
          plan: {}, status: 'planning', paired: {}, craftApplied: {}, selected: [], ledger: [],
        });
      });

      it('returns empty for null/unstamped state', () => {
        expect(periodState(null, 'P1')).toEqual({
          plan: {}, status: 'planning', paired: {}, craftApplied: {}, selected: [], ledger: [],
        });
        expect(periodState({ selected: ['X'], ledger: [{ day: 'X', night: null }] }, 'P1'))
          .toEqual({ plan: {}, status: 'planning', paired: {}, craftApplied: {}, selected: [], ledger: [] });
      });

      it('derives selected/ledger from a plan when present', () => {
        const planned = {
          periodStartedAt: 'P1',
          plan: { Research: 2, 'Earn Income': 1 },
          status: 'ready',
          paired: { Research: true },
        };
        expect(periodState(planned, 'P1')).toEqual({
          plan: { Research: 2, 'Earn Income': 1 },
          status: 'ready',
          paired: { Research: true },
          craftApplied: {},
          selected: ['Research', 'Earn Income'],
          ledger: [
            { day: 'Research', night: null },
            { day: 'Research', night: null },
            { day: 'Earn Income', night: null },
          ],
        });
      });

      it('ignores stale legacy selected/ledger once a plan exists', () => {
        const planned = {
          periodStartedAt: 'P1',
          plan: { Crafting: 1 },
          selected: ['Research'],
          ledger: [{ day: 'Research', night: null }],
        };
        const out = periodState(planned, 'P1');
        expect(out.selected).toEqual(['Crafting']);
        expect(out.ledger).toEqual([{ day: 'Crafting', night: null }]);
      });
    });

    describe('stampPeriod', () => {
      it('merges a legacy patch onto the current-period base and stamps startedAt', () => {
        const next = stampPeriod(dt, 'P1', { selected: ['Research', 'Crafting'] });
        expect(next).toEqual({
          periodStartedAt: 'P1',
          plan: {},
          status: 'planning',
          paired: {},
          craftApplied: {},
          selected: ['Research', 'Crafting'],
          ledger: [{ day: 'Research', night: null }],
        });
      });

      it('starts from a fresh base when the prior state is from another period', () => {
        const next = stampPeriod(dt, 'P2', { ledger: [{ day: 'Crafting', night: null }] });
        expect(next).toEqual({
          periodStartedAt: 'P2',
          plan: {},
          status: 'planning',
          paired: {},
          craftApplied: {},
          selected: [],
          ledger: [{ day: 'Crafting', night: null }],
        });
      });

      it('stamps null when there is no active period', () => {
        expect(stampPeriod(null, null, { selected: ['X'] })).toEqual({
          periodStartedAt: null,
          plan: {},
          status: 'planning',
          paired: {},
          craftApplied: {},
          selected: ['X'],
          ledger: [],
        });
      });

      it('re-derives selected/ledger from a plan patch', () => {
        const next = stampPeriod(dt, 'P1', {
          plan: { Research: 3 }, status: 'ready', paired: { Research: true },
        });
        expect(next).toEqual({
          periodStartedAt: 'P1',
          plan: { Research: 3 },
          status: 'ready',
          paired: { Research: true },
          craftApplied: {},
          selected: ['Research'],
          ledger: [
            { day: 'Research', night: null },
            { day: 'Research', night: null },
            { day: 'Research', night: null },
          ],
        });
      });

      it('carries an existing plan from the base forward when the patch omits it', () => {
        const planned = { periodStartedAt: 'P1', plan: { Crafting: 2 } };
        const next = stampPeriod(planned, 'P1', { status: 'ready' });
        expect(next.plan).toEqual({ Crafting: 2 });
        expect(next.status).toBe('ready');
        expect(next.ledger).toHaveLength(2);
      });
    });
  });

  describe('plan helpers', () => {
    describe('planDays', () => {
      it('sums allocated days', () => {
        expect(planDays({ Research: 3, 'Earn Income': 2 })).toBe(5);
      });
      it('returns 0 for empty/null', () => {
        expect(planDays({})).toBe(0);
        expect(planDays(null)).toBe(0);
        expect(planDays(undefined)).toBe(0);
      });
      it('ignores non-numeric values', () => {
        expect(planDays({ Research: 2, Crafting: undefined })).toBe(2);
      });
    });

    describe('planSelected', () => {
      it('returns activities with at least one day, in key order', () => {
        expect(planSelected({ Research: 2, Crafting: 0, 'Earn Income': 1 }))
          .toEqual(['Research', 'Earn Income']);
      });
      it('returns [] for empty/null', () => {
        expect(planSelected({})).toEqual([]);
        expect(planSelected(null)).toEqual([]);
      });
    });

    describe('planToLedger', () => {
      it('expands each activity into day-only entries', () => {
        expect(planToLedger({ Research: 2, 'Earn Income': 1 })).toEqual([
          { day: 'Research', night: null },
          { day: 'Research', night: null },
          { day: 'Earn Income', night: null },
        ]);
      });
      it('drops zero/negative day-counts and floors fractions', () => {
        expect(planToLedger({ Research: 0, Crafting: -1, Retrain: 2.9 })).toEqual([
          { day: 'Retrain', night: null },
          { day: 'Retrain', night: null },
        ]);
      });
      it('returns [] for empty/null', () => {
        expect(planToLedger({})).toEqual([]);
        expect(planToLedger(null)).toEqual([]);
      });
      it('round-trips through the hours/rolls/days derivations', () => {
        const ledger = planToLedger({ Research: 3, 'Earn Income': 2 });
        expect(getHoursForActivity(ledger, 'Research')).toBe(24);
        expect(getRollsForActivity(ledger, 'Earn Income')).toBe(2);
        expect(getDaysCommitted(ledger)).toBe(5);
      });
    });

    describe('clampPlan', () => {
      it('leaves a plan within budget untouched', () => {
        expect(clampPlan({ Research: 3, 'Earn Income': 2 }, 7))
          .toEqual({ Research: 3, 'Earn Income': 2 });
      });
      it('greedily truncates the overflowing entry and drops the rest', () => {
        expect(clampPlan({ Research: 5, Crafting: 4, Retrain: 1 }, 7))
          .toEqual({ Research: 5, Crafting: 2 });
      });
      it('floors fractions and drops non-positive counts', () => {
        expect(clampPlan({ Research: 2.8, Crafting: 0, Retrain: -3 }, 7))
          .toEqual({ Research: 2 });
      });
      it('returns {} for a zero/falsy budget', () => {
        expect(clampPlan({ Research: 3 }, 0)).toEqual({});
        expect(clampPlan({ Research: 3 }, null)).toEqual({});
      });
    });
  });
});
