import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { groupEventsByChapter, eventMatches, eventStatus, isEventHidden, isEventDue, STATUS_META } from '../../utils/events';
import { saveDocument } from '../../utils/gmApi';
import RoomDetail from '../../components/gm/RoomDetail';
import RoomsImportButton from '../../components/gm/RoomsImportButton';
import EventTracker from '../../components/gm/EventTracker';
import './gm.css';

// A small status pill for an event, in the rail and the detail bar.
const StatusBadge = ({ status }) => {
  const meta = STATUS_META[status] || STATUS_META.upcoming;
  return <span className={`gm-event-status ${meta.className}`}>{meta.label}</span>;
};

// World → Events: the read-only chapter-event browser (#1114). Chapter rail on
// the left, event detail on the right. Events are the live `event` collection,
// imported from the same Foundry journal dump as rooms (World → Rooms) — empty
// until then. Editing tracking state (status, steps, outcome, schedule) is S3.
const GmEvents = () => {
  const { events } = useContent();
  const { gameDate } = useGameDate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  // Deep link from the dashboard Events panel: /gm/world/events?event=<id>.
  const [selectedId, setSelectedId] = useState(searchParams.get('event'));
  const [showHidden, setShowHidden] = useState(false);
  // Queued show/hide edits: eventId → desired `tracked`, holding only genuine
  // changes vs the live doc (toggling back to the live value drops the entry).
  // Nothing is written until the GM hits Save, so a bulk pass is one batch.
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const groups = useMemo(() => groupEventsByChapter(events), [events]);
  const hiddenCount = useMemo(() => (events || []).filter(isEventHidden).length, [events]);

  const draftHas = (e) => Object.prototype.hasOwnProperty.call(draft, e.id);
  // Effective tracked state = the queued value if one is pending, else the doc's.
  const effTracked = (e) => (draftHas(e) ? draft[e.id] : !isEventHidden(e));
  const pendingCount = Object.keys(draft).length;

  // Chapters keep only events that pass the search and the hidden filter; a
  // chapter with nothing left drops out. A pending edit (draftHas) always keeps
  // its row visible so it can be re-toggled before saving, even once queued hidden.
  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          events: g.events.filter(
            (e) =>
              (showHidden
                || !isEventHidden(e)
                || Object.prototype.hasOwnProperty.call(draft, e.id))
              && eventMatches(e, search),
          ),
        }))
        .filter((g) => g.events.length),
    [groups, search, showHidden, draft],
  );

  // Default selection: the first event still visible in book order.
  const firstId = visibleGroups[0]?.events[0]?.id || null;
  const allEvents = useMemo(() => groups.flatMap((g) => g.events), [groups]);
  const effectiveId = selectedId || firstId;
  const selected = allEvents.find((e) => e.id === effectiveId) || null;

  // Queue (or un-queue) a show/hide edit for one event without saving.
  const toggleTracked = (e) => {
    const live = !isEventHidden(e);
    const next = !effTracked(e);
    setDraft((d) => {
      const nd = { ...d };
      if (next === live) delete nd[e.id]; // back to the live value → no pending change
      else nd[e.id] = next;
      return nd;
    });
  };

  // Commit every queued edit as its own PUT (each archives the prior version).
  // Succeeded ids are dropped from the draft as they land, so a mid-batch
  // failure leaves only the unsaved ones queued for a retry.
  const saveDraft = async () => {
    setSaving(true);
    setSaveError(false);
    const remaining = { ...draft };
    try {
      for (const [id, tracked] of Object.entries(draft)) {
        const ev = allEvents.find((x) => x.id === id);
        if (ev) await saveDocument('event', id, { ...ev, tracked });
        delete remaining[id];
      }
    } catch {
      setSaveError(true);
    } finally {
      setDraft(remaining);
      setSaving(false);
    }
  };

  if (!events.length) {
    return (
      <div className="gm-rooms gm-rooms-empty">
        <h1>Events</h1>
        <p className="gm-help">
          No chapter events imported yet. Events come from the same Foundry
          journal dump as rooms — in Foundry, run the export macro
          (<code>scripts/exportAdventureJournals.foundryMacro.js</code>) as GM,
          then import that file here (or in World → Rooms):
        </p>
        <RoomsImportButton />
      </div>
    );
  }

  return (
    <div className="gm-rooms">
      <aside className="gm-rooms-rail" aria-label="Events by chapter">
        <details className="gm-rooms-reimport">
          <summary>Import / update from Foundry export</summary>
          <RoomsImportButton label="Choose export file…" />
        </details>
        <input
          type="search"
          className="gm-rooms-search"
          placeholder="Search events…"
          aria-label="Search events"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {hiddenCount > 0 && (
          <label className="gm-events-showhidden">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            Show hidden ({hiddenCount})
          </label>
        )}
        <p className="gm-help gm-events-track-hint">
          Tick to keep an event in the tracker; untick to hide connective pages. Toggle
          several, then Save.
        </p>
        {pendingCount > 0 && (
          <div className="gm-events-bulk-bar" role="group" aria-label="Save tracker changes">
            <span className="gm-events-bulk-count">
              {pendingCount} pending change{pendingCount === 1 ? '' : 's'}
            </span>
            <button type="button" className="btn-primary" disabled={saving} onClick={saveDraft}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={() => { setDraft({}); setSaveError(false); }}
            >
              Discard
            </button>
            {saveError && <span className="gm-warn">Some saves failed — try again.</span>}
          </div>
        )}
        {visibleGroups.map((g) => (
          <div key={g.chapter} className="gm-rooms-site">
            <div className="gm-rooms-site-name">{g.chapter}</div>
            {g.events.map((e) => (
              <div
                key={e.id}
                className={`gm-rooms-link-row${!effTracked(e) ? ' is-hidden' : ''}${draftHas(e) ? ' is-pending' : ''}`}
              >
                <button
                  type="button"
                  className={`gm-rooms-link ${effectiveId === e.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(e.id)}
                >
                  <span className={`gm-event-dot ${STATUS_META[eventStatus(e)].className}`} aria-hidden="true" />
                  <span className="gm-rooms-name">{e.name}</span>
                  {eventStatus(e) !== 'resolved' && eventStatus(e) !== 'skipped' && isEventDue(e, gameDate) && (
                    <span className="gm-events-due" title={`Scheduled for ${e.scheduledFor}`}>Due</span>
                  )}
                </button>
                <input
                  type="checkbox"
                  className="gm-events-track-check"
                  checked={effTracked(e)}
                  onChange={() => toggleTracked(e)}
                  aria-label={`Show ${e.name} in tracker`}
                  title={effTracked(e) ? 'Shown in tracker — untick to hide' : 'Hidden — tick to show'}
                />
              </div>
            ))}
          </div>
        ))}
        {!visibleGroups.length && <p className="gm-help">No events match “{search}”.</p>}
      </aside>

      <main className="gm-rooms-detail">
        {selected ? (
          <>
            <div className="gm-rooms-detail-bar">
              <span className="gm-rooms-detail-site">{selected.chapter}</span>
              <StatusBadge status={eventStatus(selected)} />
              {eventStatus(selected) !== 'resolved' && eventStatus(selected) !== 'skipped' && isEventDue(selected, gameDate) && (
                <span className="gm-events-due" title={`Scheduled for ${selected.scheduledFor}`}>Due</span>
              )}
            </div>
            <RoomDetail room={selected} showNotes={false} showTreasure={false} />
            <EventTracker key={`track-${selected.id}`} event={selected} />
          </>
        ) : (
          <p className="gm-help">Select an event.</p>
        )}
      </main>
    </div>
  );
};

export default GmEvents;
