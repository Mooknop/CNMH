import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import HistoryModal from '../../components/gm/HistoryModal';
import './gm.css';

// Effect catalog editor. Shape mirrors src/data/pf2eEffects.js:
//   id, name, description, modifiers: [{ stat, kind, amount }]

const STAT_OPTIONS = [
  'ac', 'fort', 'reflex', 'will',
  'meleeAttack', 'rangedAttack', 'spellAttack',
  'spellDC', 'classDC', 'perception', 'speed',
];

const KIND_OPTIONS = ['status', 'circumstance', 'item'];

const toForm = (e) => {
  const src = e && typeof e === 'object' ? e : {};
  return {
    id: src.id,
    name: src.name || '',
    description: src.description || '',
    modifiers: Array.isArray(src.modifiers)
      ? src.modifiers.map((m) => ({
          stat: m.stat || STAT_OPTIONS[0],
          kind: m.kind || KIND_OPTIONS[0],
          amount: m.amount != null ? String(m.amount) : '0',
        }))
      : [],
  };
};

const blankEffect = () => toForm({});

const fromForm = (f) => {
  if (!f.name.trim()) throw new Error('Effect name is required.');
  const modifiers = f.modifiers
    .filter((m) => m.stat)
    .map((m) => ({
      stat: m.stat,
      kind: m.kind,
      amount: parseFloat(m.amount) || 0,
    }));
  return {
    name: f.name.trim(),
    description: f.description.trim(),
    modifiers,
  };
};

const EffectForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const [e, setE] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  const set = (patch) => setE((cur) => ({ ...cur, ...patch }));
  const setMod = (i, patch) =>
    setE((cur) => ({
      ...cur,
      modifiers: cur.modifiers.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    }));
  const addMod = () =>
    setE((cur) => ({
      ...cur,
      modifiers: [...cur.modifiers, { stat: STAT_OPTIONS[0], kind: KIND_OPTIONS[0], amount: '1' }],
    }));
  const rmMod = (i) =>
    setE((cur) => ({ ...cur, modifiers: cur.modifiers.filter((_, idx) => idx !== i) }));

  const submit = async (id, payload) => {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await saveDocument('effect', id, payload);
      onSaved(isNew);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    let body;
    try {
      body = fromForm(e);
    } catch (err) {
      setError(err.message);
      return;
    }
    const id = e.id || slugify(body.name);
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
      await deleteDocument('effect', e.id);
      onSaved(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-card" data-testid={`effect-form-${e.id || 'new'}`}>
      <div className="gm-row">
        <div className="form-group">
          <label>Name</label>
          <input
            aria-label="name"
            value={e.name}
            onChange={(ev) => set({ name: ev.target.value })}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea
          aria-label="description"
          rows={3}
          value={e.description}
          onChange={(ev) => set({ description: ev.target.value })}
        />
      </div>

      <div className="form-group">
        <label>Modifiers</label>
        {e.modifiers.map((m, i) => (
          <div key={i} className="gm-row gm-rank-row">
            <select
              aria-label={`modifier-${i}-stat`}
              value={m.stat}
              onChange={(ev) => setMod(i, { stat: ev.target.value })}
            >
              {STAT_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label={`modifier-${i}-kind`}
              value={m.kind}
              onChange={(ev) => setMod(i, { kind: ev.target.value })}
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <input
              aria-label={`modifier-${i}-amount`}
              type="number"
              style={{ width: '70px' }}
              value={m.amount}
              onChange={(ev) => setMod(i, { amount: ev.target.value })}
            />
            <button className="btn-small btn-danger" onClick={() => rmMod(i)}>
              Remove
            </button>
          </div>
        ))}
        <button className="btn-small btn-secondary" onClick={addMod}>
          Add modifier
        </button>
      </div>

      {error && (
        <p className="gm-warn" role="alert">{error}</p>
      )}

      <div className="gm-actions">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {isNew ? 'Create effect' : 'Save'}
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
          collection="effect"
          id={e.id}
          name={e.name}
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
        title="Delete effect"
        message={`Permanently delete the effect "${e.name}". This cannot be undone.`}
        confirmLabel="Delete forever"
        requireType={e.name}
        onConfirm={doRemove}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'collision'}
        title="Overwrite existing effect?"
        message={`An effect with id "${confirm?.id}" already exists. Saving will overwrite it.`}
        confirmLabel="Overwrite"
        onConfirm={() => submit(confirm.id, confirm.payload)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

const GmEffects = () => {
  const { effects } = useContent();
  const catalog = useMemo(() => (Array.isArray(effects) ? effects : []), [effects]);
  const existingIds = useMemo(() => existingIdSet(catalog), [catalog]);
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState(null);
  const [query, setQuery] = useState('');

  const onSaved = (wasNew) => {
    if (wasNew) setAdding(false);
    setFlash('Saved. Changes are live for every connected player.');
  };
  const onRestored = () => setFlash('Restored. Changes are live for every connected player.');

  const sorted = useMemo(
    () => catalog.slice().sort((a, b) =>
      String(a.name || a.id).toLowerCase().localeCompare(String(b.name || b.id).toLowerCase())
    ),
    [catalog]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((e) =>
      [e.name, e.id, e.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [sorted, query]);

  return (
    <div className="gm-effects">
      {flash && (
        <p className="gm-ok" role="status">{flash}</p>
      )}

      <div className="form-group">
        <input
          aria-label="filter"
          placeholder={`Filter ${catalog.length} effects by name or id…`}
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
        />
      </div>

      {adding ? (
        <EffectForm
          initial={blankEffect()}
          isNew
          existingIds={existingIds}
          onSaved={onSaved}
          onRestored={onRestored}
        />
      ) : (
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + New effect
        </button>
      )}

      <p className="gm-count">
        Showing {filtered.length} of {catalog.length}
      </p>
      <div className="gm-effects-list">
        {filtered.map((e) => (
          <EffectForm
            key={e.id}
            initial={toForm(e)}
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

export default GmEffects;
