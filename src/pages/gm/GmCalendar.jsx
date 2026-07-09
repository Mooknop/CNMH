import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import { useGmEntryForm } from '../../hooks/useGmEntryForm';
import GmEntryDialogs from '../../components/gm/GmEntryDialogs';
import './gm.css';

// month/day/year are kept as raw strings in the form and coerced on save so a
// blank year stays "annual" and month 0 (first month) is preserved.
const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

const toForm = (ev) => ({
  id: ev.id,
  title: ev.title || ev.name || '',
  type: ev.type || '',
  recurring: ev.recurring || '',
  year: ev.date && ev.date.year != null ? String(ev.date.year) : '',
  month: ev.date && ev.date.month != null ? String(ev.date.month) : '',
  day: ev.date && ev.date.day != null ? String(ev.date.day) : '',
  description: ev.description || '',
  details: ev.details || '',
});

const blankEvent = () => toForm({});

const EventForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const [e, setE] = useState(initial);
  const form = useGmEntryForm({ collection: 'calendar', isNew, existingIds, onSaved });

  const set = (patch) => setE((cur) => ({ ...cur, ...patch }));

  const save = async () => {
    if (!e.title.trim()) {
      form.setError('Title is required.');
      return;
    }
    const month = numOrNull(e.month);
    const day = numOrNull(e.day);
    const recurring = e.recurring.trim();
    if (!recurring && (month == null || day == null)) {
      form.setError('Provide a recurring rule, or a fixed month and day.');
      return;
    }

    const id = e.id || slugify(e.title);
    const payload = { id, title: e.title.trim(), type: e.type.trim() || 'campaign' };
    if (recurring) payload.recurring = recurring;
    if (month != null && day != null) {
      const year = numOrNull(e.year);
      payload.date = { ...(year != null ? { year } : {}), month, day };
    }
    if (e.description.trim()) payload.description = e.description.trim();
    if (e.details.trim()) payload.details = e.details.trim();

    await form.save(id, payload);
  };

  return (
    <div className="gm-card" data-testid={`event-form-${e.id || 'new'}`}>
      <div className="gm-row">
        <div className="form-group">
          <label>Title</label>
          <input aria-label="title" value={e.title} onChange={(ev) => set({ title: ev.target.value })} />
        </div>
        <div className="form-group">
          <label>Type</label>
          <input
            aria-label="type"
            placeholder="campaign / personal / recurring"
            value={e.type}
            onChange={(ev) => set({ type: ev.target.value })}
          />
        </div>
      </div>

      <div className="gm-row gm-date-row">
        <div className="form-group">
          <label>Year (blank = every year)</label>
          <input
            aria-label="year"
            type="number"
            value={e.year}
            onChange={(ev) => set({ year: ev.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Month (0 = first)</label>
          <input
            aria-label="month"
            type="number"
            value={e.month}
            onChange={(ev) => set({ month: ev.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Day</label>
          <input
            aria-label="day"
            type="number"
            value={e.day}
            onChange={(ev) => set({ day: ev.target.value })}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Recurring rule (optional, e.g. “every full moon”)</label>
        <input
          aria-label="recurring"
          value={e.recurring}
          onChange={(ev) => set({ recurring: ev.target.value })}
        />
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea
          aria-label="description"
          rows={2}
          value={e.description}
          onChange={(ev) => set({ description: ev.target.value })}
        />
      </div>
      <div className="form-group">
        <label>Details (optional)</label>
        <textarea
          aria-label="details"
          rows={2}
          value={e.details}
          onChange={(ev) => set({ details: ev.target.value })}
        />
      </div>

      {form.error && <p className="gm-warn" role="alert">{form.error}</p>}
      <div className="gm-actions">
        <button className="btn-primary" disabled={form.busy} onClick={save}>
          {isNew ? 'Create event' : 'Save'}
        </button>
        {!isNew && (
          <>
            <button className="btn-secondary" disabled={form.busy} onClick={() => form.setShowHistory(true)}>
              History
            </button>
            <button className="btn-danger" disabled={form.busy} onClick={form.requestDelete}>
              Delete
            </button>
          </>
        )}
      </div>

      <GmEntryDialogs
        form={form}
        collection="calendar"
        noun="event"
        id={e.id}
        name={e.title}
        isNew={isNew}
        deleteMessage={`Permanently delete the event “${e.title}”. This cannot be undone — restore it from History if you have it.`}
        onRestored={(doc) => {
          if (doc) setE(toForm(doc));
          onRestored();
        }}
      />
    </div>
  );
};

// Missing/blank type saves as "campaign" (see EventForm.save), so group the
// same way the data ultimately lands.
const typeOf = (ev) => (ev.type && ev.type.trim()) || 'campaign';

const GmCalendar = () => {
  const { calendarEvents } = useContent();
  const events = useMemo(
    () => (Array.isArray(calendarEvents) ? calendarEvents : []),
    [calendarEvents]
  );
  const existingIds = useMemo(() => existingIdSet(events), [events]);
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState(null);
  const [tab, setTab] = useState('All');

  const tabs = useMemo(
    () => ['All', ...Array.from(new Set(events.map(typeOf))).sort()],
    [events]
  );
  // A removed/renamed type could leave `tab` dangling; fall back to All.
  const activeTab = tabs.includes(tab) ? tab : 'All';
  const visible =
    activeTab === 'All' ? events : events.filter((ev) => typeOf(ev) === activeTab);

  const onSaved = (wasNew) => {
    if (wasNew) setAdding(false);
    setFlash('Saved. Changes are live for every connected player.');
  };
  const onRestored = () =>
    setFlash('Restored. Changes are live for every connected player.');

  // Prefill the type of a new event from the active tab (All → blank, which
  // saves as "campaign").
  const newInitial = () => ({
    ...blankEvent(),
    type: activeTab === 'All' ? '' : activeTab,
  });

  return (
    <div className="gm-calendar">
      {flash && <p className="gm-ok" role="status">{flash}</p>}

      <nav className="gm-nav" aria-label="event types">
        {tabs.map((t) => (
          <button
            key={t}
            className={`gm-nav-link ${t === activeTab ? 'active' : ''}`}
            aria-pressed={t === activeTab}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      {adding ? (
        <EventForm
          initial={newInitial()}
          isNew
          existingIds={existingIds}
          onSaved={onSaved}
          onRestored={onRestored}
        />
      ) : (
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + New event
        </button>
      )}

      <p className="gm-count">
        Showing {visible.length} of {events.length}
      </p>
      <div className="gm-event-list">
        {visible.map((ev) => (
          <EventForm
            key={ev.id}
            initial={toForm(ev)}
            isNew={false}
            existingIds={existingIds}
            onSaved={onSaved}
            onRestored={onRestored}
          />
        ))}
      </div>
    </div>
  );
};

export default GmCalendar;
