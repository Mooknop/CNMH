import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { groupEventsByChapter, eventMatches, eventStatus, isEventHidden, isEventDue, STATUS_META } from '../../utils/events';
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

  const groups = useMemo(() => groupEventsByChapter(events), [events]);
  const hiddenCount = useMemo(() => (events || []).filter(isEventHidden).length, [events]);

  // Chapters keep only events that pass the search and the hidden filter; a
  // chapter with nothing left drops out entirely.
  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          events: g.events.filter(
            (e) => (showHidden || !isEventHidden(e)) && eventMatches(e, search),
          ),
        }))
        .filter((g) => g.events.length),
    [groups, search, showHidden],
  );

  // Default selection: the first event still visible in book order.
  const firstId = visibleGroups[0]?.events[0]?.id || null;
  const allEvents = useMemo(() => groups.flatMap((g) => g.events), [groups]);
  const effectiveId = selectedId || firstId;
  const selected = allEvents.find((e) => e.id === effectiveId) || null;

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
        {visibleGroups.map((g) => (
          <div key={g.chapter} className="gm-rooms-site">
            <div className="gm-rooms-site-name">{g.chapter}</div>
            {g.events.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`gm-rooms-link ${effectiveId === e.id ? 'active' : ''}${isEventHidden(e) ? ' is-hidden' : ''}`}
                onClick={() => setSelectedId(e.id)}
              >
                <span className={`gm-event-dot ${STATUS_META[eventStatus(e)].className}`} aria-hidden="true" />
                <span className="gm-rooms-name">{e.name}</span>
                {eventStatus(e) !== 'resolved' && eventStatus(e) !== 'skipped' && isEventDue(e, gameDate) && (
                  <span className="gm-events-due" title={`Scheduled for ${e.scheduledFor}`}>Due</span>
                )}
              </button>
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
