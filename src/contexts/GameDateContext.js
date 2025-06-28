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

// Create the context
export const GameDateContext = createContext();

/**
 * Provider component for managing the current game date in Golarion
 * Following Pathfinder 2E Absalom Reckoning (AR) calendar system
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export const GameDateProvider = ({ children }) => {
  // Initial game date - 21st of Desnus (month index 4), 4725 AR
  const [gameDate, setGameDate] = useState({
    day: 5,
    month: 8, // 0-indexed
    year: 4724
  });

  /**
   * Format the current game date for display
   * @returns {string} Formatted date string (e.g., "21 Desnus, 4725 AR")
   */
  const formatGameDate = () => {
    const monthName = GOLARION_MONTHS[gameDate.month].name;
    return `${gameDate.day} ${monthName}, ${gameDate.year} AR`;
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
    // Simple calculation for demo - in a real implementation you'd want
    // accurate Golarion calendar math based on established lore dates
    const baseYear = 4700;
    const yearDiff = date.year - baseYear;
    const totalDays = yearDiff * 365 + Math.floor(yearDiff / 4); // Rough leap year approximation
    
    let daysSinceYearStart = 0;
    for (let i = 0; i < date.month; i++) {
      daysSinceYearStart += GOLARION_MONTHS[i].days;
    }
    daysSinceYearStart += date.day - 1;
    
    return (totalDays + daysSinceYearStart) % 7;
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
    return {
      ...gameDate,
      monthName: getCurrentMonth().name,
      season: getCurrentSeason(),
      weekday: getCurrentWeekday(),
      formatted: formatGameDate(),
      monthData: getCurrentMonth()
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
        // Export constants for use in components
        GOLARION_MONTHS,
        GOLARION_WEEKDAYS
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