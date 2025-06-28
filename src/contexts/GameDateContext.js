// src/contexts/GameDateContext.js
import React, { createContext, useContext, useState } from 'react';

// Golarion calendar data following Pathfinder 2E lore
export const GOLARION_MONTHS = [
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

export const GOLARION_WEEKDAYS = [
  "Moonday", "Toilday", "Wealday", "Oathday", "Fireday", "Starday", "Sunday"
];

// Golarion's lunar cycle - Based on Blood of the Moon companion
// Each full moon has a name corresponding to its month
export const LUNAR_MONTH_NAMES = [
  "Zon-Kuthon's Moon", // Winter full moon in Kuthona
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
const LUNAR_CYCLE_DAYS = 28;

// Create the context
export const GameDateContext = createContext();

/**
 * Provider component for managing the current game date in Golarion
 * Following Pathfinder 2E Absalom Reckoning (AR) calendar system
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export const GameDateProvider = ({ children }) => {
  // Initial game date - 5th of Rova (month index 8), 4724 AR
  const [gameDate, setGameDate] = useState({
    day: 5,
    month: 8, // 0-indexed
    year: 4724
  });

  /**
   * Calculate total days since a reference point for moon phase calculations
   * @param {Object} date - Date object with day, month, year
   * @returns {number} Total days since reference point
   */
  const getTotalDays = (date = gameDate) => {
    const baseYear = 4700; // Reference year
    const yearDiff = date.year - baseYear;
    let totalDays = yearDiff * 365 + Math.floor(yearDiff / 8); // Golarion leap years every 8 years
    
    // Add days from completed months in current year
    for (let i = 0; i < date.month; i++) {
      totalDays += GOLARION_MONTHS[i].days;
    }
    
    // Add days in current month
    totalDays += date.day - 1;
    
    return totalDays;
  };

  /**
   * Calculate the current moon phase based on the date
   * @param {Object} date - Date object with day, month, year
   * @returns {number} Moon phase index (0-7)
   */
  const getMoonPhase = (date = gameDate) => {
    const totalDays = getTotalDays(date);
    const cyclePosition = totalDays % LUNAR_CYCLE_DAYS;
    return Math.floor((cyclePosition / LUNAR_CYCLE_DAYS) * 8);
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
    const fullMoonDay = Math.floor(LUNAR_CYCLE_DAYS / 2); // Day 14 of 28-day cycle
    
    if (cyclePosition <= fullMoonDay) {
      return fullMoonDay - cyclePosition;
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
      return 0;
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
    return getMoonPhase(date) === MOON_PHASES.FULL_MOON;
  };

  /**
   * Check if current date is a new moon
   * @param {Object} date - Date object with day, month, year
   * @returns {boolean} True if new moon
   */
  const isNewMoon = (date = gameDate) => {
    return getMoonPhase(date) === MOON_PHASES.NEW_MOON;
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

  /**
   * Get the current season
   * @returns {string} Season name
   */
  const getCurrentSeason = () => {
    return getCurrentMonth().season;
  };

  /**
   * Advance the game date by specified number of days
   * Handles month and year transitions according to Golarion calendar
   * @param {number} days - Number of days to advance
   */
  const advanceDays = (days) => {
    let newDate = { ...gameDate };
    
    for (let i = 0; i < days; i++) {
      newDate.day++;
      
      // Check if we need to advance to next month
      if (newDate.day > GOLARION_MONTHS[newDate.month].days) {
        newDate.day = 1;
        newDate.month++;
        
        // Check if we need to advance to next year
        if (newDate.month > 11) {
          newDate.month = 0;
          newDate.year++;
        }
      }
    }
    
    setGameDate(newDate);
  };

  /**
   * Set a specific game date
   * @param {number} day - Day of the month (1-31)
   * @param {number} month - Month index (0-11)
   * @param {number} year - Year in AR
   */
  const setSpecificDate = (day, month, year) => {
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
    
    setGameDate({ day, month, year });
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
      moon: moonInfo
    };
  };

  return (
    <GameDateContext.Provider
      value={{
        gameDate,
        formatGameDate,
        getCurrentMonth,
        getCurrentSeason,
        getCurrentWeekday,
        getDetailedDate,
        getDayOfWeek,
        advanceDays,
        setSpecificDate,
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