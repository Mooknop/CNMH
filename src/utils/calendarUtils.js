// src/utils/calendarUtils.js
// Pure calendar helper functions extracted from GolarionCalendar.js.
// All functions that depended on Golarion context values are created via
// createCalendarHelpers(), which binds those values once per render.

/**
 * Convert an event type string to a CSS-safe class name fragment.
 * @param {string|undefined} eventType
 * @returns {string}
 */
export const getEventTypeClass = (eventType) =>
  eventType ? eventType.replace(/\s+/g, '-') : 'default';

/**
 * Build calendar helper functions bound to the current Golarion context values.
 *
 * @param {Object} params
 * @param {Array}    params.GOLARION_MONTHS    - Month definitions from GameDateContext
 * @param {Array}    params.GOLARION_WEEKDAYS  - Weekday names from GameDateContext
 * @param {Function} params.getDayOfWeek       - (date) → weekday index, from GameDateContext
 * @param {Function} params.getMoonPhaseInfo   - (date) → moon phase info, from GameDateContext
 * @param {Array}    params.timelineData       - Raw event array from Timeline.json
 * @returns {Object} - { getNthWeekdayOfMonth, parseRecurringEvent, doesEventOccurOnDate,
 *                       getRecurringEventsForDate, getEventsForDate }
 */
export const createCalendarHelpers = ({
  GOLARION_MONTHS,
  GOLARION_WEEKDAYS,
  getDayOfWeek,
  getMoonPhaseInfo,
  timelineData,
}) => {
  /**
   * Find the nth (or last) occurrence of a specific weekday within a month.
   * @param {number} year
   * @param {number} month - 0-indexed
   * @param {number} weekday - weekday index (0-6)
   * @param {number} occurrence - 1-5 for nth, -1 for last
   * @returns {number|null} day of month, or null if not found
   */
  const getNthWeekdayOfMonth = (year, month, weekday, occurrence) => {
    const daysInMonth = GOLARION_MONTHS[month].days;
    const matches = [];

    for (let day = 1; day <= daysInMonth; day++) {
      if (getDayOfWeek({ day, month, year }) === weekday) {
        matches.push(day);
      }
    }

    if (occurrence === -1) return matches.length > 0 ? matches[matches.length - 1] : null;
    if (occurrence >= 1 && occurrence <= matches.length) return matches[occurrence - 1];
    return null;
  };

  /**
   * Parse a recurring event description string into a structured rule object.
   * Supports moon phase patterns and weekday-of-month patterns.
   * @param {string} description
   * @returns {Object|null}
   */
  const parseRecurringEvent = (description) => {
    const patterns = [
      { regex: /^every\s+full\s+moon$/i, type: 'every_full_moon' },
      { regex: /^every\s+new\s+moon$/i, type: 'every_new_moon' },
      { regex: /^full\s+moon\s+of\s+(\w+)$/i, type: 'full_moon_monthly' },
      { regex: /^new\s+moon\s+of\s+(\w+)$/i, type: 'new_moon_monthly' },
      { regex: /^(\w+'\s*s?\s+moon)$/i, type: 'named_full_moon' },
      { regex: /^(first|second|third|fourth|fifth)\s+(\w+day)\s+of\s+(\w+)$/i, type: 'nth_monthly' },
      { regex: /^last\s+(\w+day)\s+of\s+(\w+)$/i, type: 'last_monthly' },
      { regex: /^every\s+(\w+day)\s+of\s+(\w+)$/i, type: 'every_monthly' },
      { regex: /^(first|second|third|fourth|fifth)\s+(\w+day)$/i, type: 'nth' },
      { regex: /^last\s+(\w+day)$/i, type: 'last' },
      { regex: /^every\s+(\w+day)$/i, type: 'every' },
    ];

    const ordinals = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };

    for (const pattern of patterns) {
      const match = description.match(pattern.regex);
      if (!match) continue;

      if (pattern.type === 'every_full_moon') return { type: 'every_full_moon', originalText: description };
      if (pattern.type === 'every_new_moon') return { type: 'every_new_moon', originalText: description };

      if (pattern.type === 'full_moon_monthly') {
        const monthName = match[1];
        return {
          type: 'full_moon_monthly',
          month: GOLARION_MONTHS.findIndex(m => m.name.toLowerCase() === monthName.toLowerCase()),
          monthName,
          originalText: description,
        };
      }

      if (pattern.type === 'new_moon_monthly') {
        const monthName = match[1];
        return {
          type: 'new_moon_monthly',
          month: GOLARION_MONTHS.findIndex(m => m.name.toLowerCase() === monthName.toLowerCase()),
          monthName,
          originalText: description,
        };
      }

      if (pattern.type === 'named_full_moon') {
        const moonName = match[1];
        const namedMoonMap = {
          "zon-kuthon's moon": 11,
          "abadar's moon": 0,
          "calistria's moon": 1,
          "pharasma's moon": 2,
          "gozreh's moon": 3,
          "desna's moon": 4,
          "sarenrae's moon": 5,
          "erastil's moon": 6,
          "aroden's moon": 7,
          "rovagug's moon": 8,
          "lamashtu's moon": 9,
          "nethys' moon": 10,
        };
        return {
          type: 'named_full_moon',
          month: namedMoonMap[moonName.toLowerCase()],
          moonName,
          originalText: description,
        };
      }

      if (pattern.type === 'nth_monthly') {
        const weekdayName = match[2];
        const monthName = match[3];
        return {
          type: 'nth_weekday_monthly',
          weekday: GOLARION_WEEKDAYS.indexOf(weekdayName),
          weekdayName,
          occurrence: ordinals[match[1].toLowerCase()],
          month: GOLARION_MONTHS.findIndex(m => m.name.toLowerCase() === monthName.toLowerCase()),
          monthName,
          originalText: description,
        };
      }

      if (pattern.type === 'last_monthly') {
        const weekdayName = match[1];
        const monthName = match[2];
        return {
          type: 'last_weekday_monthly',
          weekday: GOLARION_WEEKDAYS.indexOf(weekdayName),
          weekdayName,
          occurrence: -1,
          month: GOLARION_MONTHS.findIndex(m => m.name.toLowerCase() === monthName.toLowerCase()),
          monthName,
          originalText: description,
        };
      }

      if (pattern.type === 'every_monthly') {
        const weekdayName = match[1];
        const monthName = match[2];
        return {
          type: 'every_weekday_monthly',
          weekday: GOLARION_WEEKDAYS.indexOf(weekdayName),
          weekdayName,
          month: GOLARION_MONTHS.findIndex(m => m.name.toLowerCase() === monthName.toLowerCase()),
          monthName,
          originalText: description,
        };
      }

      if (pattern.type === 'nth') {
        const weekdayName = match[2];
        return {
          type: 'nth_weekday',
          weekday: GOLARION_WEEKDAYS.indexOf(weekdayName),
          weekdayName,
          occurrence: ordinals[match[1].toLowerCase()],
          originalText: description,
        };
      }

      if (pattern.type === 'last') {
        const weekdayName = match[1];
        return {
          type: 'last_weekday',
          weekday: GOLARION_WEEKDAYS.indexOf(weekdayName),
          weekdayName,
          occurrence: -1,
          originalText: description,
        };
      }

      if (pattern.type === 'every') {
        const weekdayName = match[1];
        return {
          type: 'every_weekday',
          weekday: GOLARION_WEEKDAYS.indexOf(weekdayName),
          weekdayName,
          originalText: description,
        };
      }
    }

    return null;
  };

  /**
   * Check whether a parsed recurring rule fires on a given date.
   * @param {Object} eventRule - Output of parseRecurringEvent
   * @param {{ day, month, year }} date
   * @returns {boolean}
   */
  const doesEventOccurOnDate = (eventRule, date) => {
    if (!eventRule) return false;

    if (eventRule.type.includes('monthly') && eventRule.month !== undefined) {
      if (eventRule.month !== date.month) return false;
    }

    if (eventRule.type === 'every_full_moon') return getMoonPhaseInfo(date).isFullMoon;
    if (eventRule.type === 'every_new_moon') return getMoonPhaseInfo(date).isNewMoon;

    if (eventRule.type === 'full_moon_monthly' || eventRule.type === 'named_full_moon') {
      return getMoonPhaseInfo(date).isFullMoon && date.month === eventRule.month;
    }
    if (eventRule.type === 'new_moon_monthly') {
      return getMoonPhaseInfo(date).isNewMoon && date.month === eventRule.month;
    }

    if (
      eventRule.type === 'nth_weekday' || eventRule.type === 'last_weekday' ||
      eventRule.type === 'nth_weekday_monthly' || eventRule.type === 'last_weekday_monthly'
    ) {
      const targetDay = getNthWeekdayOfMonth(date.year, date.month, eventRule.weekday, eventRule.occurrence);
      return targetDay === date.day;
    }

    if (eventRule.type === 'every_weekday' || eventRule.type === 'every_weekday_monthly') {
      return getDayOfWeek(date) === eventRule.weekday;
    }

    return false;
  };

  /**
   * Collect all recurring events that apply to a specific date.
   */
  const getRecurringEventsForDate = (year, month, day) =>
    timelineData
      .filter(event => event.recurring)
      .map(event => ({ ...event, recurringRule: parseRecurringEvent(event.recurring) }))
      .filter(event => event.recurringRule && doesEventOccurOnDate(event.recurringRule, { day, month, year }))
      .map(event => ({ ...event, type: event.type || 'recurring', isRecurring: true }));

  /**
   * Get all events (fixed + recurring) for a specific date.
   */
  const getEventsForDate = (year, month, day) => {
    const standardEvents = timelineData.filter(event => {
      if (event.recurring) return false;
      if (event.date.year && event.date.year === year && event.date.month === month && event.date.day === day) return true;
      if (!event.date.year && event.date.month === month && event.date.day === day) return true;
      return false;
    });

    return [...standardEvents, ...getRecurringEventsForDate(year, month, day)];
  };

  return { getNthWeekdayOfMonth, parseRecurringEvent, doesEventOccurOnDate, getRecurringEventsForDate, getEventsForDate };
};
