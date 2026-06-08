import React, { useState, useEffect } from 'react';
import Modal from '../shared/Modal';
import { useGameDate } from '../../contexts/GameDateContext';
import './SetDateTimeModal.css';
import './SetDateTimeModal.css';

const SetDateTimeModal = ({ isOpen, onClose }) => {
  const { gameDate, time, GOLARION_MONTHS, setSpecificDate } = useGameDate();

  const [day, setDay] = useState(gameDate.day);
  const [month, setMonth] = useState(gameDate.month);
  const [year, setYear] = useState(gameDate.year);
  const [hour, setHour] = useState(time.hour);
  const [minute, setMinute] = useState(time.minute);

  // Seed fields from current clock each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setDay(gameDate.day);
      setMonth(gameDate.month);
      setYear(gameDate.year);
      setHour(time.hour);
      setMinute(time.minute);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const daysInMonth = GOLARION_MONTHS[month].days;
  const clampedDay = Math.min(day, daysInMonth);

  const isValid =
    clampedDay >= 1 &&
    year > 0 &&
    hour >= 0 && hour <= 23 &&
    minute >= 0 && minute <= 59;

  const handleSet = () => {
    if (!isValid) return;
    setSpecificDate(clampedDay, month, year, hour, minute);
    onClose();
  };

  const handleMonthChange = (e) => {
    const m = parseInt(e.target.value, 10);
    setMonth(m);
    // Clamp day to new month's max on change so the UI stays consistent.
    setDay((d) => Math.min(d, GOLARION_MONTHS[m].days));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set date & time" maxWidth="360px">
      <div className="sdtm-form">
        <div className="sdtm-row">
          <label className="sdtm-label" htmlFor="sdtm-day">Day</label>
          <input
            id="sdtm-day"
            className="sdtm-input sdtm-input--narrow"
            type="number"
            min="1"
            max={daysInMonth}
            value={day}
            onChange={(e) => setDay(parseInt(e.target.value, 10) || 1)}
            aria-label="Day"
          />
        </div>

        <div className="sdtm-row">
          <label className="sdtm-label" htmlFor="sdtm-month">Month</label>
          <select
            id="sdtm-month"
            className="sdtm-select"
            value={month}
            onChange={handleMonthChange}
            aria-label="Month"
          >
            {GOLARION_MONTHS.map((m) => (
              <option key={m.index} value={m.index}>{m.name}</option>
            ))}
          </select>
        </div>

        <div className="sdtm-row">
          <label className="sdtm-label" htmlFor="sdtm-year">Year (AR)</label>
          <input
            id="sdtm-year"
            className="sdtm-input sdtm-input--narrow"
            type="number"
            min="1"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10) || 1)}
            aria-label="Year"
          />
        </div>

        <div className="sdtm-divider" />

        <div className="sdtm-row">
          <label className="sdtm-label" htmlFor="sdtm-hour">Hour (0–23)</label>
          <input
            id="sdtm-hour"
            className="sdtm-input sdtm-input--narrow"
            type="number"
            min="0"
            max="23"
            value={hour}
            onChange={(e) => setHour(parseInt(e.target.value, 10) || 0)}
            aria-label="Hour"
          />
        </div>

        <div className="sdtm-row">
          <label className="sdtm-label" htmlFor="sdtm-minute">Minute (0–59)</label>
          <input
            id="sdtm-minute"
            className="sdtm-input sdtm-input--narrow"
            type="number"
            min="0"
            max="59"
            value={minute}
            onChange={(e) => setMinute(parseInt(e.target.value, 10) || 0)}
            aria-label="Minute"
          />
        </div>

        <div className="sdtm-actions">
          <button className="pmc-btn pmc-btn--primary" onClick={handleSet} disabled={!isValid}>
            Set
          </button>
          <button className="pmc-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SetDateTimeModal;
