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

const GolarionCalendar = () => {
  // Current game date - 21st of Desnus (month index 4), 4725 AR
  const gameDay = 21;
  const gameMonth = 4; // 0-indexed, so 4 = Desnus (5th month)
  const gameYear = 4725;
  
  const [currentMonth, setCurrentMonth] = useState(gameMonth);
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

  // Generate calendar days
  const generateCalendarDays = () => {
    const startDay = getMonthStartDay(currentYear, currentMonth);
    const daysInMonth = GOLARION_MONTHS[currentMonth].days;
    const days = [];

    // Add empty cells for days before the month starts
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const events = getEventsForDate(currentYear, currentMonth, day);
      const isCurrentDate = (currentYear === gameYear && currentMonth === gameMonth && day === gameDay);
      
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
    <div className="golarion-calendar-page" style={{
      position: 'fixed',
      top: '60px',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundImage: 'url("../Background.png")',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      padding: '2rem',
      overflowY: 'auto'
    }}>
      {/* Dark overlay like other pages */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.3)',
        zIndex: 1
      }} />
      
      <div style={{ position: 'relative', zIndex: 2, maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '12px',
          padding: '2rem',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          
          {/* Calendar Header */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '2rem',
            borderBottom: '2px solid #8B4513',
            paddingBottom: '1rem'
          }}>
            <button 
              onClick={previousMonth}
              style={{
                background: '#8B4513',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                fontSize: '1.2rem'
              }}
            >
              ‹ Previous
            </button>
            
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ 
                color: '#8B4513', 
                margin: 0,
                fontSize: '2rem',
                fontWeight: 'bold'
              }}>
                {GOLARION_MONTHS[currentMonth].name} {currentYear} AR
              </h1>
              <p style={{ 
                color: '#666', 
                margin: '0.5rem 0',
                fontSize: '1.1rem'
              }}>
                {GOLARION_MONTHS[currentMonth].season} • Golarion Calendar
              </p>
            </div>
            
            <button 
              onClick={nextMonth}
              style={{
                background: '#8B4513',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                cursor: 'pointer',
                fontSize: '1.2rem'
              }}
            >
              Next ›
            </button>
          </div>

          {/* Current Date Indicator */}
          {currentYear === gameYear && currentMonth === gameMonth && (
            <div style={{
              background: 'rgba(139, 69, 19, 0.1)',
              border: '2px solid #8B4513',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              <strong style={{ color: '#8B4513', fontSize: '1.1rem' }}>
                Current Campaign Date: {gameDay} {GOLARION_MONTHS[gameMonth].name}, {gameYear} AR
              </strong>
            </div>
          )}

          {/* Weekday Headers */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '1px',
            marginBottom: '1rem'
          }}>
            {WEEKDAYS.map(weekday => (
              <div key={weekday} style={{
                background: '#8B4513',
                color: 'white',
                padding: '0.75rem',
                textAlign: 'center',
                fontWeight: 'bold',
                fontSize: '0.9rem'
              }}>
                {weekday.slice(0, 3)}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '1px',
            background: '#ddd'
          }}>
            {calendarDays.map((dayData, index) => {
              if (!dayData) {
                return (
                  <div key={index} style={{
                    background: '#f5f5f5',
                    minHeight: '80px'
                  }} />
                );
              }

              const { day, events, isCurrentDate } = dayData;
              
              return (
                <div 
                  key={day}
                  onClick={() => handleDayClick(day)}
                  style={{
                    background: isCurrentDate ? 'rgba(139, 69, 19, 0.2)' : 'white',
                    border: isCurrentDate ? '3px solid #8B4513' : '1px solid #ddd',
                    minHeight: '80px',
                    padding: '0.5rem',
                    cursor: events.length > 0 ? 'pointer' : 'default',
                    position: 'relative',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (events.length > 0) {
                      e.target.style.background = 'rgba(139, 69, 19, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrentDate) {
                      e.target.style.background = 'white';
                    }
                  }}
                >
                  <div style={{ 
                    fontWeight: isCurrentDate ? 'bold' : 'normal',
                    color: isCurrentDate ? '#8B4513' : '#333',
                    fontSize: isCurrentDate ? '1.1rem' : '1rem'
                  }}>
                    {day}
                  </div>
                  
                  {events.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      bottom: '2px',
                      left: '2px',
                      right: '2px',
                      fontSize: '0.7rem'
                    }}>
                      {events.slice(0, 2).map((event, eventIndex) => (
                        <div key={eventIndex} style={{
                          background: EVENT_TYPE_COLORS[event.type] || EVENT_TYPE_COLORS.default,
                          color: 'white',
                          padding: '1px 3px',
                          borderRadius: '2px',
                          marginBottom: '1px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {event.title}
                        </div>
                      ))}
                      {events.length > 2 && (
                        <div style={{ 
                          fontSize: '0.6rem', 
                          color: '#666',
                          textAlign: 'center'
                        }}>
                          +{events.length - 2} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ 
            marginTop: '2rem',
            padding: '1rem',
            background: 'rgba(139, 69, 19, 0.05)',
            borderRadius: '8px'
          }}>
            <h4 style={{ color: '#8B4513', marginBottom: '1rem' }}>Event Types</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              {Object.entries(EVENT_TYPE_COLORS).map(([type, color]) => (
                type !== 'default' && (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      background: color,
                      borderRadius: '3px'
                    }} />
                    <span style={{ textTransform: 'capitalize', fontSize: '0.9rem' }}>
                      {type}
                    </span>
                  </div>
                )
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Event Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflowY: 'auto',
            margin: '1rem'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: '#8B4513', marginBottom: '1rem' }}>
              Events for this Date
            </h3>
            
            {selectedEvents.map((event, index) => (
              <div key={index} style={{
                padding: '1rem',
                border: `1px solid ${EVENT_TYPE_COLORS[event.type] || EVENT_TYPE_COLORS.default}`,
                borderRadius: '8px',
                marginBottom: '1rem'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem'
                }}>
                  <h4 style={{ margin: 0, color: '#333' }}>
                    {event.title}
                  </h4>
                  <span style={{
                    background: EVENT_TYPE_COLORS[event.type] || EVENT_TYPE_COLORS.default,
                    color: 'white',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    textTransform: 'capitalize'
                  }}>
                    {event.type}
                  </span>
                </div>
                <p style={{ margin: 0, color: '#666' }}>
                  {event.description}
                </p>
              </div>
            ))}
            
            <button 
              onClick={() => setShowModal(false)}
              style={{
                background: '#8B4513',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '0.75rem 1.5rem',
                cursor: 'pointer',
                width: '100%',
                marginTop: '1rem'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GolarionCalendar;