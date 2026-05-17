import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import './gm.css';

const toList = (csv) =>
  csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const toForm = (e) => ({
  id: e.id,
  title: e.title || '',
  category: e.category || '',
  summary: e.summary || '',
  content: e.content || '',
  related: Array.isArray(e.related) ? e.related.join(', ') : '',
  tags: Array.isArray(e.tags) ? e.tags.join(', ') : '',
  createdAt: e.createdAt,
});

const blankEntry = () => toForm({});

const LoreForm = ({ initial, isNew, existingIds, onSaved }) => {
  const [e, setE] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // null | {kind:'delete'} | {kind:'collision',id,payload}

  const set = (patch) => setE((cur) => ({ ...cur, ...patch }));

  const submit = async (id, payload) => {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await saveDocument('lore', id, payload);
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
    if (!e.category.trim()) {
      setError('Category is required.');
      return;
    }
    const id = e.id || slugify(e.title);
    const payload = {
      id,
      title: e.title.trim(),
      category: e.category.trim(),
      summary: e.summary.trim(),
      content: e.content,
      related: toList(e.related),
      tags: toList(e.tags),
      createdAt: e.createdAt || new Date().toISOString(),
    };
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
      await deleteDocument('lore', e.id);
      onSaved(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-card" data-testid={`lore-form-${e.id || 'new'}`}>
      <div className="gm-row">
        <div className="form-group">
          <label>Title</label>
          <input aria-label="title" value={e.title} onChange={(ev) => set({ title: ev.target.value })} />
        </div>
        <div className="form-group">
          <label>Category</label>
          <input
            aria-label="category"
            placeholder="Location / NPC / History / …"
            value={e.category}
            onChange={(ev) => set({ category: ev.target.value })}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Summary</label>
        <textarea
          aria-label="summary"
          rows={2}
          value={e.summary}
          onChange={(ev) => set({ summary: ev.target.value })}
        />
      </div>
      <div className="form-group">
        <label>Content</label>
        <textarea
          aria-label="content"
          rows={6}
          value={e.content}
          onChange={(ev) => set({ content: ev.target.value })}
        />
      </div>
      <div className="gm-row">
        <div className="form-group">
          <label>Related (comma-separated ids)</label>
          <input
            aria-label="related"
            value={e.related}
            onChange={(ev) => set({ related: ev.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Tags (comma-separated)</label>
          <input aria-label="tags" value={e.tags} onChange={(ev) => set({ tags: ev.target.value })} />
        </div>
      </div>

      {error && <p className="gm-warn" role="alert">{error}</p>}
      <div className="gm-actions">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {isNew ? 'Create entry' : 'Save'}
        </button>
        {!isNew && (
          <button className="btn-danger" disabled={busy} onClick={() => setConfirm({ kind: 'delete' })}>
            Delete
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirm?.kind === 'delete'}
        title="Delete lore entry"
        message={`Permanently delete the lore entry “${e.title}”. This cannot be undone — restore it from History if you have it.`}
        confirmLabel="Delete forever"
        requireType={e.title}
        onConfirm={doRemove}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'collision'}
        title="Overwrite existing entry?"
        message={`A lore entry with id “${confirm?.id}” already exists. Saving will overwrite it.`}
        confirmLabel="Overwrite"
        onConfirm={() => submit(confirm.id, confirm.payload)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

const GmLore = () => {
  const { loreEntries } = useContent();
  const entries = useMemo(
    () => (Array.isArray(loreEntries) ? loreEntries : []),
    [loreEntries]
  );
  const existingIds = useMemo(() => existingIdSet(entries), [entries]);
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState(null);
  const [query, setQuery] = useState('');

  const onSaved = (wasNew) => {
    if (wasNew) setAdding(false);
    setFlash('Saved. Changes are live for every connected player.');
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [e.title, e.category, e.id, ...(e.tags || [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [entries, query]);

  return (
    <div className="gm-lore">
      {flash && <p className="gm-ok" role="status">{flash}</p>}

      <div className="form-group">
        <input
          aria-label="filter"
          placeholder={`Filter ${entries.length} entries by title, category, tag or id…`}
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
        />
      </div>

      {adding ? (
        <LoreForm initial={blankEntry()} isNew existingIds={existingIds} onSaved={onSaved} />
      ) : (
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + New entry
        </button>
      )}

      <p className="gm-count">
        Showing {filtered.length} of {entries.length}
      </p>
      <div className="gm-lore-list">
        {filtered.map((entry) => (
          <LoreForm
            key={entry.id}
            initial={toForm(entry)}
            isNew={false}
            existingIds={existingIds}
            onSaved={onSaved}
          />
        ))}
      </div>
    </div>
  );
};

export default GmLore;
