import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import HistoryModal from '../../components/gm/HistoryModal';
import ImageField from '../../components/gm/ImageField';
import PageEditorShell from '../../components/gm/PageEditorShell';
import LoreBulkPanel from './LoreBulkPanel';
import './gm.css';

const toForm = (e) => ({
  id: e.id,
  title: e.title || '',
  category: e.category || '',
  image: e.image || '',
  imagePosition: e.imagePosition || { x: 50, y: 50 },
  summary: e.summary || '',
  content: e.content || '',
  related: Array.isArray(e.related) ? e.related : [],
  visibility: e.visibility === 'revealed' ? 'revealed' : 'gm',
  createdAt: e.createdAt,
});

const blankEntry = () => toForm({});

const LoreForm = ({ initial, isNew, existingIds, allEntries, onSaved, onRestored }) => {
  const [e, setE] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // null | {kind:'delete'} | {kind:'collision',id,payload}
  const [showHistory, setShowHistory] = useState(false);
  const [relatedQuery, setRelatedQuery] = useState('');

  const set = (patch) => setE((cur) => ({ ...cur, ...patch }));

  const titleById = useMemo(
    () => new Map((allEntries || []).map((x) => [x.id, x.title])),
    [allEntries]
  );
  const idByTitle = useMemo(
    () =>
      new Map(
        (allEntries || [])
          .filter((x) => x.title)
          .map((x) => [String(x.title).toLowerCase(), x.id])
      ),
    [allEntries]
  );

  // Related entries are picked from existing lore only — the input resolves an
  // id or title against the catalog and refuses anything that doesn't exist.
  const addRelated = () => {
    const v = relatedQuery.trim();
    if (!v) return;
    const id = titleById.has(v) ? v : idByTitle.get(v.toLowerCase());
    if (!id) {
      setError(`No lore entry matches "${v}".`);
      return;
    }
    if (id === e.id) {
      setError('An entry cannot relate to itself.');
      return;
    }
    setError(null);
    if (!e.related.includes(id)) set({ related: [...e.related, id] });
    setRelatedQuery('');
  };

  const removeRelated = (id) => set({ related: e.related.filter((r) => r !== id) });

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

  const buildPayload = (visibility) => {
    const id = e.id || slugify(e.title);
    const payload = {
      id,
      title: e.title.trim(),
      category: e.category.trim(),
      summary: e.summary.trim(),
      content: e.content,
      // Legacy docs can carry ids whose entry was since deleted — drop them so
      // saved entries only ever relate to lore that exists.
      related: e.related.filter((r) => existingIds.has(r)),
      visibility: visibility === 'revealed' ? 'revealed' : 'gm',
      createdAt: e.createdAt || new Date().toISOString(),
    };
    if (e.image) { payload.image = e.image; payload.imagePosition = e.imagePosition; }
    return payload;
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
    const payload = buildPayload(e.visibility);
    if (isNew && existingIds && existingIds.has(payload.id)) {
      setConfirm({ kind: 'collision', id: payload.id, payload });
      return;
    }
    await submit(payload.id, payload);
  };

  // One-tap reveal/hide for an existing entry — persists immediately so the
  // GM can flip lore live at the table without a separate Save.
  const toggleVisibility = async () => {
    const next = e.visibility === 'revealed' ? 'gm' : 'revealed';
    set({ visibility: next });
    await submit(e.id, buildPayload(next));
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

      <div className="gm-row">
        <div className="form-group">
          <label>Visibility</label>
          <select
            aria-label="visibility"
            value={e.visibility}
            onChange={(ev) => set({ visibility: ev.target.value })}
          >
            <option value="gm">GM only</option>
            <option value="revealed">Revealed to players</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <label>Image</label>
        <ImageField value={e.image} onChange={(v) => set({ image: v })} position={e.imagePosition} onPositionChange={(p) => set({ imagePosition: p })} ariaLabel="lore-image" />
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

      <div className="form-group">
        <label>Related entries</label>
        {e.related.length > 0 && (
          <div className="gm-lore-chips" aria-label="related entries">
            {e.related.map((r) => (
              <button
                key={r}
                type="button"
                className="gm-lore-chip"
                title="Remove"
                onClick={() => removeRelated(r)}
              >
                {titleById.get(r) || r} ×
              </button>
            ))}
          </div>
        )}
        <div className="gm-lore-related-add">
          <input
            aria-label="add-related"
            list="lore-related-options"
            placeholder="Find an entry by title or id…"
            value={relatedQuery}
            onChange={(ev) => setRelatedQuery(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') {
                ev.preventDefault();
                addRelated();
              }
            }}
          />
          <button type="button" className="btn-secondary" onClick={addRelated}>
            Add
          </button>
        </div>
        <datalist id="lore-related-options">
          {(allEntries || [])
            .filter((x) => x.id !== e.id && !e.related.includes(x.id))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
        </datalist>
      </div>

      {error && <p className="gm-warn" role="alert">{error}</p>}
      <div className="gm-actions">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {isNew ? 'Create entry' : 'Save'}
        </button>
        {!isNew && (
          <>
            <button className="btn-secondary" disabled={busy} onClick={toggleVisibility}>
              {e.visibility === 'revealed' ? 'Hide from players' : 'Reveal to players'}
            </button>
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
        message={`Permanently delete the lore entry "${e.title}". This cannot be undone — restore it from History if you have it.`}
        confirmLabel="Delete forever"
        requireType={e.title}
        onConfirm={doRemove}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'collision'}
        title="Overwrite existing entry?"
        message={`A lore entry with id "${confirm?.id}" already exists. Saving will overwrite it.`}
        confirmLabel="Overwrite"
        onConfirm={() => submit(confirm.id, confirm.payload)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

// Category is required on save, but be defensive about legacy/blank rows.
const categoryOf = (e) => (e.category && String(e.category).trim()) || 'Uncategorized';

// List row: reveal-state dot + title. The dot is decorative metadata —
// aria-hidden keeps the button's accessible name as just the title (+ a
// screen-reader "Revealed" flag).
const LoreRow = ({ entry }) => {
  const revealed = entry.visibility === 'revealed';
  return (
    <span className="gm-lore-row-title">
      <span
        className={`gm-lore-dot${revealed ? ' revealed' : ''}`}
        title={revealed ? 'Revealed to players' : 'GM only'}
        aria-hidden="true"
      />
      {entry.title}
      {revealed && <span className="gm-visually-hidden">Revealed</span>}
    </span>
  );
};

const GmLore = () => {
  // The GM editor sees everything; `loreEntries` is the player-visible subset.
  const { allLoreEntries } = useContent();
  const entries = useMemo(() => {
    const list = Array.isArray(allLoreEntries) ? [...allLoreEntries] : [];
    // Sorted by category then title so the All tab's group headers are contiguous.
    return list.sort(
      (a, b) =>
        categoryOf(a).localeCompare(categoryOf(b)) ||
        String(a.title || '').localeCompare(String(b.title || ''))
    );
  }, [allLoreEntries]);
  const existingIds = useMemo(() => existingIdSet(entries), [entries]);
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

  // Prefill the category of a new entry from the active tab (All → blank, so
  // the GM still must pick one — category is required on save).
  const newInitial = () => ({
    ...blankEntry(),
    category: activeTab === 'All' ? '' : activeTab,
  });

  const header = (
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
  );

  return (
    <div className="gm-lore">
      <PageEditorShell
        entries={inTab}
        nameOf={(e) => <LoreRow entry={e} />}
        noun="entry"
        addLabel="+ New entry"
        header={header}
        groupOf={activeTab === 'All' ? categoryOf : undefined}
        filterEntry={(e, q) =>
          [e.title, e.category, e.id]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        }
        renderDetail={(entry, isNew, callbacks) => (
          <LoreForm
            initial={isNew ? newInitial() : toForm(entry)}
            isNew={isNew}
            existingIds={existingIds}
            allEntries={entries}
            {...callbacks}
          />
        )}
        renderBulkPanel={(selected, { onSaved }) => (
          <LoreBulkPanel entries={selected} allEntries={entries} onSaved={onSaved} />
        )}
      />
    </div>
  );
};

export default GmLore;
