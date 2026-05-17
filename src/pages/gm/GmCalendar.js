import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import HistoryModal from '../../components/gm/HistoryModal';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // null | {kind:'delete'} | {kind:'collision',id,payload}
  const [showHistory, setShowHistory] = useState(false);

  const set = (patch) => setE((cur) => ({ ...cur, ...patch }));

  const submit = async (id, payload) => {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await saveDocument('calendar', id, payload);
      onSaved(isNew);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!e.title.trim()) {
      setError('Title is required.');
      return;
    }
    const month = numOrNull(e.month);
    const day = numOrNull(e.day);
    const recurring = e.recurring.trim();
    if (!recurring && (month == null || day == null)) {
      setError('Provide a recurring rule, or a fixed month and day.');
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

    if (isNew && existingIds && existingIds.has(id)) {
      setConfirm({ kind: 'collision', id, payload });
      return;
    }
    await submit(id, payload);
  };

  const doRemove = async () => {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await deleteDocument('calendar', e.id);
      onSaved(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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

      {error && <p className="gm-warn" role="alert">{error}</p>}
      <div className="gm-actions">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {isNew ? 'Create event' : 'Save'}
        </button>
        {!isNew && (
          <>
            <button className="btn-secondary" disabled={busy} onClick={() => setShowHistory(true)}>
              History
            </button>
            <button className="btn-danger" disabled={busy} onClick={() => setConfirm({ kind: 'delete' })}>
              Delete
            </button>
          </>
        )}
      </div>

      {!isNew && (
        <HistoryModal
          isOpen={showHistory}
          collection="calendar"
          id={e.id}
          name={e.title}
          onClose={() => setShowHistory(false)}
          onRestored={() => {
            setShowHistory(false);
            onRestored();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={confirm?.kind === 'delete'}
        title="Delete event"
        message={`Permanently delete the event “${e.title}”. This cannot be undone — restore it from History if you have it.`}
        confirmLabel="Delete forever"
        requireType={e.title}
        onConfirm={doRemove}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'collision'}
        title="Overwrite existing entry?"
        message={`An event with id “${confirm?.id}” already exists. Saving will overwrite it.`}
        confirmLabel="Overwrite"
        onConfirm={() => submit(confirm.id, confirm.payload)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

const GmCalendar = () => {
  const { calendarEvents } = useContent();
  const events = Array.isArray(calendarEvents) ? calendarEvents : [];
  const existingIds = existingIdSet(events);
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState(null);

  const onSaved = (wasNew) => {
    if (wasNew) setAdding(false);
    setFlash('Saved. Changes are live for every connected player.');
  };
  const onRestored = () =>
    setFlash('Restored. Changes are live for every connected player.');

  return (
    <div className="gm-calendar">
      {flash && <p className="gm-ok" role="status">{flash}</p>}

      {adding ? (
        <EventForm
          initial={blankEvent()}
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

      <div className="gm-event-list">
        {events.map((ev) => (
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
