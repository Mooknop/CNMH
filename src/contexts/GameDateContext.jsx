// src/contexts/GameDateContext.js
import React, { createContext, useContext, useCallback } from 'react';
import { useSyncedState } from '../hooks/useSyncedState';
import { GOLARION_MONTHS, totalDaysSince4700 } from '../utils/gameTime';

// Calendar data lives in utils/gameTime.js (pure module shared with the
// frequency engine); re-exported here so existing importers keep working.
export { GOLARION_MONTHS };

export const GOLARION_WEEKDAYS = [
  "Moonday", "Toilday", "Wealday", "Oathday", "Fireday", "Starday", "Sunday"
];

// Golarion's lunar cycle - Based on Blood of the Moon companion
// Each full moon has a name corresponding to its month
export const LUNAR_MONTH_NAMES = [
  "Abadar's Moon", // Deep winter full moon in Abadius
  "Calistria's Moon", // Winter full moon in Calistril
  "Pharasma's Moon", // Spring awakening full moon in Pharast  
  "Gozreh's Moon", // Spring growth full moon in Gozran
  "Desna's Moon", // Late spring full moon in Desnus
  "Sarenrae's Moon", // Early summer full moon in Sarenith
  "Erastil's Moon", // Mid-summer full moon in Erastus
  "Aroden's Moon", // Late summer full moon in Arodus
  "Rovagug's Moon", // Early autumn full moon in Rova
  "Lamashtu's Moon", // Mid-autumn full moon in Lamashan
  "Nethys' Moon", // Late autumn full moon in Neth
  "Zon-Kuthon's Moon", // Winter full moon in Kuthona
];

// Moon phases
export const MOON_PHASES = {
  NEW_MOON: 0,
  WAXING_CRESCENT: 1,
  FIRST_QUARTER: 2,
  WAXING_GIBBOUS: 3,
  FULL_MOON: 4,
  WANING_GIBBOUS: 5,
  LAST_QUARTER: 6,
  WANING_CRESCENT: 7
};

export const MOON_PHASE_NAMES = [
  "New Moon",
  "Waxing Crescent", 
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent"
];

// Moon phase symbols for display
export const MOON_PHASE_SYMBOLS = [
  "🌑", // New Moon
  "🌒", // Waxing Crescent
  "🌓", // First Quarter
  "🌔", // Waxing Gibbous
  "🌕", // Full Moon
  "🌖", // Waning Gibbous
  "🌗", // Last Quarter
  "🌘"  // Waning Crescent
];

// Lunar cycle length in days (standard fantasy moon cycle)
const LUNAR_CYCLE_DAYS = 32;

// Default clock seed: the campaign start date + an 8:00 morning start.
const DEFAULT_CLOCK = { day: 5, month: 2, year: 4725, hour: 8, minute: 0, second: 0 };

/**
 * Advance a { day, month, year } date forward by a whole number of days,
 * carrying through Golarion month lengths and year boundaries. Pure helper so
 * both day- and time-based advancement share one carry implementation.
 * @param {Object} date - { day, month, year } (month is 0-11)
 * @param {number} days - whole days to add (>= 0)
 * @returns {Object} new { day, month, year }
 */
const addDays = (date, days) => {
  let { day, month, year } = date;
  const step = days >= 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(days); i++) {
    day += step;
    if (day > GOLARION_MONTHS[month].days) {
      day = 1;
      month++;
      if (month > 11) { month = 0; year++; }
    } else if (day < 1) {
      month--;
      if (month < 0) { month = 11; year--; }
      day = GOLARION_MONTHS[month].days;
    }
  }
  return { day, month, year };
};

/**
 * Advance a full { day, month, year, hour, minute, second } clock by a mix of
 * units, cascading second -> minute -> hour -> day. Forward-only.
 * @param {Object} clock - current clock
 * @param {Object} delta - { days, hours, minutes, seconds } (any subset)
 * @returns {Object} new clock
 */
const addToClock = (clock, { days = 0, hours = 0, minutes = 0, seconds = 0 }) => {
  let second = clock.second + seconds;
  let minute = clock.minute + minutes + Math.floor(second / 60);
  second = ((second % 60) + 60) % 60;
  let hour = clock.hour + hours + Math.floor(minute / 60);
  minute = ((minute % 60) + 60) % 60;
  const dayCarry = days + Math.floor(hour / 24);
  hour = ((hour % 24) + 24) % 24;
  const { day, month, year } = addDays(clock, dayCarry);
  return { day, month, year, hour, minute, second };
};

// Create the context
export const GameDateContext = createContext();

/**
 * Provider component for managing the current game date in Golarion
 * Following Pathfinder 2E Absalom Reckoning (AR) calendar system
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export const GameDateProvider = ({ children }) => {
  // Single synced source of truth for date + time. Shared across every client
  // (GM and players) via the campaign session; degrades to localStorage when
  // no SessionProvider is present.
  const [clock, setClock] = useSyncedState('cnmh_clock_global', DEFAULT_CLOCK);

  // Date and time views derived from the clock. Existing helpers default their
  // `date` argument to `gameDate`, so keeping this shape preserves their API.
  const gameDate = { day: clock.day, month: clock.month, year: clock.year };
  const time = { hour: clock.hour, minute: clock.minute, second: clock.second };

  /**
   * Calculate total days since a reference point for moon phase calculations
   * @param {Object} date - Date object with day, month, year
   * @returns {number} Total days since reference point
   */
  const getTotalDays = (date = gameDate) => totalDaysSince4700(date);

  /**
   * Calculate the current moon phase based on the date
   * @param {Object} date - Date object with day, month, year
   * @returns {number} Moon phase index (0-7)
   */
  const getMoonPhase = (date = gameDate) => {
    const totalDays = getTotalDays(date);
    const cyclePosition = totalDays % LUNAR_CYCLE_DAYS;
    
    // Define specific days in the 28-day cycle for each phase
    // This ensures New Moon and Full Moon only occur on single days
    if (cyclePosition === 0) return MOON_PHASES.NEW_MOON;           // Day 0
    if (cyclePosition >= 1 && cyclePosition <= 7) return MOON_PHASES.WAXING_CRESCENT;   // Days 1-6
    if (cyclePosition === 8) return MOON_PHASES.FIRST_QUARTER;     // Day 7
    if (cyclePosition >= 9 && cyclePosition <= 15) return MOON_PHASES.WAXING_GIBBOUS;   // Days 8-13
    if (cyclePosition === 16) return MOON_PHASES.FULL_MOON;        // Day 14 (single day)
    if (cyclePosition >= 17 && cyclePosition <= 23) return MOON_PHASES.WANING_GIBBOUS;  // Days 15-20
    if (cyclePosition === 24) return MOON_PHASES.LAST_QUARTER;     // Day 21
    if (cyclePosition >= 25 && cyclePosition <= 32) return MOON_PHASES.WANING_CRESCENT; // Days 22-27
    
    // Fallback (shouldn't reach here with 28-day cycle)
    return MOON_PHASES.NEW_MOON;
  };

  /**
   * Get the current lunar month name based on the date
   * @param {Object} date - Date object with day, month, year  
   * @returns {string} Lunar month name
   */
  const getLunarMonthName = (date = gameDate) => {
    return LUNAR_MONTH_NAMES[date.month];
  };

  /**
   * Calculate days until next full moon
   * @param {Object} date - Date object with day, month, year
   * @returns {number} Days until next full moon
   */
  const getDaysUntilFullMoon = (date = gameDate) => {
    const totalDays = getTotalDays(date);
    const cyclePosition = totalDays % LUNAR_CYCLE_DAYS;
    const fullMoonDay = 16; // Full moon occurs on day 16 of cycle

    if (cyclePosition < fullMoonDay) {
      return fullMoonDay - cyclePosition;
    } else if (cyclePosition === fullMoonDay) {
      return 0; // It's full moon today
    } else {
      return (LUNAR_CYCLE_DAYS - cyclePosition) + fullMoonDay;
    }
  };

  /**
   * Calculate days until next new moon
   * @param {Object} date - Date object with day, month, year
   * @returns {number} Days until next new moon
   */
  const getDaysUntilNewMoon = (date = gameDate) => {
    const totalDays = getTotalDays(date);
    const cyclePosition = totalDays % LUNAR_CYCLE_DAYS;
    
    if (cyclePosition === 0) {
      return 0; // It's new moon today
    } else {
      return LUNAR_CYCLE_DAYS - cyclePosition;
    }
  };

  /**
   * Check if current date is a full moon
   * @param {Object} date - Date object with day, month, year
   * @returns {boolean} True if full moon
   */
  const isFullMoon = (date = gameDate) => {
    const totalDays = getTotalDays(date);
    const cyclePosition = totalDays % LUNAR_CYCLE_DAYS;
    return cyclePosition === 16; // Only true on day 16 of the 32-day cycle
  };

  /**
   * Check if current date is a new moon
   * @param {Object} date - Date object with day, month, year
   * @returns {boolean} True if new moon
   */
  const isNewMoon = (date = gameDate) => {
    const totalDays = getTotalDays(date);
    const cyclePosition = totalDays % LUNAR_CYCLE_DAYS;
    return cyclePosition === 0; // Only true on day 0 of the 32-day cycle
  };

  /**
   * Get moon phase information for display
   * @param {Object} date - Date object with day, month, year
   * @returns {Object} Moon phase data
   */
  const getMoonPhaseInfo = (date = gameDate) => {
    const phase = getMoonPhase(date);
    return {
      phase,
      name: MOON_PHASE_NAMES[phase],
      symbol: MOON_PHASE_SYMBOLS[phase],
      lunarMonth: getLunarMonthName(date),
      daysUntilFull: getDaysUntilFullMoon(date),
      daysUntilNew: getDaysUntilNewMoon(date),
      isFullMoon: isFullMoon(date),
      isNewMoon: isNewMoon(date)
    };
  };

  /**
   * Format the current game date for display
   * @returns {string} Formatted date string (e.g., "21 Desnus, 4725 AR")
   */
  const formatGameDate = () => {
    const monthName = GOLARION_MONTHS[gameDate.month].name;
    let formattedDate = `${gameDate.day} ${monthName}`;
    formattedDate += gameDate.year ? `, ${gameDate.year} AR` : "";
    return formattedDate;
  };

  /**
   * Get the current month's data
   * @returns {Object} Month object with name, days, season, and index
   */
  const getCurrentMonth = () => {
    return GOLARION_MONTHS[gameDate.month];
  };

  const getCurrentYear = () => {
    return gameDate.year;
  };

  /**
   * Get the current season
   * @returns {string} Season name
   */
  const getCurrentSeason = () => {
    return getCurrentMonth().season;
  };

  /**
   * Advance the clock by specified number of days (time of day unchanged).
   * Handles month and year transitions according to the Golarion calendar.
   * @param {number} days - Number of days to advance
   */
  const advanceDays = useCallback((days) => {
    setClock((prev) => addToClock(prev, { days }));
  }, [setClock]);

  /**
   * Advance the clock by a number of hours, cascading into the date on rollover.
   * @param {number} hours - Hours to advance
   */
  const advanceHours = useCallback((hours) => {
    setClock((prev) => addToClock(prev, { hours }));
  }, [setClock]);

  /**
   * Advance the clock by a number of minutes, cascading up into hours/date.
   * @param {number} minutes - Minutes to advance
   */
  const advanceMinutes = useCallback((minutes) => {
    setClock((prev) => addToClock(prev, { minutes }));
  }, [setClock]);

  /**
   * Advance the clock by a number of seconds, cascading up into minutes/hours/date.
   * Used by encounter time accrual (6 s per round).
   * @param {number} seconds - Seconds to advance
   */
  const advanceSeconds = useCallback((seconds) => {
    setClock((prev) => addToClock(prev, { seconds }));
  }, [setClock]);

  /**
   * Set a specific game date, optionally also setting the time of day.
   * @param {number} day - Day of the month (1-31)
   * @param {number} month - Month index (0-11)
   * @param {number} year - Year in AR
   * @param {number} [hour] - Hour (0-23); preserves current hour if omitted
   * @param {number} [minute] - Minute (0-59); preserves current minute if omitted
   */
  const setSpecificDate = (day, month, year, hour, minute) => {
    // Validate the date
    if (month < 0 || month > 11) {
      console.error('Invalid month. Must be between 0-11');
      return;
    }

    const monthData = GOLARION_MONTHS[month];
    if (day < 1 || day > monthData.days) {
      console.error(`Invalid day for ${monthData.name}. Must be between 1-${monthData.days}`);
      return;
    }

    setClock((prev) => ({
      day,
      month,
      year,
      hour: hour ?? prev.hour,
      minute: minute ?? prev.minute,
      second: prev.second,
    }));
  };

  /**
   * Set the time of day without changing the date.
   * @param {number} hour - Hour (0-23)
   * @param {number} minute - Minute (0-59)
   */
  const setSpecificTime = (hour, minute) => {
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      console.error('Invalid time. Hour must be 0-23 and minute 0-59');
      return;
    }
    setClock((prev) => ({ ...prev, hour, minute, second: 0 }));
  };

  /**
   * Format the current time of day as a 24-hour "HH:MM" string.
   * @returns {string} e.g. "08:05"
   */
  const formatClockTime = () => {
    const hh = String(time.hour).padStart(2, '0');
    const mm = String(time.minute).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  /**
   * Calculate the day of the week for a given date
   * Uses a simplified calculation for the Golarion calendar
   * @param {Object} date - Date object with day, month, year
   * @returns {number} Day of week index (0 = Moonday, 6 = Sunday)
   */
  const getDayOfWeek = (date = gameDate) => {
    const totalDays = getTotalDays(date);
    return totalDays % 7;
  };

  /**
   * Get the weekday name for the current date
   * @returns {string} Weekday name
   */
  const getCurrentWeekday = () => {
    const dayIndex = getDayOfWeek();
    return GOLARION_WEEKDAYS[dayIndex];
  };

  /**
   * Get a detailed date object with additional computed properties
   * @returns {Object} Enhanced date object
   */
  const getDetailedDate = () => {
    const moonInfo = getMoonPhaseInfo();
    return {
      ...gameDate,
      monthName: getCurrentMonth().name,
      season: getCurrentSeason(),
      weekday: getCurrentWeekday(),
      formatted: formatGameDate(),
      monthData: getCurrentMonth(),
      moon: moonInfo,
      time,
      formattedTime: formatClockTime()
    };
  };

  return (
    <GameDateContext.Provider
      value={{
        gameDate,
        time,
        formatGameDate,
        formatClockTime,
        getCurrentMonth,
        getCurrentYear,
        getCurrentSeason,
        getCurrentWeekday,
        getDetailedDate,
        getDayOfWeek,
        advanceDays,
        advanceHours,
        advanceMinutes,
        advanceSeconds,
        setSpecificDate,
        setSpecificTime,
        // Moon-related functions
        getMoonPhase,
        getMoonPhaseInfo,
        getLunarMonthName,
        getDaysUntilFullMoon,
        getDaysUntilNewMoon,
        isFullMoon,
        isNewMoon,
        // Export constants for use in components
        GOLARION_MONTHS,
        GOLARION_WEEKDAYS,
        LUNAR_MONTH_NAMES,
        MOON_PHASES,
        MOON_PHASE_NAMES,
        MOON_PHASE_SYMBOLS
      }}
    >
      {children}
    </GameDateContext.Provider>
  );
};

/**
 * Custom hook for using the game date context
 * @returns {Object} Game date context value
 */
export const useGameDate = () => {
  const context = useContext(GameDateContext);
  if (!context) {
    throw new Error('useGameDate must be used within a GameDateProvider');
  }
  return context;
};