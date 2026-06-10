import React, { useMemo, useState } from 'react';
import { saveDocument } from '../../utils/gmApi';
import './gm.css';

const toList = (csv) =>
  csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Tally how many of the selected entries carry each value of `field`.
const countValues = (entries, field) => {
  const counts = new Map();
  for (const e of entries) {
    for (const v of Array.isArray(e[field]) ? e[field] : []) {
      counts.set(v, (counts.get(v) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
};

// Staged bulk edit over the checked lore entries: reveal state plus add/remove
// for tags and related ids. Apply is a sequential read-modify-write of each
// full live doc via the single-entity PUT — unchanged docs are skipped so a
// no-op apply costs no DO writes and floods no history.
const LoreBulkPanel = ({ entries, allEntries, onSaved }) => {
  const [reveal, setReveal] = useState('keep');
  const [addTags, setAddTags] = useState('');
  const [removeTags, setRemoveTags] = useState(() => new Set());
  const [addRelated, setAddRelated] = useState('');
  const [removeRelated, setRemoveRelated] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null); // { updated, skipped, failed: [id] }

  const tagCounts = useMemo(() => countValues(entries, 'tags'), [entries]);
  const relatedCounts = useMemo(() => countValues(entries, 'related'), [entries]);
  const titleById = useMemo(
    () => new Map((allEntries || []).map((e) => [e.id, e.title])),
    [allEntries]
  );
  // Typing a title is friendlier than a slug; resolve it to the id on apply.
  const idByTitle = useMemo(
    () =>
      new Map(
        (allEntries || [])
          .filter((e) => e.title)
          .map((e) => [String(e.title).toLowerCase(), e.id])
      ),
    [allEntries]
  );

  const toggleIn = (setter) => (v) =>
    setter((cur) => {
      const next = new Set(cur);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  const toggleRemoveTag = toggleIn(setRemoveTags);
  const toggleRemoveRelated = toggleIn(setRemoveRelated);

  // Only touch a field when it actually changes, so the JSON-equal no-op
  // check in apply() can skip untouched docs (and absent keys stay absent).
  const nextDoc = (e) => {
    const next = { ...e };
    if (reveal !== 'keep') next.visibility = reveal;

    const origTags = Array.isArray(e.tags) ? e.tags : [];
    const keptTags = origTags.filter((t) => !removeTags.has(t));
    const newTags = [...keptTags, ...toList(addTags).filter((t) => !keptTags.includes(t))];
    if (JSON.stringify(newTags) !== JSON.stringify(origTags)) next.tags = newTags;

    const origRelated = Array.isArray(e.related) ? e.related : [];
    const keptRelated = origRelated.filter((r) => !removeRelated.has(r));
    const addR = toList(addRelated).map((r) => idByTitle.get(r.toLowerCase()) || r);
    const newRelated = [...keptRelated, ...addR.filter((r) => !keptRelated.includes(r))];
    if (JSON.stringify(newRelated) !== JSON.stringify(origRelated)) next.related = newRelated;

    return next;
  };

  const apply = async () => {
    setBusy(true);
    setResult(null);
    const changed = entries
      .map((e) => ({ id: e.id, doc: nextDoc(e) }))
      .filter(({ doc }, i) => JSON.stringify(doc) !== JSON.stringify(entries[i]));
    const failed = [];
    let updated = 0;
    for (const { id, doc } of changed) {
      setProgress(`Updating ${updated + failed.length + 1} of ${changed.length}…`);
      try {
        await saveDocument('lore', id, doc);
        updated += 1;
      } catch {
        failed.push(id);
      }
    }
    setProgress(null);
    setBusy(false);
    setResult({ updated, skipped: entries.length - changed.length, failed });
    if (updated > 0) {
      onSaved();
      // Applied edits are now live; reset the staged inputs so a follow-up
      // bulk op starts clean against the refreshed selection.
      setReveal('keep');
      setAddTags('');
      setRemoveTags(new Set());
      setAddRelated('');
      setRemoveRelated(new Set());
    }
  };

  return (
    <div className="gm-card gm-lore-bulk" data-testid="lore-bulk-panel">
      <p className="gm-lore-bulk-title">
        Bulk edit — {entries.length} {entries.length === 1 ? 'entry' : 'entries'} selected
      </p>

      <div className="form-group">
        <label>Visibility</label>
        <select
          aria-label="bulk-visibility"
          value={reveal}
          onChange={(ev) => setReveal(ev.target.value)}
        >
          <option value="keep">Leave unchanged</option>
          <option value="revealed">Reveal to players</option>
          <option value="gm">Hide from players (GM only)</option>
        </select>
      </div>

      <div className="form-group">
        <label>Add tags (comma-separated)</label>
        <input
          aria-label="bulk-add-tags"
          value={addTags}
          onChange={(ev) => setAddTags(ev.target.value)}
        />
      </div>
      {tagCounts.length > 0 && (
        <div className="form-group">
          <label>Tags in selection — click to remove</label>
          <div className="gm-lore-tagbar" aria-label="bulk tags">
            {tagCounts.map(([t, c]) => (
              <button
                key={t}
                type="button"
                className={`gm-lore-tag${removeTags.has(t) ? ' removing' : ''}`}
                aria-pressed={removeTags.has(t)}
                onClick={() => toggleRemoveTag(t)}
              >
                {t} ×{c}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="form-group">
        <label>Add related entries (comma-separated id or title)</label>
        <input
          aria-label="bulk-add-related"
          list="lore-bulk-related-options"
          value={addRelated}
          onChange={(ev) => setAddRelated(ev.target.value)}
        />
        <datalist id="lore-bulk-related-options">
          {(allEntries || []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </datalist>
      </div>
      {relatedCounts.length > 0 && (
        <div className="form-group">
          <label>Related in selection — click to remove</label>
          <div className="gm-lore-tagbar" aria-label="bulk related">
            {relatedCounts.map(([r, c]) => (
              <button
                key={r}
                type="button"
                className={`gm-lore-tag${removeRelated.has(r) ? ' removing' : ''}`}
                aria-pressed={removeRelated.has(r)}
                onClick={() => toggleRemoveRelated(r)}
              >
                {titleById.get(r) || r} ×{c}
              </button>
            ))}
          </div>
        </div>
      )}

      {progress && (
        <p className="gm-count" role="status">
          {progress}
        </p>
      )}
      {result && (
        <p
          className={result.failed.length > 0 ? 'gm-warn' : 'gm-count'}
          role={result.failed.length > 0 ? 'alert' : 'status'}
        >
          Updated {result.updated}, unchanged {result.skipped}
          {result.failed.length > 0 && ` — failed: ${result.failed.join(', ')}`}
        </p>
      )}

      <div className="gm-actions">
        <button className="btn-primary" disabled={busy} onClick={apply}>
          Apply to selection
        </button>
      </div>
    </div>
  );
};

export default LoreBulkPanel;
