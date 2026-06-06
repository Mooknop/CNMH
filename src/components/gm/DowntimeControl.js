import React, { useState } from 'react';
import { useGameDate } from '../../contexts/GameDateContext';

// GM controls for advancing time during Downtime mode. Quick buttons cover
// the common increments; the custom field handles unusual durations.
const DowntimeControl = () => {
  const { advanceHours, advanceDays, formatGameDate, formatClockTime } = useGameDate();
  const [customValue, setCustomValue] = useState('');
  const [customUnit, setCustomUnit] = useState('hours');

  const applyCustom = () => {
    const n = parseInt(customValue, 10);
    if (!n || n <= 0) return;
    if (customUnit === 'hours') advanceHours(n);
    else advanceDays(n);
    setCustomValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') applyCustom();
  };

  return (
    <div className="pmc-downtime">
      <span className="pmc-label">Advance Time</span>

      <div className="pmc-downtime-quick">
        <button className="pmc-pill" onClick={() => advanceHours(1)}>+1 hr</button>
        <button className="pmc-pill" onClick={() => advanceHours(8)}>+8 hr</button>
        <button className="pmc-pill" onClick={() => advanceDays(1)}>+1 day</button>
      </div>

      <div className="pmc-downtime-custom">
        <input
          className="pmc-downtime-input"
          type="number"
          min="1"
          placeholder="Custom…"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Custom duration"
        />
        <select
          className="pmc-downtime-unit"
          value={customUnit}
          onChange={(e) => setCustomUnit(e.target.value)}
          aria-label="Duration unit"
        >
          <option value="hours">hrs</option>
          <option value="days">days</option>
        </select>
        <button
          className="pmc-pill"
          onClick={applyCustom}
          disabled={!customValue || parseInt(customValue, 10) <= 0}
        >
          Apply
        </button>
      </div>

      <div className="pmc-downtime-clock">
        {formatGameDate()} · {formatClockTime()}
      </div>
    </div>
  );
};

export default DowntimeControl;
