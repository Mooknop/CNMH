import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import HistoryModal from '../../components/gm/HistoryModal';
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

const LoreForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
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
          collection="lore"
          id={e.id}
          name={e.title}
          onClose={() => setShowHistory(false)}
          onRestored={(doc) => {
            setShowHistory(false);
            if (doc) setE(toForm(doc));
            setError(null);
            onRestored();
          }}
        />
      )}

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

// Category is required on save, but be defensive about legacy/blank rows.
const categoryOf = (e) => (e.category && String(e.category).trim()) || 'Uncategorized';

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
  const [tab, setTab] = useState('All');

  const tabs = useMemo(
    () => ['All', ...Array.from(new Set(entries.map(categoryOf))).sort()],
    [entries]
  );
  // A removed/renamed category could leave `tab` dangling; fall back to All.
  const activeTab = tabs.includes(tab) ? tab : 'All';

  const inTab = useMemo(
    () => (activeTab === 'All' ? entries : entries.filter((e) => categoryOf(e) === activeTab)),
    [entries, activeTab]
  );

  const onSaved = (wasNew) => {
    if (wasNew) setAdding(false);
    setFlash('Saved. Changes are live for every connected player.');
  };
  const onRestored = () =>
    setFlash('Restored. Changes are live for every connected player.');

  // Text filter applies within the active category tab.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inTab;
    return inTab.filter((e) =>
      [e.title, e.category, e.id, ...(e.tags || [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [inTab, query]);

  // Prefill the category of a new entry from the active tab (All → blank, so
  // the GM still must pick one — category is required on save).
  const newInitial = () => ({
    ...blankEntry(),
    category: activeTab === 'All' ? '' : activeTab,
  });

  return (
    <div className="gm-lore">
      {flash && <p className="gm-ok" role="status">{flash}</p>}

      <nav className="gm-nav" aria-label="lore categories">
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

      <div className="form-group">
        <input
          aria-label="filter"
          placeholder={`Filter ${inTab.length} ${
            activeTab === 'All' ? 'entries' : `${activeTab} entries`
          } by title, tag or id…`}
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
        />
      </div>

      {adding ? (
        <LoreForm
          initial={newInitial()}
          isNew
          existingIds={existingIds}
          onSaved={onSaved}
          onRestored={onRestored}
        />
      ) : (
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + New entry
        </button>
      )}

      <p className="gm-count">
        Showing {filtered.length} of {inTab.length}
      </p>
      <div className="gm-lore-list">
        {filtered.map((entry) => (
          <LoreForm
            key={entry.id}
            initial={toForm(entry)}
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

export default GmLore;
