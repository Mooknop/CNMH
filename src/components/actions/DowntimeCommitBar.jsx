import React, { useState } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useDowntimeFatigue } from '../../hooks/useDowntimeFatigue';
import { getDaysCommitted, periodState, stampPeriod } from '../../utils/downtimeUtils';
import './DowntimeCommitBar.css';

// Lets a player commit one day of downtime (8h) or work through the night (16h).
// Each 8h block is assigned to one of the player's selected activities.
// Working through the night adds a second block and applies Fatigued; a day-only
// commit clears Fatigued (counts as a rest).
//
// Does NOT advance the shared clock — that's the GM's job via DowntimeControl.
const DowntimeCommitBar = ({ character, block }) => {
  const charId = character?.id || 'unknown';
  const [downtime, setDowntime] = useSyncedState(`cnmh_downtime_${charId}`, null);
  const { applyFatigue, clearFatigue } = useDowntimeFatigue(charId);

  const [dayChoice, setDayChoice] = useState('');
  const [nightChoice, setNightChoice] = useState('');
  const [workNight, setWorkNight] = useState(false);

  const startedAt = block?.startedAt;
  const { selected, ledger } = periodState(downtime, startedAt);
  const daysCommitted = getDaysCommitted(ledger);
  const blockDays = block?.days ?? 0;
  const budgetExhausted = daysCommitted >= blockDays;

  // Derive effective activity choices, falling back to the first selected
  // activity whenever the stored choice is no longer in the selection.
  const dayActivity = selected.includes(dayChoice) ? dayChoice : (selected[0] ?? '');
  const nightActivity = selected.includes(nightChoice) ? nightChoice : (selected[0] ?? '');

  if (selected.length === 0) {
    return (
      <div className="dtcb-hint">Select activities above to get started.</div>
    );
  }

  if (budgetExhausted) {
    return (
      <div className="dtcb-hint dtcb-hint--done">
        All {blockDays} day{blockDays === 1 ? '' : 's'} committed — wait for the GM to advance the clock.
      </div>
    );
  }

  const commit = () => {
    const night = workNight ? nightActivity : null;
    setDowntime((prev) => {
      const scoped = periodState(prev, startedAt);
      return stampPeriod(prev, startedAt, {
        ledger: [...scoped.ledger, { day: dayActivity, night }],
      });
    });
    if (workNight) {
      applyFatigue();
    } else {
      clearFatigue();
    }
    setWorkNight(false);
  };

  const multiSelect = selected.length > 1;

  return (
    <div className="dtcb-wrap">
      <span className="dtcb-label">Commit a day</span>

      <div className="dtcb-row">
        <span className="dtcb-block-label">Day (8h)</span>
        {multiSelect ? (
          <select
            className="dtcb-select"
            value={dayActivity}
            onChange={(e) => setDayChoice(e.target.value)}
            aria-label="Day activity"
          >
            {selected.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        ) : (
          <span className="dtcb-activity-name">{dayActivity}</span>
        )}
      </div>

      <label className="dtcb-night-label">
        <input
          type="checkbox"
          className="dtcb-night-checkbox"
          checked={workNight}
          onChange={(e) => setWorkNight(e.target.checked)}
          aria-label="Work through the night"
        />
        Work through the night (+8h, Fatigued)
      </label>

      {workNight && (
        <div className="dtcb-row">
          <span className="dtcb-block-label">Night (8h)</span>
          {multiSelect ? (
            <select
              className="dtcb-select"
              value={nightActivity}
              onChange={(e) => setNightChoice(e.target.value)}
              aria-label="Night activity"
            >
              {selected.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          ) : (
            <span className="dtcb-activity-name">{nightActivity}</span>
          )}
        </div>
      )}

      <div className="dtcb-footer">
        <button className="dtcb-commit-btn" onClick={commit}>
          Commit {workNight ? '16h' : '8h'} day
        </button>
        <span className="dtcb-budget">
          Day {daysCommitted + 1} of {blockDays}
          {daysCommitted + 1 === blockDays ? ' (last day)' : ''}
        </span>
      </div>
    </div>
  );
};

export default DowntimeCommitBar;
