import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify } from '../../utils/contentUtils';
import './gm.css';

const STATUSES = ['pending', 'active', 'completed'];
const PRIORITIES = ['high', 'medium', 'low'];

const blankQuest = () => ({
  title: '',
  status: 'pending',
  priority: 'medium',
  location: '',
  giver: '',
  description: '',
  notes: [],
});

const QuestForm = ({ initial, isNew, onSaved }) => {
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (patch) => setQ((cur) => ({ ...cur, ...patch }));
  const setNote = (i, content) =>
    setQ((cur) => ({
      ...cur,
      notes: cur.notes.map((n, idx) => (idx === i ? { ...n, content } : n)),
    }));
  const addNote = () =>
    setQ((cur) => ({ ...cur, notes: [...(cur.notes || []), { content: '' }] }));
  const removeNote = (i) =>
    setQ((cur) => ({ ...cur, notes: cur.notes.filter((_, idx) => idx !== i) }));

  const save = async () => {
    if (!q.title.trim()) {
      setError('Title is required.');
      return;
    }
    const id = q.id || slugify(q.title);
    setBusy(true);
    setError(null);
    try {
      await saveDocument('quest', id, { ...q, id });
      onSaved(isNew);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!q.id || !window.confirm(`Delete quest "${q.title}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDocument('quest', q.id);
      onSaved(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-card" data-testid={`quest-form-${q.id || 'new'}`}>
      <div className="form-group">
        <label>Title</label>
        <input
          aria-label="title"
          value={q.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>
      <div className="gm-row">
        <div className="form-group">
          <label>Status</label>
          <select aria-label="status" value={q.status} onChange={(e) => set({ status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Priority</label>
          <select aria-label="priority" value={q.priority} onChange={(e) => set({ priority: e.target.value })}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="gm-row">
        <div className="form-group">
          <label>Location</label>
          <input
            aria-label="location"
            value={q.location || ''}
            onChange={(e) => set({ location: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Quest Giver</label>
          <input
            aria-label="giver"
            value={q.giver || ''}
            onChange={(e) => set({ giver: e.target.value })}
          />
        </div>
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea
          aria-label="description"
          rows={3}
          value={q.description || ''}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>Notes</label>
        {(q.notes || []).map((n, i) => (
          <div key={n.id || i} className="gm-note-row">
            <textarea
              rows={2}
              value={n.content}
              aria-label={`note-${i}`}
              onChange={(e) => setNote(i, e.target.value)}
            />
            <button className="btn-small btn-danger" onClick={() => removeNote(i)}>
              Remove
            </button>
          </div>
        ))}
        <button className="btn-small btn-secondary" onClick={addNote}>
          Add note
        </button>
      </div>

      {error && <p className="gm-warn" role="alert">{error}</p>}
      <div className="gm-actions">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {isNew ? 'Create quest' : 'Save'}
        </button>
        {!isNew && (
          <button className="btn-danger" disabled={busy} onClick={remove}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
};

const GmQuests = () => {
  const { quests, source } = useContent();
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState(null);

  const onSaved = (wasNew) => {
    if (wasNew) setAdding(false);
    setFlash('Saved. Changes are live for every connected player.');
  };

  return (
    <div className="gm-quests">
      {source === 'fallback' && (
        <div className="gm-banner">
          Showing bundled defaults — saving a quest writes it to the store. Use
          “Import defaults” on the Dashboard first so all quests persist together.
        </div>
      )}
      {flash && <p className="gm-ok" role="status">{flash}</p>}

      {adding ? (
        <QuestForm initial={blankQuest()} isNew onSaved={onSaved} />
      ) : (
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + New quest
        </button>
      )}

      <div className="gm-quest-list">
        {quests.map((q) => (
          <QuestForm key={q.id} initial={q} isNew={false} onSaved={onSaved} />
        ))}
      </div>
    </div>
  );
};

export default GmQuests;
