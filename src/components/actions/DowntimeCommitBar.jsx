import React, { useState, useEffect } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useDowntimeFatigue } from '../../hooks/useDowntimeFatigue';
import { getDaysCommitted, periodState, stampPeriod } from '../../utils/downtimeUtils';
import './DowntimeCommitBar.css';

// Lets a player commit one day of downtime (8h) or work through the night (16h).
// Each 8h block is assigned to one of the player's selected activities.
// Working through the night adds a second block and applies Fatigued; a day-only
// commit clears Fatigued (counts as a rest).
//
// When Crafting hours are committed and in-progress craft projects exist, an
// allocation panel appears — the player must distribute the crafting hours
// across projects before the commit button enables.
//
// Does NOT advance the shared clock — that's the GM's job via DowntimeControl.
const DowntimeCommitBar = ({ character, block }) => {
  const charId = character?.id || 'unknown';
  const [downtime, setDowntime] = useSyncedState(`cnmh_downtime_${charId}`, null);
  const [craftProjects, setCraftProjects] = useSyncedState(`cnmh_craftprojects_${charId}`, null);
  const { applyFatigue, clearFatigue } = useDowntimeFatigue(charId);

  const [dayChoice, setDayChoice] = useState('');
  const [nightChoice, setNightChoice] = useState('');
  const [workNight, setWorkNight] = useState(false);
  const [projectAllocations, setProjectAllocations] = useState({});

  const startedAt = block?.startedAt;
  const { selected, ledger } = periodState(downtime, startedAt);
  const daysCommitted = getDaysCommitted(ledger);
  const blockDays = block?.days ?? 0;
  const budgetExhausted = daysCommitted >= blockDays;

  const dayActivity = selected.includes(dayChoice) ? dayChoice : (selected[0] ?? '');
  const nightActivity = selected.includes(nightChoice) ? nightChoice : (selected[0] ?? '');

  const projects = craftProjects?.projects || [];

  const craftingHours =
    (dayActivity === 'Crafting' ? 8 : 0) +
    (workNight && nightActivity === 'Crafting' ? 8 : 0);

  // When craftingHours or the project set changes, reset allocations to defaults:
  // put all crafting hours on the furthest-along project.
  const projectSig = projects.map(p => `${p.id}:${p.hours}`).join(',');
  useEffect(() => {
    if (craftingHours === 0 || projects.length === 0) {
      setProjectAllocations({});
      return;
    }
    const furthest = projects.reduce((a, b) => (a.hours >= b.hours ? a : b));
    const alloc = Object.fromEntries(projects.map(p => [p.id, 0]));
    alloc[furthest.id] = craftingHours;
    setProjectAllocations(alloc);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [craftingHours, projectSig]);

  const totalAllocated = projects.reduce((sum, p) => sum + (projectAllocations[p.id] ?? 0), 0);
  const allocationValid =
    craftingHours === 0 || projects.length === 0 || totalAllocated === craftingHours;

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
    if (craftingHours > 0 && projects.length > 0) {
      setCraftProjects(prev => ({
        projects: (prev?.projects || []).map(p =>
          (projectAllocations[p.id] ?? 0) > 0
            ? { ...p, hours: p.hours + (projectAllocations[p.id] ?? 0) }
            : p
        ),
      }));
    }
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

      {craftingHours > 0 && projects.length > 0 && (
        <div className="dtcb-alloc">
          <span className="dtcb-alloc-label">Allocate crafting hours</span>
          {projects.map(p => (
            <div key={p.id} className="dtcb-alloc-row">
              <div className="dtcb-alloc-info">
                <span className="dtcb-alloc-name">{p.name}</span>
                <span className="dtcb-alloc-progress">{p.hours}h / {p.threshold}h</span>
              </div>
              <input
                type="number"
                className="dtcb-alloc-input"
                min={0}
                max={craftingHours}
                step={8}
                value={projectAllocations[p.id] ?? 0}
                onChange={e => setProjectAllocations(prev => ({
                  ...prev,
                  [p.id]: Math.max(0, Math.min(craftingHours, parseInt(e.target.value, 10) || 0)),
                }))}
                aria-label={`Hours for ${p.name}`}
              />
            </div>
          ))}
          <span className="dtcb-alloc-total" data-valid={allocationValid}>
            {totalAllocated} / {craftingHours}h allocated
          </span>
        </div>
      )}

      <div className="dtcb-footer">
        <button className="dtcb-commit-btn" onClick={commit} disabled={!allocationValid}>
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
