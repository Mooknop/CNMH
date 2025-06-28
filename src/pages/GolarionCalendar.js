import React, { useState, useEffect } from 'react';
import { useGameDate } from '../contexts/GameDateContext';
import timelineData from '../data/Timeline.json';
import './GolarionCalendar.css';

const GolarionCalendar = () => {
  const { 
    gameDate, 
    formatGameDate, 
    GOLARION_MONTHS, 
    GOLARION_WEEKDAYS,
    getDayOfWeek 
  } = useGameDate();

  const EVENT_TYPE_COLORS = {
  "campaign": "#8B4513",
  "holiday": "#DC143C", 
  "world event": "#4B0082",
  "personal": "#228B22",
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
  const getEventsForDate = (year, month, day) => {
    return timelineData.filter(event => 
      event.date.year === year && 
      event.date.month === month && 
      event.date.day === day
    );
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
      
      days.push({
        day,
        events,
        isCurrentDate
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
            
            <div className="month-year-display">
              <h2 className="month-name">
                {GOLARION_MONTHS[currentMonth].name}
              </h2>
              <div className="year-season">
                <span className="year">{currentYear} AR</span>
                <span className="season">{GOLARION_MONTHS[currentMonth].season}</span>
              </div>
            </div>
            
            <button onClick={nextMonth} className="nav-button">
              Next ›
            </button>
          </div>

          {/* Current campaign date indicator */}
          {currentYear === gameDate.year && currentMonth === gameDate.month && (
            <>
              <strong>
                  Current Date
                </strong>
              <div className="current-date-indicator">
                <strong>
                  {formatGameDate()}
                </strong>
              </div>
            </>
          )}

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
            <div className="calendar-week">
              {calendarDays.map((dayData, index) => {
                if (!dayData) {
                  return (
                    <div key={`empty-${index}`} className="calendar-day empty" />
                  );
                }

                const { day, events, isCurrentDate } = dayData;
                
                return (
                  <div 
                    key={`${currentYear}-${currentMonth}-${day}`}
                    onClick={() => handleDayClick(day)}
                    className={`calendar-day ${events.length > 0 ? 'has-events' : ''} ${isCurrentDate ? 'current-date' : ''}`}
                  >
                    <div className="day-number">
                      {day}
                    </div>
                    
                    {/* Event indicators */}
                    {events.length > 0 && (
                      <div className="event-indicators">
                        {events.slice(0, 2).map((event, eventIndex) => (
                          <div 
                            key={`${currentYear}-${currentMonth}-${day}-event-${eventIndex}`}
                            className={`event-dot ${getEventTypeClass(event.type)}`}
                            title={event.title}
                          />
                        ))}
                        {events.length > 2 && (
                          <div className="more-events">
                            +{events.length - 2} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Calendar Legend */}
          {/* <div className="calendar-legend">
            <h3>Event Types</h3>
            <div className="legend-items">
              {Object.entries(EVENT_TYPE_COLORS).filter(([key]) => key !== 'default').map(([type, color]) => (
                <div key={type} className="legend-item">
                  <div className={`legend-dot ${getEventTypeClass(type)}`} />
                  <span className="legend-label">{type}</span>
                </div>
              ))}
            </div>
          </div> */}
        </div>
      </div>

      {/* Event Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="event-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                Events for {selectedEvents.length > 0 && selectedEvents[0].date ? 
                  `${selectedEvents[0].date.day} ${GOLARION_MONTHS[selectedEvents[0].date.month].name}, ${selectedEvents[0].date.year} AR` : 
                  'Selected Date'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="close-button"
              >
                ×
              </button>
            </div>

            <div className="modal-content">
              {selectedEvents.map((event, index) => (
                <div key={`modal-event-${event.id || index}`} className="event-item">
                  <div className="event-header">
                    <h3 className={getEventTypeClass(event.type)}>
                      {event.title}
                    </h3>
                    <span className={`event-type ${getEventTypeClass(event.type)}`}>
                      {event.type}
                    </span>
                  </div>
                  <p className="event-description">
                    {event.description}
                  </p>
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