import React, { useState, useEffect } from 'react';
import timelineData from '../data/Timeline.json';

// Golarion Calendar data based on Pathfinder 2E lore
const GOLARION_MONTHS = [
  { name: "Abadius", days: 31, season: "Winter" },
  { name: "Calistril", days: 28, season: "Winter" },
  { name: "Pharast", days: 31, season: "Spring" },
  { name: "Gozran", days: 30, season: "Spring" },
  { name: "Desnus", days: 31, season: "Spring" },
  { name: "Sarenith", days: 30, season: "Summer" },
  { name: "Erastus", days: 31, season: "Summer" },
  { name: "Arodus", days: 31, season: "Summer" },
  { name: "Rova", days: 30, season: "Autumn" },
  { name: "Lamashan", days: 31, season: "Autumn" },
  { name: "Neth", days: 30, season: "Autumn" },
  { name: "Kuthona", days: 31, season: "Winter" }
];

const WEEKDAYS = ["Moonday", "Toilday", "Wealday", "Oathday", "Fireday", "Starday", "Sunday"];

// Event type colors matching Pathfinder 2E theme
const EVENT_TYPE_COLORS = {
  "campaign": "#8B4513",
  "holiday": "#DC143C", 
  "world event": "#4B0082",
  "personal": "#228B22",
  "default": "#5e2929"
};

const GolarionCalendar = (gameDay, gameMonth, gameYear) => {
  const [currentMonth, setCurrentMonth] = useState(gameMonth); // 0 = Abadius
  const [currentYear, setCurrentYear] = useState(gameYear);
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [showModal, setShowModal] = useState(false);

  // Get events for a specific date
  const getEventsForDate = (year, month, day) => {
    return timelineData.filter(event => 
      event.date.year === year && 
      event.date.month === month && 
      event.date.day === day
    );
  };

  // Calculate the starting day of week for the month (0 = Moonday)
  const getMonthStartDay = (year, month) => {
    // Simple calculation for demo - in real implementation you'd want accurate Golarion calendar math
    const baseYear = 4700;
    const yearDiff = year - baseYear;
    const totalDays = yearDiff * 365 + Math.floor(yearDiff / 4); // Rough leap year approximation
    
    let daysSinceYearStart = 0;
    for (let i = 0; i < month; i++) {
      daysSinceYearStart += GOLARION_MONTHS[i].days;
    }
    
    return (totalDays + daysSinceYearStart) % 7;
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

  // Generate calendar grid
  const generateCalendarGrid = () => {
    const month = GOLARION_MONTHS[currentMonth];
    const startDay = getMonthStartDay(currentYear, currentMonth);
    const daysInMonth = month.days;
    
    const grid = [];
    let dayCount = 1;
    
    // Generate 6 weeks (42 days) to ensure full month display
    for (let week = 0; week < 6; week++) {
      const weekRow = [];
      
      for (let day = 0; day < 7; day++) {
        const cellIndex = week * 7 + day;
        
        if (cellIndex < startDay || dayCount > daysInMonth) {
          // Empty cell
          weekRow.push(<div key={`empty-${cellIndex}`} className="calendar-day empty"></div>);
        } else {
          // Day with potential events
          const events = getEventsForDate(currentYear, currentMonth, dayCount);
          const hasEvents = events.length > 0;
          const eventColor = hasEvents ? EVENT_TYPE_COLORS[events[0].type] || EVENT_TYPE_COLORS.default : null;
          
          weekRow.push(
            <div 
              key={dayCount}
              className={`calendar-day ${hasEvents ? 'has-events' : ''}`}
              onClick={() => handleDayClick(dayCount)}
              style={hasEvents ? { borderColor: eventColor } : {}}
            >
              <span className="day-number">{dayCount}</span>
              {hasEvents && (
                <div className="event-indicators">
                  {events.slice(0, 3).map((event, index) => (
                    <div 
                      key={index}
                      className="event-dot"
                      style={{ backgroundColor: EVENT_TYPE_COLORS[event.type] || EVENT_TYPE_COLORS.default }}
                      title={event.title}
                    />
                  ))}
                  {events.length > 3 && <span className="more-events">+{events.length - 3}</span>}
                </div>
              )}
            </div>
          );
          dayCount++;
        }
      }
      
      grid.push(<div key={week} className="calendar-week">{weekRow}</div>);
      
      // Break if we've shown all days
      if (dayCount > daysInMonth) break;
    }
    
    return grid;
  };

  const currentMonthData = GOLARION_MONTHS[currentMonth];

  return (
    <div className="golarion-calendar">
      <div className="calendar-container">
        {/* Header */}
        <div className="calendar-header">
          <button className="nav-button" onClick={previousMonth}>
            ← 
          </button>
          <div className="month-year-display">
            <h1 className="month-name">{currentMonthData.name}</h1>
            <div className="year-season">
              <span className="year">{currentYear} AR</span>
              <span className="season">{currentMonthData.season}</span>
            </div>
          </div>
          <button className="nav-button" onClick={nextMonth}>
            →
          </button>
        </div>

        {/* Weekday headers */}
        <div className="weekday-headers">
          {WEEKDAYS.map(day => (
            <div key={day} className="weekday-header">{day.slice(0, 3)}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="calendar-grid">
          {generateCalendarGrid()}
        </div>

        {/* Legend */}
        <div className="calendar-legend">
          <h3>Event Types</h3>
          <div className="legend-items">
            {Object.entries(EVENT_TYPE_COLORS).filter(([key]) => key !== 'default').map(([type, color]) => (
              <div key={type} className="legend-item">
                <div className="legend-dot" style={{ backgroundColor: color }}></div>
                <span className="legend-label">{type.charAt(0).toUpperCase() + type.slice(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Event Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="event-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Events</h2>
              <button className="close-button" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-content">
              {selectedEvents.map((event, index) => (
                <div key={index} className="event-item">
                  <div className="event-header">
                    <h3 style={{ color: EVENT_TYPE_COLORS[event.type] || EVENT_TYPE_COLORS.default }}>
                      {event.title}
                    </h3>
                    <span className="event-type">{event.type}</span>
                  </div>
                  <p className="event-description">{event.description}</p>
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