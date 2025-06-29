// src/pages/GolarionCalendar.js
import React, { useState, useEffect } from 'react';
import { useGameDate } from '../contexts/GameDateContext';
import MoonPhase, { MoonPhaseIndicator, MoonPhaseLegend } from '../components/calendar/MoonPhase';
import timelineData from '../data/Timeline.json';
import './GolarionCalendar.css';

const GolarionCalendar = () => {
  const { 
    gameDate, 
    formatGameDate, 
    GOLARION_MONTHS, 
    GOLARION_WEEKDAYS,
    getDayOfWeek,
    getMoonPhaseInfo,
    getCurrentSeason,
    getCurrentYear
  } = useGameDate();

  const EVENT_TYPE_COLORS = {
    "campaign": "#8B4513",
    "holiday": "#DC143C", 
    "world event": "#4B0082",
    "personal": "#228B22",
    "recurring": "#6B4226",
    "default": "#5e2929"
  };
  
  const [currentMonth, setCurrentMonth] = useState(gameDate.month);
  const [currentYear, setCurrentYear] = useState(gameDate.year);
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [showModal, setShowModal] = useState(false);

  // Helper function to get CSS class for event type
  const getEventTypeClass = (eventType) => {
    return eventType ? eventType.replace(/\s+/g, '-') : 'default';
  };

  /**
   * Find the nth occurrence of a specific weekday in a month
   * @param {number} year - Year in AR
   * @param {number} month - Month index (0-11)
   * @param {number} weekday - Weekday index (0-6)
   * @param {number} occurrence - Which occurrence (1-5, or -1 for last)
   * @returns {number|null} Day of month or null if not found
   */
  const getNthWeekdayOfMonth = (year, month, weekday, occurrence) => {
    const daysInMonth = GOLARION_MONTHS[month].days;
    const matches = [];
    
    // Find all occurrences of this weekday in the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayOfWeek = getDayOfWeek({ day, month, year });
      if (dayOfWeek === weekday) {
        matches.push(day);
      }
    }
    
    if (occurrence === -1) {
      // Return last occurrence
      return matches.length > 0 ? matches[matches.length - 1] : null;
    } else if (occurrence >= 1 && occurrence <= matches.length) {
      // Return nth occurrence (1-indexed)
      return matches[occurrence - 1];
    }
    
    return null;
  };

  /**
   * Enhanced parse function for recurring events with moon phase support
   * @param {string} description - e.g., "every full moon", "Sarenrae's Moon", "Second Starday of Rova"
   * @returns {Object} Parsed event data
   */
  const parseRecurringEvent = (description) => {
    const patterns = [
      // Moon phase patterns
      { regex: /^every\s+full\s+moon$/i, type: 'every_full_moon' },
      { regex: /^every\s+new\s+moon$/i, type: 'every_new_moon' },
      { regex: /^full\s+moon\s+of\s+(\w+)$/i, type: 'full_moon_monthly' },
      { regex: /^new\s+moon\s+of\s+(\w+)$/i, type: 'new_moon_monthly' },
      { regex: /^(\w+'\s*s?\s+moon)$/i, type: 'named_full_moon' }, // e.g., "Sarenrae's Moon"
      
      // Existing weekday patterns with specific months
      { regex: /^(first|second|third|fourth|fifth)\s+(\w+day)\s+of\s+(\w+)$/i, type: 'nth_monthly' },
      { regex: /^last\s+(\w+day)\s+of\s+(\w+)$/i, type: 'last_monthly' },
      { regex: /^every\s+(\w+day)\s+of\s+(\w+)$/i, type: 'every_monthly' },
      
      // Existing weekday patterns without specific months
      { regex: /^(first|second|third|fourth|fifth)\s+(\w+day)$/i, type: 'nth' },
      { regex: /^last\s+(\w+day)$/i, type: 'last' },
      { regex: /^every\s+(\w+day)$/i, type: 'every' }
    ];
    
    for (const pattern of patterns) {
      const match = description.match(pattern.regex);
      if (match) {
        const ordinals = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
        
        // Handle moon phase patterns
        if (pattern.type === 'every_full_moon') {
          return {
            type: 'every_full_moon',
            originalText: description
          };
        } else if (pattern.type === 'every_new_moon') {
          return {
            type: 'every_new_moon',
            originalText: description
          };
        } else if (pattern.type === 'full_moon_monthly') {
          const monthName = match[1];
          const monthIndex = GOLARION_MONTHS.findIndex(m => m.name.toLowerCase() === monthName.toLowerCase());
          
          return {
            type: 'full_moon_monthly',
            month: monthIndex,
            monthName,
            originalText: description
          };
        } else if (pattern.type === 'new_moon_monthly') {
          const monthName = match[1];
          const monthIndex = GOLARION_MONTHS.findIndex(m => m.name.toLowerCase() === monthName.toLowerCase());
          
          return {
            type: 'new_moon_monthly',
            month: monthIndex,
            monthName,
            originalText: description
          };
        } else if (pattern.type === 'named_full_moon') {
          // Handle named moons like "Sarenrae's Moon", "Desna's Moon", etc.
          const moonName = match[1];
          
          // Map named moons to their months based on Pathfinder 2E lore
          const namedMoonMap = {
            "zon-kuthon's moon": 11, // Kuthona
            "abadar's moon": 0,      // Abadius
            "calistria's moon": 1,   // Calistril
            "pharasma's moon": 2,    // Pharast
            "gozreh's moon": 3,      // Gozran
            "desna's moon": 4,       // Desnus
            "sarenrae's moon": 5,    // Sarenith
            "erastil's moon": 6,     // Erastus
            "aroden's moon": 7,      // Arodus
            "rovagug's moon": 8,     // Rova
            "lamashtu's moon": 9,    // Lamashan
            "nethys' moon": 10       // Neth
          };
          
          const monthIndex = namedMoonMap[moonName.toLowerCase()];
          
          return {
            type: 'named_full_moon',
            month: monthIndex,
            moonName,
            originalText: description
          };
        }
        
        // Handle existing weekday patterns (unchanged from original)
        else if (pattern.type === 'nth_monthly') {
          const weekdayName = match[2];
          const monthName = match[3];
          const weekdayIndex = GOLARION_WEEKDAYS.indexOf(weekdayName);
          const monthIndex = GOLARION_MONTHS.findIndex(m => m.name.toLowerCase() === monthName.toLowerCase());
          
          return {
            type: 'nth_weekday_monthly',
            weekday: weekdayIndex,
            weekdayName,
            occurrence: ordinals[match[1].toLowerCase()],
            month: monthIndex,
            monthName,
            originalText: description
          };
        } else if (pattern.type === 'last_monthly') {
          const weekdayName = match[1];
          const monthName = match[2];
          const weekdayIndex = GOLARION_WEEKDAYS.indexOf(weekdayName);
          const monthIndex = GOLARION_MONTHS.findIndex(m => m.name.toLowerCase() === monthName.toLowerCase());
          
          return {
            type: 'last_weekday_monthly',
            weekday: weekdayIndex,
            weekdayName,
            occurrence: -1,
            month: monthIndex,
            monthName,
            originalText: description
          };
        } else if (pattern.type === 'every_monthly') {
          const weekdayName = match[1];
          const monthName = match[2];
          const weekdayIndex = GOLARION_WEEKDAYS.indexOf(weekdayName);
          const monthIndex = GOLARION_MONTHS.findIndex(m => m.name.toLowerCase() === monthName.toLowerCase());
          
          return {
            type: 'every_weekday_monthly',
            weekday: weekdayIndex,
            weekdayName,
            month: monthIndex,
            monthName,
            originalText: description
          };
        } else if (pattern.type === 'nth') {
          const weekdayName = match[2];
          const weekdayIndex = GOLARION_WEEKDAYS.indexOf(weekdayName);
          
          return {
            type: 'nth_weekday',
            weekday: weekdayIndex,
            weekdayName,
            occurrence: ordinals[match[1].toLowerCase()],
            originalText: description
          };
        } else if (pattern.type === 'last') {
          const weekdayName = match[1];
          const weekdayIndex = GOLARION_WEEKDAYS.indexOf(weekdayName);
          
          return {
            type: 'last_weekday',
            weekday: weekdayIndex,
            weekdayName,
            occurrence: -1,
            originalText: description
          };
        } else if (pattern.type === 'every') {
          const weekdayName = match[1];
          const weekdayIndex = GOLARION_WEEKDAYS.indexOf(weekdayName);
          
          return {
            type: 'every_weekday',
            weekday: weekdayIndex,
            weekdayName,
            originalText: description
          };
        }
      }
    }
    
    return null;
  };

  /**
   * Enhanced check for recurring event occurrences with moon phase support
   * @param {Object} eventRule - Parsed recurring event rule
   * @param {Object} date - Date to check
   * @returns {boolean} Whether the event occurs on this date
   */
  const doesEventOccurOnDate = (eventRule, date) => {
    if (!eventRule) return false;
    
    // For monthly events, check if we're in the correct month
    if (eventRule.type.includes('monthly') && eventRule.month !== undefined) {
      if (eventRule.month !== date.month) {
        return false; // Wrong month, event doesn't occur
      }
    }
    
    // Handle moon phase events
    if (eventRule.type === 'every_full_moon') {
      const moonInfo = getMoonPhaseInfo(date);
      return moonInfo.isFullMoon;
    } else if (eventRule.type === 'every_new_moon') {
      const moonInfo = getMoonPhaseInfo(date);
      return moonInfo.isNewMoon;
    } else if (eventRule.type === 'full_moon_monthly' || eventRule.type === 'named_full_moon') {
      // Check if it's the full moon of the specified month
      const moonInfo = getMoonPhaseInfo(date);
      return moonInfo.isFullMoon && date.month === eventRule.month;
    } else if (eventRule.type === 'new_moon_monthly') {
      // Check if it's the new moon of the specified month
      const moonInfo = getMoonPhaseInfo(date);
      return moonInfo.isNewMoon && date.month === eventRule.month;
    }
    
    // Handle existing weekday events
    else if (eventRule.type === 'nth_weekday' || eventRule.type === 'last_weekday' ||
             eventRule.type === 'nth_weekday_monthly' || eventRule.type === 'last_weekday_monthly') {
      const targetDay = getNthWeekdayOfMonth(
        date.year, 
        date.month, 
        eventRule.weekday, 
        eventRule.occurrence
      );
      return targetDay === date.day;
    } else if (eventRule.type === 'every_weekday' || eventRule.type === 'every_weekday_monthly') {
      const dayOfWeek = getDayOfWeek(date);
      return dayOfWeek === eventRule.weekday;
    }
    
    return false;
  };

  /**
   * Get recurring events for a specific date
   * @param {number} year - Year
   * @param {number} month - Month index
   * @param {number} day - Day of month
   * @returns {Array} Array of recurring events
   */
  const getRecurringEventsForDate = (year, month, day) => {
    return timelineData
      .filter(event => event.recurring) // Only check events with recurring property
      .map(event => ({
        ...event,
        recurringRule: parseRecurringEvent(event.recurring)
      }))
      .filter(event => {
        if (!event.recurringRule) return false;
        return doesEventOccurOnDate(event.recurringRule, { day, month, year });
      })
      .map(event => ({
        ...event,
        type: event.type || 'recurring', // Mark as recurring if no type specified
        isRecurring: true
      }));
  };

  const getEventsForDate = (year, month, day) => {
    // Get standard timeline events
    const standardEvents = timelineData.filter(event => {
      // Skip events that have recurring property (they'll be handled separately)
      if (event.recurring) return false;
      
      // Check for exact date match (specific year events)
      if (event.date.year && event.date.year === year && 
          event.date.month === month && 
          event.date.day === day) {
        return true;
      }
      
      // Check for annual events (events without a year that recur every year)
      if (!event.date.year && 
          event.date.month === month && 
          event.date.day === day) {
        return true;
      }
      
      return false;
    });

    // Get recurring events
    const recurringEvents = getRecurringEventsForDate(year, month, day);

    // Combine both types of events
    return [...standardEvents, ...recurringEvents];
  };

  // Handle day click
  const handleDayClick = (day) => {
    const events = getEventsForDate(currentYear, currentMonth, day);
    if (events.length > 0) {
      setSelectedEvents(events);
      setShowModal(true);
    }
  };

  // Navigate months
  const previousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Generate calendar days
  const generateCalendarDays = () => {
    const startDay = getDayOfWeek({ day: 1, month: currentMonth, year: currentYear });
    const daysInMonth = GOLARION_MONTHS[currentMonth].days;
    const days = [];

    // Add empty cells for days before the month starts
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const events = getEventsForDate(currentYear, currentMonth, day);
      const isCurrentDate = (currentYear === gameDate.year && currentMonth === gameDate.month && day === gameDate.day);
      const dayDate = { day, month: currentMonth, year: currentYear };
      const moonInfo = getMoonPhaseInfo(dayDate);
      
      days.push({
        day,
        events,
        isCurrentDate,
        moonInfo
      });
    }

    return days;
  };

  const calendarDays = generateCalendarDays();

  return (
    <div className="golarion-calendar">
      {/* Calendar content wrapper */}
      <div className="calendar-content">
        
        {/* Page title */}
        <h1>Golarion Calendar</h1>
        
        {/* Calendar container */}
        <div className="calendar-container">
          
          {/* Header */}
          <div className="calendar-header">
            <button onClick={previousMonth} className="nav-button">
              ‹ Previous
            </button>
            {/* Current campaign date indicator */}
          <div className="current-date-indicator">
            <strong>{formatGameDate()}</strong> - <span>{getCurrentSeason()}</span>
          </div>
            
            
            <button onClick={nextMonth} className="nav-button">
              Next ›
            </button>
          </div>

          <div className="month-year-display">
              <h2 className="month-name">
                {GOLARION_MONTHS[currentMonth].name}
              </h2>
              <div className="year-season">
                <span className="year">{currentYear} AR</span>
                <span className="season">{GOLARION_MONTHS[currentMonth].season}</span>
              </div>
            </div>

          {/* Weekday Headers */}
          <div className="weekday-headers">
            {GOLARION_WEEKDAYS.map(weekday => (
              <div key={weekday} className="weekday-header">
                {weekday}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="calendar-grid">
            {/* Split calendar days into weeks */}
            {Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, weekIndex) => (
              <div key={weekIndex} className="calendar-week">
                {calendarDays.slice(weekIndex * 7, (weekIndex + 1) * 7).map((dayData, dayIndex) => {
                  if (!dayData) {
                    return (
                      <div key={`empty-${weekIndex}-${dayIndex}`} className="calendar-day empty" />
                    );
                  }

                  const { day, events, isCurrentDate, moonInfo } = dayData;
                  const dayDate = { day, month: currentMonth, year: currentYear };
                  
                  return (
                    <div 
                      key={`${currentYear}-${currentMonth}-${day}`}
                      onClick={() => handleDayClick(day)}
                      className={`calendar-day ${events.length > 0 ? 'has-events' : ''} ${isCurrentDate ? 'current-date' : ''}`}
                    >
                      <div className="day-number">{day}</div>
                      
                      {/* Moon phase indicator */}
                      <MoonPhaseIndicator date={dayDate} />
                      
                      {/* Event indicators */}
                      <div className="event-indicators">
                        {events.slice(0, 3).map((event, eventIndex) => (
                          <div 
                            key={eventIndex}
                            className={`event-dot ${getEventTypeClass(event.type)}`}
                            title={`${event.name || event.title}${event.isRecurring ? ' (Recurring: ' + event.recurring + ')' : ''}`}
                          />
                        ))}
                        {events.length > 3 && (
                          <span className="more-events">+{events.length - 3}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal for event details */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="event-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <button className="close-button" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-content">
              {selectedEvents.map((event, index) => (
                <div key={index} className={`event-item ${getEventTypeClass(event.type)}`}>
                  <div className="event-header">
                    <h3>
                      {event.name || event.title}
                      {event.isRecurring && <span className="recurring-badge">Recurring</span>}
                    </h3>
                    <span className="event-type">{event.type || 'Unknown'}</span>
                  </div>
                  
                  {/* Show recurring pattern if applicable */}
                  {event.isRecurring && event.recurring && (
                    <p className="recurring-pattern">
                      <strong>Pattern:</strong> {event.recurring}
                    </p>
                  )}
                  
                  {/* Event description */}
                  {event.description && (
                    <div className="event-description">
                      <p>{event.description}</p>
                    </div>
                  )}
                  
                  {/* Additional details if present */}
                  {event.details && (
                    <div className="event-details">
                      <p>{event.details}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GolarionCalendar;