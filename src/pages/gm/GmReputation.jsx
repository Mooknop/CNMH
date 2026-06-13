import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import HistoryModal from '../../components/gm/HistoryModal';
import PageEditorShell from '../../components/gm/PageEditorShell';
import './gm.css';

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
};

const blankFaction = () => ({ name: '', reputation: 0, ranks: [] });
const blankRank = () => ({ name: '', min: 0, max: 0, effect: '' });

const FactionForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // null | {kind:'delete'} | {kind:'collision',id,payload}
  const [showHistory, setShowHistory] = useState(false);

  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const setRank = (i, patch) =>
    setF((cur) => ({
      ...cur,
      ranks: cur.ranks.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));
  const addRank = () => setF((cur) => ({ ...cur, ranks: [...(cur.ranks || []), blankRank()] }));
  const removeRank = (i) =>
    setF((cur) => ({ ...cur, ranks: cur.ranks.filter((_, idx) => idx !== i) }));

  const submit = async (id, payload) => {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await saveDocument('faction', id, payload);
      onSaved(isNew, id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!f.name.trim()) {
      setError('Name is required.');
      return;
    }
    const id = f.id || slugify(f.name);
    const payload = {
      ...f,
      id,
      reputation: toInt(f.reputation),
      ranks: (f.ranks || []).map((r) => {
        const rank = { name: r.name, min: toInt(r.min), max: toInt(r.max) };
        if (r.effect && r.effect.trim()) rank.effect = r.effect.trim();
        if (r.id) rank.id = r.id;
        return rank;
      }),
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
      await deleteDocument('faction', f.id);
      onSaved(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-card" data-testid={`faction-form-${f.id || 'new'}`}>
      <div className="gm-row">
        <div className="form-group">
          <label>Faction name</label>
          <input
            aria-label="faction-name"
            value={f.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Reputation</label>
          <input
            aria-label="reputation"
            type="number"
            value={f.reputation}
            onChange={(e) => set({ reputation: e.target.value })}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Rank tiers</label>
        {(f.ranks || []).map((r, i) => (
          <div key={r.id || i} className="gm-row gm-rank-row">
            <input
              aria-label={`rank-${i}-name`}
              placeholder="Tier name"
              value={r.name}
              onChange={(e) => setRank(i, { name: e.target.value })}
            />
            <input
              aria-label={`rank-${i}-min`}
              type="number"
              placeholder="min"
              value={r.min}
              onChange={(e) => setRank(i, { min: e.target.value })}
            />
            <input
              aria-label={`rank-${i}-max`}
              type="number"
              placeholder="max"
              value={r.max}
              onChange={(e) => setRank(i, { max: e.target.value })}
            />
            <input
              aria-label={`rank-${i}-effect`}
              placeholder="effect (optional)"
              value={r.effect || ''}
              onChange={(e) => setRank(i, { effect: e.target.value })}
            />
            <button className="btn-small btn-danger" onClick={() => removeRank(i)}>
              Remove
            </button>
          </div>
        ))}
        <button className="btn-small btn-secondary" onClick={addRank}>
          Add tier
        </button>
      </div>

      {error && <p className="gm-warn" role="alert">{error}</p>}
      <div className="gm-actions">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {isNew ? 'Create faction' : 'Save'}
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
          collection="faction"
          id={f.id}
          name={f.name}
          onClose={() => setShowHistory(false)}
          onRestored={(doc) => {
            setShowHistory(false);
            if (doc) setF(doc);
            setError(null);
            onRestored();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={confirm?.kind === 'delete'}
        title="Delete faction"
        message={`Permanently delete the faction "${f.name}". This cannot be undone — restore it from History if you have it.`}
        confirmLabel="Delete forever"
        requireType={f.name}
        onConfirm={doRemove}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'collision'}
        title="Overwrite existing entry?"
        message={`A faction with id "${confirm?.id}" already exists. Saving will overwrite it.`}
        confirmLabel="Overwrite"
        onConfirm={() => submit(confirm.id, confirm.payload)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

const GmReputation = () => {
  const { reputation } = useContent();
  const factions = Array.isArray(reputation?.Factions) ? reputation.Factions : [];
  const existingIds = existingIdSet(factions);

  return (
    <div className="gm-reputation">
      <PageEditorShell
        entries={factions}
        nameOf={(f) => f.name}
        noun="faction"
        addLabel="+ New faction"
        renderDetail={(entry, isNew, callbacks) => (
          <FactionForm
            initial={isNew ? blankFaction() : entry}
            isNew={isNew}
            existingIds={existingIds}
            {...callbacks}
          />
        )}
      />
    </div>
  );
};

export default GmReputation;
