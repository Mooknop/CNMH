import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import { useGmEntryForm } from '../../hooks/useGmEntryForm';
import GmEntryDialogs from '../../components/gm/GmEntryDialogs';
import PageEditorShell from '../../components/gm/PageEditorShell';
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

const QuestForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const [q, setQ] = useState(initial);
  const form = useGmEntryForm({ collection: 'quest', isNew, existingIds, onSaved });

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
      form.setError('Title is required.');
      return;
    }
    const id = q.id || slugify(q.title);
    await form.save(id, { ...q, id });
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

      {form.error && <p className="gm-warn" role="alert">{form.error}</p>}
      <div className="gm-actions">
        <button className="btn-primary" disabled={form.busy} onClick={save}>
          {isNew ? 'Create quest' : 'Save'}
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
        collection="quest"
        noun="quest"
        id={q.id}
        name={q.title}
        isNew={isNew}
        deleteMessage={`Permanently delete the quest "${q.title}". This cannot be undone — restore it from History if you have it.`}
        onRestored={(doc) => {
          if (doc) setQ(doc);
          onRestored();
        }}
      />
    </div>
  );
};

const GmQuests = () => {
  const { quests, source } = useContent();
  const existingIds = existingIdSet(quests);

  return (
    <div className="gm-quests">
      {source === 'fallback' && (
        <div className="gm-banner">
          Showing bundled defaults — saving a quest writes it to the store. Use
          &quot;Import defaults&quot; on the Dashboard first so all quests persist together.
        </div>
      )}
      <PageEditorShell
        entries={quests}
        nameOf={(q) => q.title}
        noun="quest"
        addLabel="+ New quest"
        renderDetail={(entry, isNew, callbacks) => (
          <QuestForm
            initial={isNew ? blankQuest() : entry}
            isNew={isNew}
            existingIds={existingIds}
            {...callbacks}
          />
        )}
      />
    </div>
  );
};

export default GmQuests;
