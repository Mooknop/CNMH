import React, { useState } from 'react';
import { useContent } from '../../../contexts/ContentContext';
import { useGameDate, GOLARION_MONTHS } from '../../../contexts/GameDateContext';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { useCharacter } from '../../../hooks/useCharacter';
import { usePartyDowntime } from '../../../hooks/usePartyDowntime';
import { useDowntimeAutoAdvance } from '../../../hooks/useDowntimeAutoAdvance';
import { taskDc } from '../../../utils/earnIncome';
import { getCharacterColor } from '../../../utils/CharacterUtils';
import { APP, globalKey } from '../../../sync/keys';
import ConfirmDialog from '../../shared/ConfirmDialog';
import './DowntimeViews.css';

// Downtime dock — Period & clock view (#1856, redesign wave 2). Re-houses
// DowntimeControl's period setter as the dock's own surface: days granted
// (+/− and Start/Update), the party's lock-in list, and the per-PC task-level
// / benchmark override table. DowntimeControl itself is UNCHANGED — this is a
// second surface over the exact same synced keys
// (cnmh_downtimeblock_global / cnmh_earnincometask_global /
// cnmh_downtimebench_global), so a write from either surface is visible on
// both instantly.
//
// START VS UPDATE (#1624, preserved exactly): starting a block stamps
// `{ days, active: true, startedAt: gameDate }` — that stamp is the period's
// identity every PC's `cnmh_downtime_<id>` plan is scoped to. Updating an
// ACTIVE block resizes `days` in place and must NEVER re-stamp `startedAt`,
// or every PC's locked plan reads as a prior (i.e. empty) period. See
// DowntimeControl.jsx's own header comment for the full rationale.
//
// AUTO-ADVANCE. This view also mounts `useDowntimeAutoAdvance()` — the same
// effect DowntimeControl mounts — so the block still closes itself out
// whether the GM is watching this view or the console. See that hook's file
// header for the double-fire guard between the two mounted instances.
//
// PER-PC STATUS. The "Locked in" list reuses `usePartyDowntime` (the same
// period-scoped reader `useDowntimePartyReady`'s tally is built from) instead
// of re-deriving ready/planning by hand, so this view can never disagree with
// the header's "N / M locked in" readout or the Ledger view's own rows.
//
// DC IS DERIVED, NEVER A FORMULA (#231): utils/earnIncome's taskDc reads the
// Earn Income table (src/data/earnIncomeTable.js), which is not linear.

const formatStartedAt = (d) => {
  if (!d || typeof d.day !== 'number' || typeof d.month !== 'number') return null;
  const monthName = GOLARION_MONTHS[d.month]?.name || '';
  return `${d.day} ${monthName}${d.year ? `, ${d.year} AR` : ''}`;
};

// One row of the per-PC overrides table. A component of its own because it
// needs useCharacter (for the class label), and hooks can't be called from
// inside a plain .map() callback. Rendered as a Fragment so its five cells
// land as direct children of the parent CSS grid (a "grid as table" layout —
// see DowntimeViews.css's .dock-dt-override-grid).
const OverrideRow = ({ character, color, taskMap, benchMap, onTaskLevel, onBenchmark }) => {
  const model = useCharacter(character);
  const level = taskMap?.[character.id];
  const bench = benchMap?.[character.id] || {};
  // Footnote ruling: a blank task level uses the PC's chosen location's level,
  // freelance defaulting to 4 — so the DC readout assumes 4 when unset rather
  // than showing nothing.
  const dc = taskDc(level != null ? level : 4);

  return (
    <>
      <div className="dock-dt-override-char">
        <span
          className="dock-dt-override-dot"
          style={{ '--dot-color': color }}
          aria-hidden="true"
        />
        <span className="dock-dt-override-id">
          <span className="dock-dt-override-name">{character.name}</span>
          <span className="dock-dt-override-class">{model?.characterClass || ''}</span>
        </span>
      </div>
      <input
        type="number"
        className="dock-dt-override-field"
        min="0"
        max="20"
        placeholder="—"
        value={level ?? ''}
        onChange={(e) => onTaskLevel(character.id, e.target.value)}
        aria-label={`${character.name} task level override`}
      />
      <span className="dock-dt-override-dc">DC {dc}</span>
      <input
        type="number"
        className="dock-dt-override-field dock-dt-override-field--bench"
        min="1"
        max="99"
        placeholder="—"
        value={bench.Retrain ?? ''}
        onChange={(e) => onBenchmark(character.id, 'Retrain', e.target.value)}
        aria-label={`${character.name} Retrain benchmark days`}
      />
      <input
        type="number"
        className="dock-dt-override-field dock-dt-override-field--bench"
        min="1"
        max="99"
        placeholder="—"
        value={bench.Research ?? ''}
        onChange={(e) => onBenchmark(character.id, 'Research', e.target.value)}
        aria-label={`${character.name} Research benchmark days`}
      />
    </>
  );
};

const PeriodView = () => {
  const { characters } = useContent();
  const { gameDate } = useGameDate();
  const [block, setBlock] = useSyncedState(globalKey(APP.DOWNTIMEBLOCK), null);
  const [taskMap, setTaskMap] = useSyncedState(globalKey(APP.EARNINCOMETASK), null);
  const [benchMap, setBenchMap] = useSyncedState(globalKey(APP.DOWNTIMEBENCH), null);
  const [draftDays, setDraftDays] = useState(() => Math.max(1, block?.days || 1));
  const [confirmClose, setConfirmClose] = useState(false);

  // Same effect DowntimeControl mounts — see useDowntimeAutoAdvance's header
  // for why mounting it from two surfaces is safe.
  useDowntimeAutoAdvance();

  const roster = Array.isArray(characters) ? characters : [];
  const blockActive = block?.active ?? false;
  const blockDays = block?.days ?? 0;
  const blockStartedAt = block?.startedAt ?? null;

  const { party } = usePartyDowntime(blockStartedAt, undefined, { budget: blockDays });

  const startedAtLabel = formatStartedAt(blockStartedAt);
  const summary = blockActive
    ? `Block open${startedAtLabel ? ` · started ${startedAtLabel}` : ''}`
    : 'No open block';

  // Two distinct operations behind one button (#1624) — see the file header.
  const commitPeriod = () => {
    const n = Math.max(1, Math.floor(draftDays) || 1);
    if (blockActive) setBlock((prev) => ({ ...(prev || {}), days: n, active: true }));
    else setBlock({ days: n, active: true, startedAt: gameDate });
  };

  const closeBlock = () => {
    if (block) setBlock({ ...block, active: false });
    setConfirmClose(false);
  };

  // Mirrors DowntimeControl's setTaskLevel exactly — same key, same clamp.
  const setTaskLevel = (charId, raw) => {
    setTaskMap((prev) => {
      const next = { ...(prev || {}) };
      if (raw === '') delete next[charId];
      else next[charId] = Math.max(0, Math.min(20, parseInt(raw, 10) || 0));
      return next;
    });
  };

  // Mirrors DowntimeControl's setBenchmark exactly — same key, same clamp.
  const setBenchmark = (charId, activity, raw) => {
    setBenchMap((prev) => {
      const next = { ...(prev || {}) };
      const forChar = { ...(next[charId] || {}) };
      if (raw === '') delete forChar[activity];
      else forChar[activity] = Math.max(1, Math.min(99, parseInt(raw, 10) || 0));
      if (Object.keys(forChar).length === 0) delete next[charId];
      else next[charId] = forChar;
      return next;
    });
  };

  return (
    <section className="dock-dt-view" aria-label="Period">
      <header className="dock-dt-head">
        <div className="dock-dt-title">
          <span className="dock-dt-kicker">Downtime</span>
          <h2 className="dock-dt-heading">Period</h2>
        </div>
        <span className="dock-dt-count">{summary}</span>
      </header>

      <div className="dock-dt-period-body">
        <div className="dock-dt-period-left">
          <div className="dock-dt-period-card">
            <span className="dock-dt-card-label">Days granted</span>
            <div className="dock-dt-period-days-row">
              <span className="dock-dt-period-days-number">{draftDays}</span>
              <div className="dock-dt-period-days-actions">
                <button
                  type="button"
                  className="dock-dt-step"
                  aria-label="Decrease days granted"
                  disabled={draftDays <= 1}
                  onClick={() => setDraftDays((d) => Math.max(1, d - 1))}
                >
                  −
                </button>
                <button
                  type="button"
                  className="dock-dt-step"
                  aria-label="Increase days granted"
                  onClick={() => setDraftDays((d) => d + 1)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="dock-dt-btn dock-dt-btn--primary"
                  onClick={commitPeriod}
                >
                  {blockActive ? 'Update' : 'Start'}
                </button>
              </div>
            </div>

            <p className="dock-dt-period-hint">
              Update resizes this period in place — plans that no longer fit are trimmed
              and reopened. Close the block first to start a fresh period.
            </p>

            <button
              type="button"
              className="dock-dt-period-close"
              disabled={!blockActive}
              onClick={() => setConfirmClose(true)}
            >
              Close block without advancing
            </button>
          </div>

          <div className="dock-dt-period-card">
            <span className="dock-dt-card-label">Locked in</span>
            {party.length === 0 ? (
              <p className="dock-dt-closed-note">No characters in the roster yet.</p>
            ) : (
              <ul className="dock-dt-lockedin-list">
                {party.map((p) => (
                  <li key={p.char.id} className="dock-dt-lockedin-row">
                    <span
                      className="dock-dt-lockedin-dot"
                      style={{ '--dot-color': p.color }}
                      aria-hidden="true"
                    />
                    <span className="dock-dt-lockedin-name">{p.char.name}</span>
                    <span
                      className={`dock-dt-lockedin-status dock-dt-lockedin-status--${p.status}`}
                    >
                      {p.status === 'ready' ? 'Locked in' : 'Planning'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="dock-dt-period-right">
          <span className="dock-dt-card-label">Per-PC overrides</span>
          <div className="dock-dt-override-grid" role="table" aria-label="Per-PC overrides">
            <span className="dock-dt-override-headcell" role="columnheader">Character</span>
            <span className="dock-dt-override-headcell" role="columnheader">Task lvl</span>
            <span className="dock-dt-override-headcell" role="columnheader">DC</span>
            <span className="dock-dt-override-headcell" role="columnheader">Retrain</span>
            <span className="dock-dt-override-headcell" role="columnheader">Research</span>
            {roster.map((c, i) => (
              <OverrideRow
                key={c.id}
                character={c}
                color={getCharacterColor(i)}
                taskMap={taskMap}
                benchMap={benchMap}
                onTaskLevel={setTaskLevel}
                onBenchmark={setBenchmark}
              />
            ))}
          </div>
          <p className="dock-dt-period-footnote">
            Task level caps that PC&rsquo;s Earn Income roll; blank uses their chosen
            location&rsquo;s level (freelance is 4). Benchmarks are in 8-hour days.
          </p>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmClose}
        title="Close block without advancing?"
        message="The block closes immediately and the clock does not move. Any PC still mid-plan keeps their unfinished allocation, but it will need to be reopened under a new period."
        confirmLabel="Close block"
        danger
        onConfirm={closeBlock}
        onCancel={() => setConfirmClose(false)}
      />
    </section>
  );
};

export default PeriodView;
