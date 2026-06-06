import {
  getEventTypeClass,
  createCalendarHelpers,
} from './calendarUtils';

// Mock data from GameDateContext
const mockGOLARION_MONTHS = [
  { name: "Abadius", days: 31, season: "Winter", index: 0 },
  { name: "Calistril", days: 28, season: "Winter", index: 1 },
  { name: "Pharast", days: 31, season: "Spring", index: 2 },
  { name: "Gozran", days: 30, season: "Spring", index: 3 },
  { name: "Desnus", days: 31, season: "Spring", index: 4 },
  { name: "Sarenith", days: 30, season: "Summer", index: 5 },
  { name: "Erastus", days: 31, season: "Summer", index: 6 },
  { name: "Arodus", days: 31, season: "Summer", index: 7 },
  { name: "Rova", days: 30, season: "Autumn", index: 8 },
  { name: "Lamashan", days: 31, season: "Autumn", index: 9 },
  { name: "Neth", days: 30, season: "Autumn", index: 10 },
  { name: "Kuthona", days: 31, season: "Winter", index: 11 }
];

const mockGOLARION_WEEKDAYS = [
  "Moonday", "Toilday", "Wealday", "Oathday", "Fireday", "Starday", "Sunday"
];

const mockTimelineData = [
  {
    title: "Full Moon Event",
    recurring: "full moon of Abadius",
    type: "lunar",
    description: "A full moon event"
  },
  {
    title: "Third Moonday Event",
    recurring: "third Moonday of Lamashan",
    type: "weekly",
    description: "Third Moonday event"
  },
  {
    title: "Regular Event",
    date: { year: 4725, month: 2, day: 5 },
    type: "campaign",
    description: "A regular event"
  }
];

// Mock functions
const mockGetDayOfWeek = vi.fn();
const mockGetMoonPhaseInfo = vi.fn();

describe('calendarUtils', () => {
  describe('getEventTypeClass', () => {
    it('should return default for undefined eventType', () => {
      expect(getEventTypeClass(undefined)).toBe('default');
    });

    it('should return default for empty string', () => {
      expect(getEventTypeClass('')).toBe('default');
    });

    it('should convert spaces to dashes', () => {
      expect(getEventTypeClass('campaign event')).toBe('campaign-event');
    });

    it('should handle normal event types', () => {
      expect(getEventTypeClass('personal')).toBe('personal');
    });
  });

  describe('createCalendarHelpers', () => {
    let helpers;

    beforeEach(() => {
      mockGetDayOfWeek.mockClear();
      mockGetMoonPhaseInfo.mockClear();

      helpers = createCalendarHelpers({
        GOLARION_MONTHS: mockGOLARION_MONTHS,
        GOLARION_WEEKDAYS: mockGOLARION_WEEKDAYS,
        getDayOfWeek: mockGetDayOfWeek,
        getMoonPhaseInfo: mockGetMoonPhaseInfo,
        timelineData: mockTimelineData,
      });
    });

    describe('getNthWeekdayOfMonth', () => {
      beforeEach(() => {
        // Mock getDayOfWeek to return specific weekdays for testing
        // For month 2 (Pharast, 31 days), assume day 1 is Monday (0), so pattern repeats every 7 days
        mockGetDayOfWeek.mockImplementation(({ day }) => {
          return (day - 1) % 7; // day 1 = 0 (Monday), day 2 = 1 (Toilday), etc.
        });
      });

      it('should return null for invalid occurrence', () => {
        expect(helpers.getNthWeekdayOfMonth(4725, 2, 0, 6)).toBeNull(); // 6th Monday in 31-day month
      });

      it('should return the last occurrence when occurrence is -1', () => {
        // For Monday (0), in a 31-day month starting with Monday, Mondays are on days 1,8,15,22,29
        expect(helpers.getNthWeekdayOfMonth(4725, 2, 0, -1)).toBe(29);
      });

      it('should return the correct nth occurrence', () => {
        // For Monday (0), 1st Monday should be day 1
        expect(helpers.getNthWeekdayOfMonth(4725, 2, 0, 1)).toBe(1);
        // 4th Monday should be day 22
        expect(helpers.getNthWeekdayOfMonth(4725, 2, 0, 4)).toBe(22);
      });
    });

    describe('parseRecurringEvent', () => {
      it('should parse "every full moon"', () => {
        const result = helpers.parseRecurringEvent('every full moon');
        expect(result).toEqual({
          type: 'every_full_moon',
          originalText: 'every full moon'
        });
      });

      it('should parse "every new moon"', () => {
        const result = helpers.parseRecurringEvent('every new moon');
        expect(result).toEqual({
          type: 'every_new_moon',
          originalText: 'every new moon'
        });
      });

      it('should parse "full moon of Abadius"', () => {
        const result = helpers.parseRecurringEvent('full moon of Abadius');
        expect(result).toEqual({
          type: 'full_moon_monthly',
          month: 0,
          monthName: 'Abadius',
          originalText: 'full moon of Abadius'
        });
      });

      it('should parse "new moon of Desnus"', () => {
        const result = helpers.parseRecurringEvent('new moon of Desnus');
        expect(result).toEqual({
          type: 'new_moon_monthly',
          month: 4,
          monthName: 'Desnus',
          originalText: 'new moon of Desnus'
        });
      });

      it('should parse named full moons', () => {
        const result = helpers.parseRecurringEvent("Abadar's Moon");
        expect(result).toEqual({
          type: 'named_full_moon',
          month: 0,
          moonName: "Abadar's Moon",
          originalText: "Abadar's Moon"
        });
      });

      it('should parse "third Moonday of Lamashan"', () => {
        const result = helpers.parseRecurringEvent('third Moonday of Lamashan');
        expect(result).toEqual({
          type: 'nth_weekday_monthly',
          weekday: 0,
          weekdayName: 'Moonday',
          occurrence: 3,
          month: 9,
          monthName: 'Lamashan',
          originalText: 'third Moonday of Lamashan'
        });
      });

      it('should parse "last Fireday of Neth"', () => {
        const result = helpers.parseRecurringEvent('last Fireday of Neth');
        expect(result).toEqual({
          type: 'last_weekday_monthly',
          weekday: 4,
          weekdayName: 'Fireday',
          occurrence: -1,
          month: 10,
          monthName: 'Neth',
          originalText: 'last Fireday of Neth'
        });
      });

      it('should parse "every Moonday of Pharast"', () => {
        const result = helpers.parseRecurringEvent('every Moonday of Pharast');
        expect(result).toEqual({
          type: 'every_weekday_monthly',
          weekday: 0,
          weekdayName: 'Moonday',
          month: 2,
          monthName: 'Pharast',
          originalText: 'every Moonday of Pharast'
        });
      });

      it('should parse "first Starday"', () => {
        const result = helpers.parseRecurringEvent('first Starday');
        expect(result).toEqual({
          type: 'nth_weekday',
          weekday: 5,
          weekdayName: 'Starday',
          occurrence: 1,
          originalText: 'first Starday'
        });
      });

      it('should parse "last Sunday"', () => {
        const result = helpers.parseRecurringEvent('last Sunday');
        expect(result).toEqual({
          type: 'last_weekday',
          weekday: 6,
          weekdayName: 'Sunday',
          occurrence: -1,
          originalText: 'last Sunday'
        });
      });

      it('should parse "every Toilday"', () => {
        const result = helpers.parseRecurringEvent('every Toilday');
        expect(result).toEqual({
          type: 'every_weekday',
          weekday: 1,
          weekdayName: 'Toilday',
          originalText: 'every Toilday'
        });
      });

      it('should return null for unrecognized patterns', () => {
        expect(helpers.parseRecurringEvent('random text')).toBeNull();
      });
    });

    describe('doesEventOccurOnDate', () => {
      it('should return false for null eventRule', () => {
        expect(helpers.doesEventOccurOnDate(null, { day: 1, month: 0, year: 4725 })).toBe(false);
      });

      it('should return false for monthly events in wrong month', () => {
        const rule = { type: 'nth_weekday_monthly', month: 0 };
        expect(helpers.doesEventOccurOnDate(rule, { day: 1, month: 1, year: 4725 })).toBe(false);
      });

      it('should return true for every full moon when moon is full', () => {
        mockGetMoonPhaseInfo.mockReturnValue({ isFullMoon: true });
        const rule = { type: 'every_full_moon' };
        expect(helpers.doesEventOccurOnDate(rule, { day: 1, month: 0, year: 4725 })).toBe(true);
      });

      it('should return false for every full moon when moon is not full', () => {
        mockGetMoonPhaseInfo.mockReturnValue({ isFullMoon: false });
        const rule = { type: 'every_full_moon' };
        expect(helpers.doesEventOccurOnDate(rule, { day: 1, month: 0, year: 4725 })).toBe(false);
      });

      it('should return true for full moon monthly on correct date', () => {
        mockGetMoonPhaseInfo.mockReturnValue({ isFullMoon: true });
        const rule = { type: 'full_moon_monthly', month: 0 };
        expect(helpers.doesEventOccurOnDate(rule, { day: 1, month: 0, year: 4725 })).toBe(true);
      });

      it('should return false for full moon monthly in wrong month', () => {
        mockGetMoonPhaseInfo.mockReturnValue({ isFullMoon: true });
        const rule = { type: 'full_moon_monthly', month: 0 };
        expect(helpers.doesEventOccurOnDate(rule, { day: 1, month: 1, year: 4725 })).toBe(false);
      });

      it('should return true for nth weekday on correct day', () => {
        mockGetDayOfWeek.mockReturnValue(0); // Monday
        const rule = { type: 'nth_weekday', weekday: 0, occurrence: 1 };
        // Mock getNthWeekdayOfMonth to return 1 for this case
        helpers.getNthWeekdayOfMonth = vi.fn().mockReturnValue(1);
        expect(helpers.doesEventOccurOnDate(rule, { day: 1, month: 0, year: 4725 })).toBe(true);
      });

      it('should return true for every weekday on correct day', () => {
        mockGetDayOfWeek.mockReturnValue(1); // Toilday
        const rule = { type: 'every_weekday', weekday: 1 };
        expect(helpers.doesEventOccurOnDate(rule, { day: 1, month: 0, year: 4725 })).toBe(true);
      });

      it('should return false for every weekday on wrong day', () => {
        mockGetDayOfWeek.mockReturnValue(0); // Monday
        const rule = { type: 'every_weekday', weekday: 1 }; // Toilday
        expect(helpers.doesEventOccurOnDate(rule, { day: 1, month: 0, year: 4725 })).toBe(false);
      });
    });

    describe('getRecurringEventsForDate', () => {
      it('should return events that match the recurring rule', () => {
        mockGetMoonPhaseInfo.mockReturnValue({ isFullMoon: true });
        const events = helpers.getRecurringEventsForDate(4725, 0, 1); // Abadius 1
        expect(events).toHaveLength(1);
        expect(events[0].title).toBe('Full Moon Event');
        expect(events[0].isRecurring).toBe(true);
      });

      it('should return empty array when no events match', () => {
        mockGetMoonPhaseInfo.mockReturnValue({ isFullMoon: false });
        const events = helpers.getRecurringEventsForDate(4725, 0, 1);
        expect(events).toHaveLength(0);
      });
    });

    describe('getEventsForDate', () => {
      it('should return both standard and recurring events', () => {
        mockGetMoonPhaseInfo.mockReturnValue({ isFullMoon: true });
        const events = helpers.getEventsForDate(4725, 2, 5); // Pharast 5 - matches regular event and potentially recurring
        expect(events.some(e => e.title === 'Regular Event')).toBe(true);
      });

      it('should return only standard events when no recurring match', () => {
        mockGetMoonPhaseInfo.mockReturnValue({ isFullMoon: false });
        const events = helpers.getEventsForDate(4725, 2, 5);
        expect(events).toHaveLength(1);
        expect(events[0].title).toBe('Regular Event');
      });

      it('should return events without year specified', () => {
        const events = helpers.getEventsForDate(4725, 2, 5);
        expect(events.some(e => e.title === 'Regular Event')).toBe(true);
      });
    });
  });
});