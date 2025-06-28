import React, { useState, useEffect } from 'react';
import { useGameDate } from '../contexts/GameDateContext';
import timelineData from '../data/Timeline.json';

// Event type colors matching Pathfinder 2E theme
const EVENT_TYPE_COLORS = {
  "campaign": "#8B4513",
  "holiday": "#DC143C", 
  "world event": "#4B0082",
  "personal": "#228B22",
  "default": "#5e2929"
};

const GolarionCalendar = () => {
  const { 
    gameDate, 
    formatGameDate, 
    GOLARION_MONTHS, 
    GOLARION_WEEKDAYS,
    getDayOfWeek 
  } = useGameDate();
  
  const [currentMonth, setCurrentMonth] = useState(gameDate.month);
  const [currentYear, setCurrentYear] = useState(gameDate.year);
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
        background: 'rgba(0, 0, 0, 0.7)',
        zIndex: 1
      }} />

      {/* Calendar content */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        maxWidth: '1000px',
        margin: '0 auto',
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          paddingBottom: '1rem',
          borderBottom: '2px solid #8B4513'
        }}>
          <h1 style={{
            color: '#8B4513',
            margin: 0,
            fontSize: '2.5rem',
            fontWeight: 'bold'
          }}>
            Golarion Calendar
          </h1>
          <div style={{
            fontSize: '1.2rem',
            color: '#666',
            fontStyle: 'italic'
          }}>
            Absalom Reckoning
          </div>
        </div>

        {/* Month Navigation */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem'
        }}>
          <button
            onClick={previousMonth}
            style={{
              background: '#8B4513',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '1.2rem'
            }}
          >
            ‹ Previous
          </button>

          <h2 style={{
            color: '#8B4513',
            margin: 0,
            fontSize: '2rem',
            fontWeight: 'bold'
          }}>
            {GOLARION_MONTHS[currentMonth].name} {currentYear} AR
          </h2>

          <button
            onClick={nextMonth}
            style={{
              background: '#8B4513',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '1.2rem'
            }}
          >
            Next ›
          </button>
        </div>

        {/* Current Date Indicator */}
        {currentYear === gameDate.year && currentMonth === gameDate.month && (
          <div style={{
            background: 'rgba(139, 69, 19, 0.1)',
            border: '2px solid #8B4513',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            textAlign: 'center'
          }}>
            <strong style={{ color: '#8B4513', fontSize: '1.1rem' }}>
              Current Campaign Date: {formatGameDate()}
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
          {GOLARION_WEEKDAYS.map(weekday => (
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
                
                {/* Event indicators */}
                {events.length > 0 && (
                  <div style={{ marginTop: '0.25rem' }}>
                    {events.slice(0, 2).map((event, eventIndex) => (
                      <div 
                        key={eventIndex}
                        style={{
                          background: EVENT_TYPE_COLORS[event.type] || EVENT_TYPE_COLORS.default,
                          color: 'white',
                          fontSize: '0.7rem',
                          padding: '1px 4px',
                          borderRadius: '2px',
                          marginBottom: '1px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {event.title}
                      </div>
                    ))}
                    {events.length > 2 && (
                      <div style={{
                        fontSize: '0.7rem',
                        color: '#666',
                        fontStyle: 'italic'
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
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
              position: 'relative'
            }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#666'
                }}
              >
                ×
              </button>

              <h3 style={{ color: '#8B4513', marginBottom: '1rem' }}>
                Events
              </h3>

              {selectedEvents.map((event, index) => (
                <div key={index} style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem',
                  borderLeft: `4px solid ${EVENT_TYPE_COLORS[event.type] || EVENT_TYPE_COLORS.default}`
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem'
                  }}>
                    <h4 style={{
                      color: EVENT_TYPE_COLORS[event.type] || EVENT_TYPE_COLORS.default,
                      margin: 0
                    }}>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GolarionCalendar;