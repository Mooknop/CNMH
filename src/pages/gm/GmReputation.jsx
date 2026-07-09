import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import { useGmEntryForm } from '../../hooks/useGmEntryForm';
import GmEntryDialogs from '../../components/gm/GmEntryDialogs';
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
  const form = useGmEntryForm({ collection: 'faction', isNew, existingIds, onSaved });

  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const setRank = (i, patch) =>
    setF((cur) => ({
      ...cur,
      ranks: cur.ranks.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));
  const addRank = () => setF((cur) => ({ ...cur, ranks: [...(cur.ranks || []), blankRank()] }));
  const removeRank = (i) =>
    setF((cur) => ({ ...cur, ranks: cur.ranks.filter((_, idx) => idx !== i) }));

  const save = async () => {
    if (!f.name.trim()) {
      form.setError('Name is required.');
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
    await form.save(id, payload);
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

      {form.error && <p className="gm-warn" role="alert">{form.error}</p>}
      <div className="gm-actions">
        <button className="btn-primary" disabled={form.busy} onClick={save}>
          {isNew ? 'Create faction' : 'Save'}
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
        collection="faction"
        noun="faction"
        id={f.id}
        name={f.name}
        isNew={isNew}
        deleteMessage={`Permanently delete the faction "${f.name}". This cannot be undone — restore it from History if you have it.`}
        onRestored={(doc) => {
          if (doc) setF(doc);
          onRestored();
        }}
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
