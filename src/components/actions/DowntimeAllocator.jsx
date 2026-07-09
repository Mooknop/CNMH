import React, { useState, useEffect } from 'react';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState } from '../../hooks/useSyncedState';
import { usePartyDowntime } from '../../hooks/usePartyDowntime';
import { DOWNTIME_ACTIVITIES } from '../../data/downtimeActivities';
import { periodState, stampPeriod, planDays } from '../../utils/downtimeUtils';
import { downtimeExpertFor } from '../../utils/downtimeExperts';
import { dailyReductionCp } from '../../utils/craftingOutcome';
import { cpToGp } from '../../utils/earnIncome';
import './DowntimeAllocator.css';
import { APP, syncKey, globalKey } from '../../sync/keys';

const firstNameOf = (name) => (name || '?').split(' ')[0];

// Projects that accept committed crafting time (ported from DowntimeCommitBar):
// still banking setup hours ('in-progress') or working off remaining cost
// ('reducing'). Awaiting-decision / completed projects are not allocation targets.
const isAllocatable = (p) => {
  const s = p.status || 'in-progress';
  return s === 'in-progress' || s === 'reducing';
};

// Per-activity day-allocation editor — the Party Ledger's only editable zone.
// Replaces the legacy multi-select picker (DowntimeList) and the incremental
// commit bar (DowntimeCommitBar): one slider per activity sets day-count
// directly, the sum is structurally capped at the block budget, and a single
// Lock-in seals the plan (status → 'ready', which gates the resolution surfaces).
//
// `plan` is the source of truth; selected/ledger derive from it (downtimeUtils),
// so every downstream reader keeps working. Crafting hours bank into in-progress
// projects at lock-in, tracked per-project in `craftApplied` so re-locking an
// edited plan only banks the new delta (no double-count).
const DowntimeAllocator = ({ character, block, characterColor }) => {
  const charId = character?.id || 'unknown';
  const themeColor = characterColor || 'var(--color-theme)';
  const characterModel = useCharacter(character);
  const [downtime, setDowntime] = useSyncedState(syncKey(APP.DOWNTIME, charId), null);
  const [craftProjects, setCraftProjects] = useSyncedState(syncKey(APP.CRAFTPROJECTS, charId), null);
  const [bench] = useSyncedState(globalKey(APP.DOWNTIMEBENCH), null);

  const startedAt = block?.startedAt;
  const { plan, status, craftApplied, paired } = periodState(downtime, startedAt);
  const { party } = usePartyDowntime(startedAt, charId);
  const blockDays = block?.days ?? 0;
  const used = planDays(plan);
  const free = Math.max(0, blockDays - used);
  const locked = status === 'ready';

  // GM-set Retrain/Research benchmarks (days); Crafting tracks its own projects.
  const benchDays = bench?.[charId] || {};

  // Crafting banking math. craftApplied is keyed by project id; its total is the
  // crafting hours already spent this period (irreversible — a locked day can't
  // be un-banked), so the Crafting slider can't drop below it.
  const bankedHours = Object.values(craftApplied || {}).reduce((s, h) => s + (Number(h) || 0), 0);
  const bankedDays = Math.ceil(bankedHours / 8);
  const craftingHours = (plan.Crafting || 0) * 8;
  const availableToBank = Math.max(0, craftingHours - bankedHours);
  const projects = (craftProjects?.projects || []).filter(isAllocatable);

  // Local split of the not-yet-banked crafting hours across projects. Defaults to
  // all on the furthest-along project (ported from DowntimeCommitBar).
  const [projectAllocations, setProjectAllocations] = useState({});
  const projectSig = projects.map((p) => `${p.id}:${p.hours}:${p.status || ''}`).join(',');
  useEffect(() => {
    if (availableToBank === 0 || projects.length === 0) {
      setProjectAllocations({});
      return;
    }
    const furthest = projects.reduce((a, b) => (a.hours >= b.hours ? a : b));
    const alloc = Object.fromEntries(projects.map((p) => [p.id, 0]));
    alloc[furthest.id] = availableToBank;
    setProjectAllocations(alloc);
    // projectSig is the stable signature of `projects` (a fresh array each render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableToBank, projectSig]);

  const totalAllocated = projects.reduce((s, p) => s + (projectAllocations[p.id] ?? 0), 0);
  const allocationBalanced =
    availableToBank === 0 || projects.length === 0 || totalAllocated === availableToBank;

  if (!characterModel) return null;
  const { flags, skillProficiencies } = characterModel;
  const isTrained = (skillId) => (skillProficiencies[skillId] || 0) >= 1;

  const activities = DOWNTIME_ACTIVITIES.filter((a) => {
    if (a.requiresFlag && !flags[a.requiresFlag]) return false;
    if (a.requiresAnyFlag && !a.requiresAnyFlag.some((f) => !!flags[f])) return false;
    if (a.requiresTrainedInAny && !a.requiresTrainedInAny.some(isTrained)) return false;
    return true;
  });

  // The lowest a given activity's slider may go: 0 normally, the banked floor for
  // Crafting (you can't un-bank hours already spent on projects).
  const minFor = (name) => (name === 'Crafting' ? bankedDays : 0);
  const maxFor = (name) => (plan[name] || 0) + free;

  const setDays = (name, d) => {
    setDowntime((prev) => {
      const cur = periodState(prev, startedAt);
      const others = planDays(cur.plan) - (cur.plan[name] || 0);
      const capped = Math.max(minFor(name), Math.min(d, blockDays - others));
      const nextPlan = { ...cur.plan };
      const nextPaired = { ...cur.paired };
      if (capped <= 0) {
        delete nextPlan[name];
        delete nextPaired[name]; // dropping an activity drops any pairing on it
      } else {
        nextPlan[name] = capped;
      }
      // Editing always reopens a locked plan.
      return stampPeriod(prev, startedAt, { plan: nextPlan, paired: nextPaired, status: 'planning' });
    });
  };

  // Follow-the-Expert pairing: links this activity to the resident expert. Stored
  // as paired[activity] = expertCharId (period-scoped) — drives the ✦ thread on
  // the ledger and, for Crafting, the +2 circumstance on the Craft check.
  const togglePair = (name, expertId) => {
    setDowntime((prev) => {
      const cur = periodState(prev, startedAt);
      const nextPaired = { ...cur.paired };
      if (nextPaired[name]) delete nextPaired[name];
      else nextPaired[name] = expertId;
      return stampPeriod(prev, startedAt, { paired: nextPaired, status: 'planning' });
    });
  };

  const toggleLock = () => {
    if (locked) {
      setDowntime((prev) => stampPeriod(prev, startedAt, { status: 'planning' }));
      return;
    }
    // Lock in: bank the newly-allocated crafting hours into their projects and
    // record them in craftApplied so a later re-lock only banks further deltas.
    if (availableToBank > 0 && projects.length > 0) {
      setCraftProjects((prev) => ({
        projects: (prev?.projects || []).map((p) => {
          const add = projectAllocations[p.id] ?? 0;
          if (add <= 0) return p;
          if (p.status === 'reducing') {
            const perDay = dailyReductionCp({ itemLevel: p.level, craftingRank: p.craftRank, degree: p.craftDegree });
            const remainingCp = Math.max(0, (p.remainingCp || 0) - perDay * (add / 8));
            return { ...p, remainingCp, status: remainingCp <= 0 ? 'completed' : 'reducing' };
          }
          return { ...p, hours: p.hours + add };
        }),
      }));
    }
    setDowntime((prev) => {
      const cur = periodState(prev, startedAt);
      const nextApplied = { ...cur.craftApplied };
      for (const p of projects) {
        const add = projectAllocations[p.id] ?? 0;
        if (add > 0) nextApplied[p.id] = (nextApplied[p.id] || 0) + add;
      }
      return stampPeriod(prev, startedAt, { status: 'ready', craftApplied: nextApplied });
    });
  };

  const lockDisabled = used === 0 || !allocationBalanced;
  const firstName = (character?.name || 'Your').split(' ')[0];

  return (
    <div className="dta" style={{ '--c': themeColor }}>
      <div className="dta-head">
        <div className="dta-ttl"><span className="dta-you">{firstName}</span>&rsquo;s week</div>
        <div className="dta-budget">
          <b>{used}</b> / {blockDays} planned · {free} free
        </div>
      </div>

      <div className="dta-meter">
        {Array.from({ length: blockDays }, (_, i) => {
          let cum = 0;
          let hue = null;
          for (const a of DOWNTIME_ACTIVITIES) {
            const d = plan[a.name] || 0;
            if (i < cum + d) { hue = a.hue; break; }
            cum += d;
          }
          return (
            <div
              key={i}
              className={`dta-pip${hue ? ' full' : ''}`}
              style={hue ? { background: hue, color: hue } : undefined}
            />
          );
        })}
      </div>

      <div className="dta-list">
        {activities.map((a) => {
          const days = plan[a.name] || 0;
          const max = maxFor(a.name);
          const min = minFor(a.name);
          const accumulate = a.type === 'accumulate';
          const benchmark = Number(benchDays[a.name]) || 0;
          const met = accumulate && benchmark > 0 && days >= benchmark;
          const filln = max > min ? (days - min) / (max - min) : 0;
          const expert = accumulate && days > 0 ? downtimeExpertFor(a.name, party, charId) : null;
          const isPaired = !!paired[a.name];
          return (
            <div className="dta-act" key={a.name}>
              <div className="dta-act-top">
                <span className="dta-sw" style={{ background: a.hue, color: a.hue }} />
                <div className="dta-act-id">
                  <div className="dta-act-name">{a.name}</div>
                  <div className="dta-act-tag">{accumulate ? 'Banks hours' : 'One roll per day'}</div>
                </div>
                <div className="dta-act-result">
                  <div className={`dta-rv${days === 0 ? ' zero' : ''}`}>
                    {days || '—'}
                    <span className="dta-rv-unit">{days ? (days === 1 ? ' day' : ' days') : ''}</span>
                  </div>
                  {accumulate && days > 0 && (
                    <div className={`dta-rl${met ? ' met' : ''}`}>
                      {met ? '✓ ' : ''}{days * 8}h
                      {benchmark > 0 ? ` · ${days}/${benchmark}d` : ''}
                    </div>
                  )}
                </div>
              </div>

              <div className="dta-slider">
                <button
                  className="dta-stepper"
                  onClick={() => setDays(a.name, days - 1)}
                  disabled={days <= min}
                  aria-label={`Less ${a.name}`}
                >
                  −
                </button>
                <div className="dta-range" style={{ '--ac': a.hue, '--filln': filln }}>
                  <div className="dta-rng-track" />
                  <div className="dta-rng-fill" />
                  <input
                    type="range"
                    className="dta-rng-native"
                    min={min}
                    max={max}
                    step={1}
                    value={days}
                    onChange={(e) => setDays(a.name, parseInt(e.target.value, 10))}
                    aria-label={`${a.name} days`}
                  />
                  <div className="dta-rng-thumb" />
                </div>
                <button
                  className="dta-stepper"
                  onClick={() => setDays(a.name, days + 1)}
                  disabled={days >= max}
                  aria-label={`More ${a.name}`}
                >
                  +
                </button>
              </div>

              {expert && (
                <button
                  className={`dta-pair${isPaired ? ' on' : ''}`}
                  onClick={() => togglePair(a.name, expert.char.id)}
                >
                  <span className="dta-pair-star">✦</span>
                  <div className="dta-pair-txt">
                    <div className="dta-pair-1">
                      {a.name === 'Crafting' ? 'Assist' : 'Study under'}{' '}
                      <b>{firstNameOf(expert.char.name)}</b>{a.name === 'Research' ? "’s research" : ''}
                    </div>
                    <div className="dta-pair-2">
                      {isPaired
                        ? (a.name === 'Crafting'
                          ? `Following the expert — ✦ +2 circumstance to your Craft check`
                          : `Following the expert — ✦ bonus while ${firstNameOf(expert.char.name)} succeeds`)
                        : `${firstNameOf(expert.char.name)} is the party's ${a.name} expert this week`}
                    </div>
                  </div>
                  <span className="dta-pair-check">{isPaired ? '✓' : ''}</span>
                </button>
              )}

              {a.name === 'Crafting' && availableToBank > 0 && projects.length > 0 && (
                <div className="dta-craft-alloc">
                  <span className="dta-craft-label">
                    Bank {availableToBank}h across projects
                  </span>
                  {projects.map((p) => (
                    <div key={p.id} className="dta-craft-row">
                      <div className="dta-craft-info">
                        <span className="dta-craft-name">{p.name}</span>
                        <span className="dta-craft-progress">
                          {p.status === 'reducing'
                            ? `${cpToGp(p.remainingCp || 0)} gp left`
                            : `${p.hours}h / ${p.threshold}h`}
                        </span>
                      </div>
                      <input
                        type="number"
                        className="dta-craft-input"
                        min={0}
                        max={availableToBank}
                        step={8}
                        value={projectAllocations[p.id] ?? 0}
                        onChange={(e) => setProjectAllocations((prev) => ({
                          ...prev,
                          [p.id]: Math.max(0, Math.min(availableToBank, parseInt(e.target.value, 10) || 0)),
                        }))}
                        aria-label={`Hours for ${p.name}`}
                      />
                    </div>
                  ))}
                  <span className="dta-craft-total" data-valid={allocationBalanced}>
                    {totalAllocated} / {availableToBank}h allocated
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="dta-foot">
        <button
          className={`dta-lock${locked ? ' locked' : ''}`}
          onClick={toggleLock}
          disabled={lockDisabled}
        >
          <span className="dta-seal">{locked ? '✓' : '✦'}</span>
          {locked ? 'Plan locked — tap to edit' : `Lock in ${firstName}'s plan`}
        </button>
        {used === 0 && (
          <div className="dta-note">Allocate at least one day to lock in.</div>
        )}
        {!locked && !allocationBalanced && (
          <div className="dta-note">Distribute all {availableToBank}h of crafting before locking in.</div>
        )}
        {locked && (
          <div className="dta-note">Your schedule is sealed. The party can see it on the ledger.</div>
        )}
        {!locked && used > 0 && free > 0 && allocationBalanced && (
          <div className="dta-note">
            {free} day{free === 1 ? '' : 's'} still unspent — leave them free or fill them in.
          </div>
        )}
      </div>
    </div>
  );
};

export default DowntimeAllocator;
