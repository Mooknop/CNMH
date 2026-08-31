import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useDevicePref } from '../../hooks/useDevicePref';
import { useDowntimePartyReady } from '../../hooks/useDowntimePartyReady';
import { usePartyActivity } from '../../hooks/usePartyActivity';
import { periodDayNumber } from '../../utils/downtimeUtils';
import { topicProgress } from '../../utils/research';
import { APP, globalKey } from '../../sync/keys';
import ResearchView from './downtime/ResearchView';
import ReputationView from './downtime/ReputationView';
import PeriodView from './downtime/PeriodView';
import LedgerView from './downtime/LedgerView';
import TrainingView from './downtime/TrainingView';
import InventoryView from './downtime/InventoryView';
import ResourcesView from './downtime/ResourcesView';
import './DockDowntimePane.css';

// GM Command Dock — Downtime pane (#1853, redesign wave 1). This file is now
// the SHELL only: a fixed, no-scroll, tablet-landscape (1366×1024) frame made
// of three parts — the pane's own 66px header (which REPLACES the dock's shared
// top bar in downtime mode), a 148px view rail, and whichever of the seven
// views the rail has selected. Each view lives in `./downtime/`.
//
// THE WHOLE POINT IS THAT NOTHING SCROLLS. The chain is
//   .dock-dt            100% of the dock stage, overflow hidden, flex column
//   .dock-dt-header     flex: none, 66px
//   .dock-dt-body       grid 148px / minmax(0, 1fr), overflow hidden
//   .dock-dt-content    flex column, overflow hidden, min-height: 0
//   .dock-dt-view       flex: 1, min-height: 0, grid auto / minmax(0, 1fr)
// Every `min-height: 0` in that chain is load-bearing — drop any one of them
// and the content column grows to its content instead of to the screen, which
// is exactly the overflow this redesign exists to kill. There is deliberately
// NO small-screen fallback and no media-query escape hatch: this fixed layout
// is the only downtime dock UI (decision recorded on #1853). A view whose
// content genuinely can't fit paginates or sub-divides; it does not scroll.
//
// TEMPORARY EXCEPTION: ResearchView and ReputationView are the two views that
// carry live logic today, and they were moved across in wave 1 with their
// markup unchanged — they still scroll internally. Their true no-scroll
// re-layouts are #1854 / #1855. The shell chain above is already correct, so
// those slices drop in by replacing each view's body, touching nothing here.
//
// VIEW REGISTRY CONTRACT (for the wave-2 slices): a view is a zero-prop
// component that renders its OWN root `<section className="dock-dt-view">`
// with an aria-label, reading whatever hooks it needs directly. It gets no
// props because every value it wants is server state the shell would only be
// passing through (and the header/rail derive their own counts the same way).
// Add one by writing the file and adding a `{ id, label, Component, meta }`
// entry to VIEWS below — `meta` is the live rail sub-label, computed from the
// counts assembled in the component body.
//
// DERIVED, NEVER STORED. Day-of-block, ready tallies, open/locked topic counts
// and track counts are all recomputed each render from the synced block, the
// clock and the content collections. The ONLY local state here is the selected
// view, and it is a DEVICE preference (useDevicePref), not a synced key: which
// pane this GM's tablet is looking at is not campaign state, and syncing it
// would need a SANDBOX_WRITABLE_TYPES entry for zero cross-client value.

const DEFAULT_VIEW = 'research';

const DockDowntimePane = () => {
  const { researchTopics, reputation } = useContent();
  const { advanceDays, advanceHours, formatGameDate, formatClockTime, gameDate } = useGameDate();
  const [block] = useSyncedState(globalKey(APP.DOWNTIMEBLOCK), null);
  // Read-only here — the GM edits campaign meta in PlayModeControl (console).
  const [campaign] = useSyncedState(globalKey(APP.CAMPAIGN), { location: '', locationLoreId: '' });
  const [progress] = useSyncedState(globalKey(APP.RESEARCH), {});
  const [storedView, setStoredView] = useDevicePref('dockDowntimeView', DEFAULT_VIEW);

  // Primitive deps, mirroring DowntimeControl — the block object is a fresh
  // reference on every synced read.
  const blockActive = block?.active ?? false;
  const blockDays = block?.days ?? 0;
  const blockStartedAt = block?.startedAt ?? null;

  const { readyCount, total } = useDowntimePartyReady(blockActive ? blockDays : 0, blockStartedAt);
  const { party } = usePartyActivity('training');

  const topics = useMemo(
    () => (Array.isArray(researchTopics) ? researchTopics : []),
    [researchTopics]
  );
  const openTopics = topics.filter((t) => topicProgress(progress, t.id).available).length;
  const lockedTopics = topics.length - openTopics;

  const factionCount = Array.isArray(reputation?.Factions) ? reputation.Factions.length : 0;

  const trackCount = party.reduce(
    (n, p) =>
      n + (p.state?.tracks || []).filter((t) => (t.status || 'in-progress') === 'in-progress').length,
    0
  );

  const currentDay = periodDayNumber(blockStartedAt, gameDate, blockDays);
  const periodLabel = blockActive ? `Day ${currentDay} / ${blockDays}` : 'No block';
  const readyLabel = `${readyCount} / ${total} locked in`;

  const VIEWS = [
    { id: 'research', label: 'Research', Component: ResearchView, meta: `${openTopics} open · ${lockedTopics} locked` },
    { id: 'reputation', label: 'Reputation', Component: ReputationView, meta: `${factionCount} faction${factionCount === 1 ? '' : 's'}` },
    { id: 'period', label: 'Period', Component: PeriodView, meta: periodLabel },
    { id: 'ledger', label: 'Ledger', Component: LedgerView, meta: readyLabel },
    { id: 'training', label: 'Training', Component: TrainingView, meta: `${trackCount} track${trackCount === 1 ? '' : 's'}` },
    { id: 'inventory', label: 'Inventory', Component: InventoryView, meta: 'Hands & bags' },
    { id: 'resources', label: 'Resources', Component: ResourcesView, meta: 'HP · focus · slots' },
  ];

  // A stored id from a future/removed view must never blank the pane.
  const active = VIEWS.find((v) => v.id === storedView) || VIEWS[0];
  const ActiveView = active.Component;

  // The five advance chips are the ONE deliberate exception to the 44px
  // tap-target floor (36px) — they are header chrome in a 66px row. Negative
  // deltas are supported by GameDateContext's carry (DowntimeControl already
  // relies on it).
  const ADVANCE = [
    { key: '-1d', label: '−1 day', aria: 'Back one day', run: () => advanceDays(-1) },
    { key: '-1h', label: '−1 hr', aria: 'Back one hour', run: () => advanceHours(-1) },
    { key: '+1h', label: '+1 hr', aria: 'Forward one hour', run: () => advanceHours(1) },
    { key: '+8h', label: '+8 hr', aria: 'Forward eight hours', run: () => advanceHours(8) },
    { key: '+1d', label: '+1 day', aria: 'Forward one day', run: () => advanceDays(1) },
  ];

  return (
    <section className="dock-dt" aria-label="Downtime">
      <header className="dock-dt-header">
        <div className="dock-dt-brand">
          <span className="dock-dt-kicker">Downtime</span>
          <h1 className="dock-dt-brand-title">Command Dock</h1>
        </div>

        <div className="dock-dt-header-rule" aria-hidden="true" />

        <div className="dock-dt-period">
          {blockActive ? (
            <>
              <span className="dock-dt-period-day">{periodLabel}</span>
              <span className="dock-dt-period-ready">{readyLabel}</span>
            </>
          ) : (
            // The Period view is where a block gets started — the header just
            // says so quietly instead of pretending there's a day count.
            <span className="dock-dt-period-none">No open block</span>
          )}
        </div>

        <div className="dock-dt-header-spacer" />

        <div className="dock-dt-advance">
          <span className="dock-dt-advance-label">Advance</span>
          {ADVANCE.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="dock-dt-chip"
              aria-label={chip.aria}
              onClick={chip.run}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="dock-dt-header-rule" aria-hidden="true" />

        {/* The full calendar date rides the title so the 0.68rem line can stay
            the single most useful string (where the party is). */}
        <div className="dock-dt-clock" title={formatGameDate()}>
          <span className="dock-dt-clock-time">{formatClockTime()}</span>
          <span className="dock-dt-clock-loc">{campaign?.location || formatGameDate()}</span>
        </div>

        <Link to="/gm" className="dock-dt-close" aria-label="Close downtime dock">
          ×
        </Link>
      </header>

      <div className="dock-dt-body">
        <nav className="dock-dt-rail" aria-label="Downtime views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`dock-dt-rail-btn${v.id === active.id ? ' dock-dt-rail-btn--on' : ''}`}
              aria-pressed={v.id === active.id}
              onClick={() => setStoredView(v.id)}
            >
              <span className="dock-dt-rail-label">{v.label}</span>
              <span className="dock-dt-rail-meta">{v.meta}</span>
            </button>
          ))}
        </nav>

        <div className="dock-dt-content">
          {/* Keyed on the view id so the incoming pane mounts fresh (and runs
              its 120ms fade-in) instead of reusing the outgoing one's tree. */}
          <ActiveView key={active.id} />
        </div>
      </div>
    </section>
  );
};

export default DockDowntimePane;
