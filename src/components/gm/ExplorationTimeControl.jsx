import React, { useState, useMemo, useCallback } from 'react';
import { useGameDate } from '../../contexts/GameDateContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { RELAY, globalKey } from '../../sync/keys';

// GM control for advancing time during exploration. Provides quick buttons
// (+10 min, +30 min, +1 hr) and a custom input, plus an optional "suggest
// from distance" helper that estimates elapsed time from accumulated party
// movement (cnmh_exploredist_global) against the slowest PC's speed from the
// roster (cnmh_roster_global).
//
// Suggestion math: PF2e exploration = half Speed per round (6 s).
//   feet_per_second = (speed / 2) / 6
//   elapsed_seconds = exploredist / feet_per_second
//                   = exploredist * 12 / lowestSpeed
// Result is rounded to nearest 10 min to avoid trickle-of-seconds noise.

const ExplorationTimeControl = () => {
  const { advanceMinutes, advanceSeconds, formatGameDate, formatClockTime } = useGameDate();
  const [exploreDist, setExploreDist] = useSyncedState('cnmh_exploredist_global', 0);
  const [roster] = useSyncedState(globalKey(RELAY.ROSTER), []);
  const [customValue, setCustomValue] = useState('');
  const [customUnit, setCustomUnit] = useState('min');

  const suggestedMinutes = useMemo(() => {
    if (!exploreDist || exploreDist <= 0 || !roster?.length) return null;
    const speeds = roster.map((e) => e.speed).filter((s) => s > 0);
    if (!speeds.length) return null;
    const lowestSpeed = Math.min(...speeds);
    const rawSeconds = (exploreDist * 12) / lowestSpeed;
    const rawMinutes = rawSeconds / 60;
    // Round to nearest 10 min; floor at 10 so a suggestion is always visible.
    return Math.max(10, Math.round(rawMinutes / 10) * 10);
  }, [exploreDist, roster]);

  const applyCustom = useCallback(() => {
    const val = parseFloat(customValue);
    if (!val || val <= 0) return;
    if (customUnit === 'hours') {
      advanceMinutes(Math.round(val * 60));
    } else {
      advanceMinutes(Math.round(val));
    }
    setCustomValue('');
  }, [customValue, customUnit, advanceMinutes]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') applyCustom();
  }, [applyCustom]);

  const applyDistanceSuggestion = useCallback(() => {
    if (!suggestedMinutes) return;
    advanceSeconds(suggestedMinutes * 60);
    setExploreDist(0);
  }, [suggestedMinutes, advanceSeconds, setExploreDist]);

  const canApply = customValue !== '' && parseFloat(customValue) > 0;

  return (
    <div className="pmc-explore-time">
      <div className="pmc-downtime-quick">
        <button className="pmc-tchip" onClick={() => advanceMinutes(10)}>+10 min</button>
        <button className="pmc-tchip" onClick={() => advanceMinutes(30)}>+30 min</button>
        <button className="pmc-tchip" onClick={() => advanceMinutes(60)}>+1 hr</button>
      </div>

      <div className="pmc-downtime-custom">
        <input
          className="pmc-downtime-input"
          type="number"
          min="1"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0"
          aria-label="Custom time amount"
        />
        <select
          className="pmc-downtime-unit"
          value={customUnit}
          onChange={(e) => setCustomUnit(e.target.value)}
          aria-label="Time unit"
        >
          <option value="min">min</option>
          <option value="hours">hr</option>
        </select>
        <button className="pmc-btn pmc-btn--sm" onClick={applyCustom} disabled={!canApply}>
          Apply
        </button>
      </div>

      {suggestedMinutes != null && (
        <div className="pmc-explore-suggestion">
          <span className="pmc-explore-suggestion-label">
            Party moved {exploreDist} ft → ~{suggestedMinutes} min
          </span>
          <button className="pmc-btn pmc-btn--primary pmc-btn--sm" onClick={applyDistanceSuggestion}>
            Apply
          </button>
        </div>
      )}

      <div className="pmc-downtime-clock">{formatGameDate()} · {formatClockTime()}</div>
    </div>
  );
};

export default ExplorationTimeControl;
