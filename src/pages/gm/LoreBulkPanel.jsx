import React, { useState } from 'react';
import { saveDocument } from '../../utils/gmApi';
import './gm.css';

// Staged bulk reveal/hide over the checked lore entries. Apply is a sequential
// read-modify-write of each full live doc via the single-entity PUT — only
// `visibility` changes, and unchanged docs are skipped so a no-op apply costs no
// DO writes and floods no history. (Lore content is authored in the vault, not
// here — see GmLore / epic #285.)
const LoreBulkPanel = ({ entries, onSaved }) => {
  const [reveal, setReveal] = useState('keep');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null); // { updated, skipped, failed: [id] }

  // Only touch visibility when it actually changes, so the JSON-equal no-op check
  // in apply() can skip untouched docs (and every other field stays verbatim).
  const nextDoc = (e) => {
    const next = { ...e };
    if (reveal !== 'keep') next.visibility = reveal;
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
      setReveal('keep');
    }
  };

  return (
    <div className="gm-card gm-lore-bulk" data-testid="lore-bulk-panel">
      <p className="gm-lore-bulk-title">
        Bulk reveal — {entries.length} {entries.length === 1 ? 'entry' : 'entries'} selected
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
