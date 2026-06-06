import React, { useState } from 'react';
import { useGameDate } from '../../contexts/GameDateContext';
import { useSyncedState } from '../../hooks/useSyncedState';

// GM controls for Downtime mode. The period setter grants the party a budget of
// downtime days (`cnmh_downtimeblock_global`) that players allocate to
// activities; the advance-time controls move the shared clock once the block is
// resolved. Quick buttons cover the common increments; the custom field handles
// unusual durations.
const DowntimeControl = () => {
  const { advanceHours, advanceDays, formatGameDate, formatClockTime, gameDate } = useGameDate();
  const [block, setBlock] = useSyncedState('cnmh_downtimeblock_global', null);
  const [customValue, setCustomValue] = useState('');
  const [customUnit, setCustomUnit] = useState('hours');
  const [periodValue, setPeriodValue] = useState('');

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

  const startPeriod = () => {
    const n = parseInt(periodValue, 10);
    if (!n || n <= 0) return;
    setBlock({ days: n, active: true, startedAt: gameDate });
    setPeriodValue('');
  };

  const handlePeriodKeyDown = (e) => {
    if (e.key === 'Enter') startPeriod();
  };

  const periodInvalid = !periodValue || parseInt(periodValue, 10) <= 0;

  return (
    <div className="pmc-downtime">
      <span className="pmc-label">Downtime Period</span>

      <div className="pmc-downtime-period">
        <input
          className="pmc-downtime-input"
          type="number"
          min="1"
          placeholder="Days…"
          value={periodValue}
          onChange={(e) => setPeriodValue(e.target.value)}
          onKeyDown={handlePeriodKeyDown}
          aria-label="Downtime period in days"
        />
        <button
          className="pmc-pill"
          onClick={startPeriod}
          disabled={periodInvalid}
        >
          {block?.active ? 'Update' : 'Start'}
        </button>
        {block?.active && (
          <span className="pmc-downtime-period-active">
            {block.days} day{block.days === 1 ? '' : 's'} granted
          </span>
        )}
      </div>

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
