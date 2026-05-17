// src/pages/GolarionCalendar.js
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameDate } from '../contexts/GameDateContext';
import { useContent } from '../contexts/ContentContext';
import MoonPhase, { MoonPhaseIndicator } from '../components/calendar/MoonPhase';
import { getEventTypeClass, createCalendarHelpers } from '../utils/calendarUtils';
import './GolarionCalendar.css';

const GolarionCalendar = () => {
  const navigate = useNavigate();
  const {
    gameDate,
    GOLARION_MONTHS,
    GOLARION_WEEKDAYS,
    getDayOfWeek,
    getMoonPhaseInfo,
  } = useGameDate();

  const { calendarEvents } = useContent();

  const [currentMonth, setCurrentMonth] = useState(gameDate.month);
  const [currentYear, setCurrentYear] = useState(gameDate.year);
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [showModal, setShowModal] = useState(false);

  const { getEventsForDate } = createCalendarHelpers({
    GOLARION_MONTHS,
    GOLARION_WEEKDAYS,
    getDayOfWeek,
    getMoonPhaseInfo,
    timelineData: calendarEvents,
  });

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

    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const events = getEventsForDate(currentYear, currentMonth, day);
      const isCurrentDate = (
        currentYear === gameDate.year &&
        currentMonth === gameDate.month &&
        day === gameDate.day
      );
      const dayDate = { day, month: currentMonth, year: currentYear };
      const moonInfo = getMoonPhaseInfo(dayDate);

      days.push({ day, events, isCurrentDate, moonInfo });
    }

    return days;
  };

  const calendarDays = generateCalendarDays();

  return (
    <div className="golarion-calendar">
      {/* Calendar content wrapper */}
      <div className="calendar-content">

        {/* Page title */}
        <div className="calendar-page-header">
          <h1>Golarion Calendar</h1>
          <button className="calendar-history-btn" onClick={() => navigate('/timeline')}>
            📜 History
          </button>
        </div>

        {/* Calendar container */}
        <div className="calendar-container">
          <MoonPhase date={gameDate} />

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
            {Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, weekIndex) => (
              <div key={weekIndex} className="calendar-week">
                {calendarDays.slice(weekIndex * 7, (weekIndex + 1) * 7).map((dayData, dayIndex) => {
                  if (!dayData) {
                    return <div key={`empty-${weekIndex}-${dayIndex}`} className="calendar-day empty" />;
                  }

                  const { day, events, isCurrentDate } = dayData;
                  const dayDate = { day, month: currentMonth, year: currentYear };

                  return (
                    <div
                      key={`${currentYear}-${currentMonth}-${day}`}
                      onClick={() => handleDayClick(day)}
                      className={`calendar-day ${events.length > 0 ? 'has-events' : ''} ${isCurrentDate ? 'current-date' : ''}`}
                    >
                      <div className="day-number">{day}</div>
                      <MoonPhaseIndicator date={dayDate} />
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

      {/* Event detail modal — uses calendar-specific class names to avoid conflict with shared Modal.css */}
      {showModal && (
        <div className="calendar-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="event-modal" onClick={e => e.stopPropagation()}>
            <div className="event-modal-header">
              <button className="event-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="event-modal-body">
              {selectedEvents.map((event, index) => (
                <div key={index} className={`event-item ${getEventTypeClass(event.type)}`}>
                  <div className="event-header">
                    <h3>{event.name || event.title}</h3>
                    <span className="event-type">{event.type || 'Unknown'}</span>
                  </div>
                  {event.description && (
                    <div className="event-description">
                      <p>{event.description}</p>
                    </div>
                  )}
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
