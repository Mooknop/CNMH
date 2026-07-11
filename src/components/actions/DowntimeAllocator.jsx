import React, { useState, useEffect } from 'react';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState } from '../../hooks/useSyncedState';
import { usePartyDowntime } from '../../hooks/usePartyDowntime';
import { DOWNTIME_ACTIVITIES } from '../../data/downtimeActivities';
import { periodState, stampPeriod, planDays } from '../../utils/downtimeUtils';
import { downtimeExpertFor } from '../../utils/downtimeExperts';
import { dailyReductionCp } from '../../utils/craftingOutcome';
import { cpToGp } from '../../utils/earnIncome';
import {
  availableToBankHours,
  bankedFloorDays,
  defaultAllocations,
  allocationsBalanced,
  recordApplied,
} from '../../utils/downtimeBanking';
import { availableTrainingVendors, trackLabel } from '../../data/trainingVendors';
import { useLocationSupport } from '../../hooks/useLocationSupport';
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

// One delta-bank of an activity's planned hours across parallel targets
// (crafting projects / training tracks — downtimeBanking.js has the model).
// Local allocation state defaults to everything-on-the-furthest-along target
// whenever the un-banked pool or the target set changes.
const useHourBank = (days, applied, targets) => {
  const available = availableToBankHours(days, applied);
  const [allocations, setAllocations] = useState({});
  const sig = targets.map((t) => `${t.id}:${t.hours}:${t.status || ''}`).join(',');
  useEffect(() => {
    setAllocations(defaultAllocations(targets, available));
    // sig is the stable signature of `targets` (a fresh array each render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, sig]);
  const setAllocation = (id, hours) => setAllocations((prev) => ({
    ...prev,
    [id]: Math.max(0, Math.min(available, hours)),
  }));
  return {
    available,
    allocations,
    setAllocation,
    floorDays: bankedFloorDays(applied),
    total: targets.reduce((s, t) => s + (allocations[t.id] ?? 0), 0),
    balanced: allocationsBalanced(targets, allocations, available),
  };
};

// The per-target hour-split editor under an activity's slider (one instance
// per hour-banked activity; the dta-craft-* styles are shared).
const BankAllocation = ({ bank, targets, noun, labelFor, progressFor }) => (
  <div className="dta-craft-alloc">
    <span className="dta-craft-label">
      Bank {bank.available}h across {noun}
    </span>
    {targets.map((t) => (
      <div key={t.id} className="dta-craft-row">
        <div className="dta-craft-info">
          <span className="dta-craft-name">{labelFor(t)}</span>
          <span className="dta-craft-progress">{progressFor(t)}</span>
        </div>
        <input
          type="number"
          className="dta-craft-input"
          min={0}
          max={bank.available}
          step={8}
          value={bank.allocations[t.id] ?? 0}
          onChange={(e) => bank.setAllocation(t.id, parseInt(e.target.value, 10) || 0)}
          aria-label={`Hours for ${labelFor(t)}`}
        />
      </div>
    ))}
    <span className="dta-craft-total" data-valid={bank.balanced}>
      {bank.total} / {bank.available}h allocated
    </span>
  </div>
);

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
  const [training, setTraining] = useSyncedState(syncKey(APP.TRAINING, charId), null);
  const [bench] = useSyncedState(globalKey(APP.DOWNTIMEBENCH), null);
  const { supported } = useLocationSupport();

  const startedAt = block?.startedAt;
  const { plan, status, craftApplied, trainApplied, paired } = periodState(downtime, startedAt);
  const { party } = usePartyDowntime(startedAt, charId);
  const blockDays = block?.days ?? 0;
  const used = planDays(plan);
  const free = Math.max(0, blockDays - used);
  const locked = status === 'ready';

  // GM-set Retrain/Research benchmarks (days); Crafting/Training track their
  // own projects.
  const benchDays = bench?.[charId] || {};

  // The two hour-banks: applied maps are keyed by target id and irreversible
  // within the period (a locked day can't be un-banked), so each activity's
  // slider can't drop below its banked floor.
  const projects = (craftProjects?.projects || []).filter(isAllocatable);
  const craftBank = useHourBank(plan.Crafting || 0, craftApplied, projects);
  const tracks = (training?.tracks || []).filter(
    (t) => (t.status || 'in-progress') === 'in-progress',
  );
  const trainBank = useHourBank(plan.Training || 0, trainApplied, tracks);

  if (!characterModel) return null;
  const { flags, skillProficiencies } = characterModel;
  const isTrained = (skillId) => (skillProficiencies[skillId] || 0) >= 1;

  // Training only surfaces when this PC has something to train: an in-progress
  // track, an eligible offering at a supported vendor, or days already planned.
  const trainingAvailable =
    tracks.length > 0 ||
    (plan.Training || 0) > 0 ||
    availableTrainingVendors(character, supported, training?.tracks || []).length > 0;

  const activities = DOWNTIME_ACTIVITIES.filter((a) => {
    if (a.requiresFlag && !flags[a.requiresFlag]) return false;
    if (a.requiresAnyFlag && !a.requiresAnyFlag.some((f) => !!flags[f])) return false;
    if (a.requiresTrainedInAny && !a.requiresTrainedInAny.some(isTrained)) return false;
    if (a.name === 'Training' && !trainingAvailable) return false;
    return true;
  });

  // The lowest a given activity's slider may go: 0 normally, the banked floor
  // for Crafting/Training (you can't un-bank hours already spent on targets).
  const minFor = (name) => {
    if (name === 'Crafting') return craftBank.floorDays;
    if (name === 'Training') return trainBank.floorDays;
    return 0;
  };
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
    // Lock in: bank the newly-allocated hours into their targets and record
    // them in craftApplied/trainApplied so a later re-lock only banks further
    // deltas.
    if (craftBank.available > 0 && projects.length > 0) {
      setCraftProjects((prev) => ({
        projects: (prev?.projects || []).map((p) => {
          const add = craftBank.allocations[p.id] ?? 0;
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
    if (trainBank.available > 0 && tracks.length > 0) {
      setTraining((prev) => ({
        tracks: (prev?.tracks || []).map((t) => {
          const add = trainBank.allocations[t.id] ?? 0;
          return add > 0 ? { ...t, hours: (t.hours || 0) + add } : t;
        }),
      }));
    }
    setDowntime((prev) => {
      const cur = periodState(prev, startedAt);
      return stampPeriod(prev, startedAt, {
        status: 'ready',
        craftApplied: recordApplied(cur.craftApplied, projects, craftBank.allocations),
        trainApplied: recordApplied(cur.trainApplied, tracks, trainBank.allocations),
      });
    });
  };

  const lockDisabled = used === 0 || !craftBank.balanced || !trainBank.balanced;
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
              style={hue ? { '--ac': hue } : undefined}
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
                <span className="dta-sw" style={{ '--ac': a.hue }} />
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

              {a.name === 'Crafting' && craftBank.available > 0 && projects.length > 0 && (
                <BankAllocation
                  bank={craftBank}
                  targets={projects}
                  noun="projects"
                  labelFor={(p) => p.name}
                  progressFor={(p) => (p.status === 'reducing'
                    ? `${cpToGp(p.remainingCp || 0)} gp left`
                    : `${p.hours}h / ${p.threshold}h`)}
                />
              )}

              {a.name === 'Training' && trainBank.available > 0 && tracks.length > 0 && (
                <BankAllocation
                  bank={trainBank}
                  targets={tracks}
                  noun="tracks"
                  labelFor={trackLabel}
                  progressFor={(t) => `${t.hours || 0}h / ${t.benchmarkHours}h`}
                />
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
        {!locked && !craftBank.balanced && (
          <div className="dta-note">Distribute all {craftBank.available}h of crafting before locking in.</div>
        )}
        {!locked && !trainBank.balanced && (
          <div className="dta-note">Distribute all {trainBank.available}h of training before locking in.</div>
        )}
        {locked && (
          <div className="dta-note">Your schedule is sealed. The party can see it on the ledger.</div>
        )}
        {!locked && used > 0 && free > 0 && craftBank.balanced && trainBank.balanced && (
          <div className="dta-note">
            {free} day{free === 1 ? '' : 's'} still unspent — leave them free or fill them in.
          </div>
        )}
      </div>
    </div>
  );
};

export default DowntimeAllocator;
