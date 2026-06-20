import React, { useContext, useEffect, useRef, useState } from 'react';
import SetDateTimeModal from './SetDateTimeModal';
import { CharacterContext } from '../../contexts/CharacterContext';
import { useSession } from '../../contexts/SessionContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useDowntimePartyReady } from '../../hooks/useDowntimePartyReady';
import { periodState } from '../../utils/downtimeUtils';
import { taskDc } from '../../utils/earnIncome';
import DowntimeResultsApproval from './DowntimeResultsApproval';

// GM controls for Downtime mode. The period setter grants the party a budget of
// downtime days (`cnmh_downtimeblock_global`) that players allocate to activities.
// When the last PC commits their final day the clock auto-advances by the full
// block and the block closes — no GM button needed. The GM can also Close the
// block early without advancing time. Quick buttons / custom field handle ad-hoc
// time nudges independent of the downtime block.
const DowntimeControl = () => {
  const { characters } = useContext(CharacterContext) || {};
  const { getState } = useSession();
  const { setGmMode } = usePlayMode();
  const { advanceHours, advanceDays, formatGameDate, formatClockTime, gameDate } = useGameDate();
  const [block, setBlock] = useSyncedState('cnmh_downtimeblock_global', null);
  const [, setSummary] = useSyncedState('cnmh_downtimesummary_global', null);
  const [taskMap, setTaskMap] = useSyncedState('cnmh_earnincometask_global', null);
  const [customValue, setCustomValue] = useState('');
  const [customUnit, setCustomUnit] = useState('hours');
  const [periodValue, setPeriodValue] = useState('');
  const [showSetClock, setShowSetClock] = useState(false);

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

  // Primitive deps to avoid spurious effect re-runs when block reference changes.
  const blockActive = block?.active ?? false;
  const blockDays = block?.days ?? 0;
  const blockStartedAt = block?.startedAt ?? null;

  const { readyCount, total, allReady } = useDowntimePartyReady(blockActive ? blockDays : 0, blockStartedAt);

  // Capture latest characters without adding the array to effect deps.
  const charactersRef = useRef(characters);
  charactersRef.current = characters;

  // Auto-advance: when every PC commits their last day, write a summary,
  // advance the clock, close the block, and return to Exploration mode.
  // A ref prevents double-fire if the component re-renders while allReady
  // is still true.
  const autoAdvancedRef = useRef(false);
  useEffect(() => {
    if (!blockActive) {
      autoAdvancedRef.current = false; // reset so a new block can fire again
      return;
    }
    if (!allReady || autoAdvancedRef.current) return;
    autoAdvancedRef.current = true;

    const summaryChars = (charactersRef.current || []).map((c) => {
      const dt = getState(c.id, 'downtime');
      const { selected, ledger } = periodState(dt, blockStartedAt);
      return { id: c.id, name: c.name, selected, ledger };
    });
    setSummary({ period: { days: blockDays, startedAt: blockStartedAt }, chars: summaryChars });
    advanceDays(blockDays);
    setBlock((prev) => (prev ? { ...prev, active: false } : prev));
    setGmMode('exploration');
  }, [allReady, blockActive, blockDays, blockStartedAt, advanceDays, setBlock, setGmMode, setSummary, getState]);

  const closeBlock = () => {
    if (!block) return;
    setBlock({ ...block, active: false });
  };

  // Earn Income task level assigned per PC. The level fixes both the check DC and
  // the payout row; the player picks the skill (payout column) on their end.
  const setTaskLevel = (charId, raw) => {
    setTaskMap((prev) => {
      const next = { ...(prev || {}) };
      if (raw === '') delete next[charId];
      else next[charId] = Math.max(0, Math.min(20, parseInt(raw, 10) || 0));
      return next;
    });
  };

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
          className="pmc-btn pmc-btn--primary pmc-btn--sm"
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

      {block?.active && (
        <>
          <span className="pmc-label">Block Actions</span>
          <div className="pmc-downtime-block">
            <span className={`pmc-downtime-ready${allReady ? ' pmc-downtime-ready--done' : ''}`}>
              {readyCount}/{total} ready{allReady ? ' — advancing…' : ''}
            </span>
            <button className="pmc-btn pmc-btn--danger pmc-btn--sm" onClick={closeBlock}>
              Close block
            </button>
          </div>

          <span className="pmc-label">Earn Income Tasks</span>
          <div className="pmc-downtime-tasks">
            {(characters || []).map((c) => {
              const level = taskMap?.[c.id];
              return (
                <div key={c.id} className="pmc-downtime-task-row">
                  <span className="pmc-downtime-task-name">{c.name}</span>
                  <input
                    className="pmc-downtime-task-input"
                    type="number"
                    min="0"
                    max="20"
                    placeholder="Lvl"
                    value={level ?? ''}
                    onChange={(e) => setTaskLevel(c.id, e.target.value)}
                    aria-label={`${c.name} Earn Income task level`}
                  />
                  <span className="pmc-downtime-task-dc">
                    {level != null ? `DC ${taskDc(level)}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>

          <DowntimeResultsApproval />
        </>
      )}

      <span className="pmc-label">Advance Time</span>

      <div className="pmc-downtime-quick">
        <button className="pmc-tchip" onClick={() => advanceDays(-1)}>-1 day</button>
        <button className="pmc-tchip" onClick={() => advanceHours(-1)}>-1 hr</button>
        <button className="pmc-tchip" onClick={() => advanceHours(1)}>+1 hr</button>
        <button className="pmc-tchip" onClick={() => advanceHours(8)}>+8 hr</button>
        <button className="pmc-tchip" onClick={() => advanceDays(1)}>+1 day</button>
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
          className="pmc-btn pmc-btn--sm"
          onClick={applyCustom}
          disabled={!customValue || parseInt(customValue, 10) <= 0}
        >
          Apply
        </button>
      </div>

      <div className="pmc-downtime-clock">
        {formatGameDate()} · {formatClockTime()}
        <button
          className="pmc-btn pmc-btn--sm pmc-downtime-set-clock"
          onClick={() => setShowSetClock(true)}
          aria-label="Set date and time"
        >
          Set…
        </button>
      </div>

      <SetDateTimeModal isOpen={showSetClock} onClose={() => setShowSetClock(false)} />
    </div>
  );
};

export default DowntimeControl;
