import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import HistoryModal from '../../components/gm/HistoryModal';
import PageEditorShell from '../../components/gm/PageEditorShell';
import './gm.css';

// Trait-definition editor. Shape is minimal: { id, name, description }.
// These definitions back the TraitModal opened from TraitTag — the comma-
// separated `traits` reference fields on items/spells resolve to them by name
// (a definition-backed picker for those references is tracked in #376).

const toForm = (t) => {
  const src = t && typeof t === 'object' ? t : {};
  return {
    id: src.id,
    name: src.name || '',
    description: src.description || '',
  };
};

const blankTrait = () => toForm({});

const fromForm = (f) => {
  if (!f.name.trim()) throw new Error('Trait name is required.');
  return {
    name: f.name.trim(),
    description: f.description.trim(),
  };
};

const TraitForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const [t, setT] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  const set = (patch) => setT((cur) => ({ ...cur, ...patch }));

  const submit = async (id, payload) => {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await saveDocument('trait', id, payload);
      onSaved(isNew, id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    let body;
    try {
      body = fromForm(t);
    } catch (err) {
      setError(err.message);
      return;
    }
    const id = t.id || slugify(body.name);
    const payload = { ...body, id };
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
      await deleteDocument('trait', t.id);
      onSaved(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-card" data-testid={`trait-form-${t.id || 'new'}`}>
      <div className="gm-row">
        <div className="form-group">
          <label>Name</label>
          <input
            aria-label="name"
            value={t.name}
            onChange={(ev) => set({ name: ev.target.value })}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea
          aria-label="description"
          rows={4}
          value={t.description}
          onChange={(ev) => set({ description: ev.target.value })}
        />
      </div>

      {error && (
        <p className="gm-warn" role="alert">{error}</p>
      )}

      <div className="gm-actions">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {isNew ? 'Create trait' : 'Save'}
        </button>
        {!isNew && (
          <>
            <button className="btn-secondary" disabled={busy} onClick={() => setShowHistory(true)}>
              History
            </button>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() => setConfirm({ kind: 'delete' })}
            >
              Delete
            </button>
          </>
        )}
      </div>

      {!isNew && (
        <HistoryModal
          isOpen={showHistory}
          collection="trait"
          id={t.id}
          name={t.name}
          onClose={() => setShowHistory(false)}
          onRestored={(doc) => {
            setShowHistory(false);
            if (doc) setT(toForm(doc));
            setError(null);
            onRestored();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={confirm?.kind === 'delete'}
        title="Delete trait"
        message={`Permanently delete the trait "${t.name}". This cannot be undone.`}
        confirmLabel="Delete forever"
        requireType={t.name}
        onConfirm={doRemove}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'collision'}
        title="Overwrite existing trait?"
        message={`A trait with id "${confirm?.id}" already exists. Saving will overwrite it.`}
        confirmLabel="Overwrite"
        onConfirm={() => submit(confirm.id, confirm.payload)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

const GmTraits = () => {
  const { traits } = useContent();
  const catalog = useMemo(() => (Array.isArray(traits) ? traits : []), [traits]);
  const existingIds = useMemo(() => existingIdSet(catalog), [catalog]);

  const sorted = useMemo(
    () =>
      catalog
        .slice()
        .sort((a, b) =>
          String(a.name || a.id).toLowerCase().localeCompare(String(b.name || b.id).toLowerCase())
        ),
    [catalog]
  );

  return (
    <div className="gm-traits">
      <PageEditorShell
        entries={sorted}
        nameOf={(t) => t.name}
        noun="trait"
        addLabel="+ New trait"
        filterEntry={(t, q) =>
          [t.name, t.id, t.description]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        }
        renderDetail={(entry, isNew, callbacks) => (
          <TraitForm
            initial={isNew ? blankTrait() : toForm(entry)}
            isNew={isNew}
            existingIds={existingIds}
            {...callbacks}
          />
        )}
      />
    </div>
  );
};

export default GmTraits;
