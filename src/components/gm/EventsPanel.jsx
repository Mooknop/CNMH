import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { saveDocument } from '../../utils/gmApi';
import {
  groupEventsByChapter,
  eventStatus,
  isEventHidden,
  isEventDue,
  stepProgress,
  STATUS_META,
} from '../../utils/events';

// How many upcoming events to preview beyond what's active/due — keeps the
// dashboard panel a glance, not the full World → Events list.
const UPCOMING_LIMIT = 5;

// One row in the dashboard panel: status dot, name (links into World → Events),
// a "due" flag, step progress for active events, and a quick resolve button.
const EventRow = ({ event, due, onResolve, resolving }) => {
  const status = eventStatus(event);
  const { done, total } = stepProgress(event);
  return (
    <li className={`gm-events-row is-${status}${due ? ' is-due' : ''}`}>
      <span className={`gm-event-dot ${STATUS_META[status].className}`} aria-hidden="true" />
      <Link className="gm-events-row-name" to={`/gm/world/events?event=${encodeURIComponent(event.id)}`}>
        {event.name}
      </Link>
      {due && <span className="gm-events-due" title={`Scheduled for ${event.scheduledFor}`}>Due</span>}
      {status === 'active' && total > 0 && (
        <span className="gm-events-steps" title="Party progress">{done}/{total}</span>
      )}
      {status === 'active' && (
        <button
          type="button"
          className="gm-events-resolve"
          disabled={resolving}
          onClick={() => onResolve(event)}
        >
          {resolving ? '…' : 'Resolve'}
        </button>
      )}
    </li>
  );
};

// Dashboard Events panel (#1116, S4): the at-the-table view of the chapter-event
// tracker. Shows every active event plus the next few upcoming tracked events in
// book order, lights up any whose scheduled game date has arrived ("due" vs the
// campaign clock), surfaces active-event step progress, and offers a one-click
// active → resolved flip. Hidden (tracked:false) events never appear. Empty
// until events are imported or something is active/scheduled.
const EventsPanel = () => {
  const { events } = useContent();
  const { gameDate } = useGameDate();
  const [resolvingId, setResolvingId] = useState(null);

  // Tracked events in book order, split into active and upcoming. Due upcoming
  // events are pulled to the front of the upcoming preview so a schedule that
  // has arrived is never truncated away by the limit.
  const { active, upcoming } = useMemo(() => {
    const ordered = groupEventsByChapter(events).flatMap((g) => g.events);
    const tracked = ordered.filter((e) => !isEventHidden(e));
    const act = tracked.filter((e) => eventStatus(e) === 'active');
    const up = tracked.filter((e) => eventStatus(e) === 'upcoming');
    const due = up.filter((e) => isEventDue(e, gameDate));
    const rest = up.filter((e) => !isEventDue(e, gameDate));
    return { active: act, upcoming: [...due, ...rest].slice(0, UPCOMING_LIMIT) };
  }, [events, gameDate]);

  const resolve = async (event) => {
    setResolvingId(event.id);
    try {
      await saveDocument('event', event.id, { ...event, status: 'resolved' });
    } finally {
      setResolvingId(null);
    }
  };

  if (!events.length) return null; // nothing imported — keep the dashboard clean

  const nothing = !active.length && !upcoming.length;

  return (
    <section className="gm-dash-panel gm-events-panel" aria-label="Events">
      <header className="gm-events-panel-head">
        <h2>Events</h2>
        <Link className="gm-events-browse" to="/gm/world/events">Browse</Link>
      </header>

      {nothing ? (
        <p className="gm-help">
          Nothing active or upcoming. Open <Link to="/gm/world/events">World → Events</Link> to
          set an event active or schedule one.
        </p>
      ) : (
        <>
          {active.length > 0 && (
            <div className="gm-events-group">
              <div className="gm-events-group-label">Active</div>
              <ul className="gm-events-list">
                {active.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    due={isEventDue(e, gameDate)}
                    onResolve={resolve}
                    resolving={resolvingId === e.id}
                  />
                ))}
              </ul>
            </div>
          )}
          {upcoming.length > 0 && (
            <div className="gm-events-group">
              <div className="gm-events-group-label">Upcoming</div>
              <ul className="gm-events-list">
                {upcoming.map((e) => (
                  <EventRow key={e.id} event={e} due={isEventDue(e, gameDate)} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default EventsPanel;
