import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import { useGmEntryForm } from '../../hooks/useGmEntryForm';
import GmEntryDialogs from '../../components/gm/GmEntryDialogs';
import PageEditorShell from '../../components/gm/PageEditorShell';
import { SKILL_KEYS } from '../../utils/EffectUtils';
import './gm.css';

// Effect catalog editor. Shape mirrors src/data/pf2eEffects.js:
//   id, name, description, modifiers: [{ stat, kind, amount, vs? }]
// `amount` may be negative (penalties) and `vs` scopes the modifier to a
// context (e.g. 'poison') — both #338.

const STAT_OPTIONS = [
  'ac', 'fort', 'reflex', 'will',
  'meleeAttack', 'rangedAttack', 'spellAttack',
  'attacks', // fans out to every attack stat (#274)
  'spellDC', 'classDC', 'perception', 'speed',
  'dexCap', // raises/lowers the Dex cap on AC — a ceiling, not an additive bonus (#507)
  'skills', // fans out to every skill
  ...SKILL_KEYS,
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
          vs: m.vs || '',
        }))
      : [],
  };
};

const blankEffect = () => toForm({});

const fromForm = (f) => {
  if (!f.name.trim()) throw new Error('Effect name is required.');
  const modifiers = f.modifiers
    .filter((m) => m.stat)
    .map((m) => {
      const mod = {
        stat: m.stat,
        kind: m.kind,
        amount: parseFloat(m.amount) || 0,
      };
      const vs = (m.vs || '').trim();
      if (vs) mod.vs = vs;
      return mod;
    });
  return {
    name: f.name.trim(),
    description: f.description.trim(),
    modifiers,
  };
};

const EffectForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const [e, setE] = useState(initial);
  const form = useGmEntryForm({ collection: 'effect', isNew, existingIds, onSaved });

  const set = (patch) => setE((cur) => ({ ...cur, ...patch }));
  const setMod = (i, patch) =>
    setE((cur) => ({
      ...cur,
      modifiers: cur.modifiers.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    }));
  const addMod = () =>
    setE((cur) => ({
      ...cur,
      modifiers: [...cur.modifiers, { stat: STAT_OPTIONS[0], kind: KIND_OPTIONS[0], amount: '1', vs: '' }],
    }));
  const rmMod = (i) =>
    setE((cur) => ({ ...cur, modifiers: cur.modifiers.filter((_, idx) => idx !== i) }));

  const save = async () => {
    let body;
    try {
      body = fromForm(e);
    } catch (err) {
      form.setError(err.message);
      return;
    }
    const id = e.id || slugify(body.name);
    await form.save(id, { ...body, id });
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
              value={m.amount}
              onChange={(ev) => setMod(i, { amount: ev.target.value })}
            />
            <input
              aria-label={`modifier-${i}-vs`}
              type="text"
              placeholder="vs (e.g. poison) — optional"
              value={m.vs}
              onChange={(ev) => setMod(i, { vs: ev.target.value })}
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

      {form.error && (
        <p className="gm-warn" role="alert">{form.error}</p>
      )}

      <div className="gm-actions">
        <button className="btn-primary" disabled={form.busy} onClick={save}>
          {isNew ? 'Create effect' : 'Save'}
        </button>
        {!isNew && (
          <>
            <button className="btn-secondary" disabled={form.busy} onClick={() => form.setShowHistory(true)}>
              History
            </button>
            <button
              className="btn-danger"
              disabled={form.busy}
              onClick={form.requestDelete}
            >
              Delete
            </button>
          </>
        )}
      </div>

      <GmEntryDialogs
        form={form}
        collection="effect"
        noun="effect"
        id={e.id}
        name={e.name}
        isNew={isNew}
        onRestored={(doc) => {
          if (doc) setE(toForm(doc));
          onRestored();
        }}
      />
    </div>
  );
};

const GmEffects = () => {
  const { effects } = useContent();
  const catalog = useMemo(() => (Array.isArray(effects) ? effects : []), [effects]);
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
    <div className="gm-effects">
      <PageEditorShell
        entries={sorted}
        nameOf={(e) => e.name}
        noun="effect"
        addLabel="+ New effect"
        filterEntry={(e, q) =>
          [e.name, e.id, e.description]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        }
        renderDetail={(entry, isNew, callbacks) => (
          <EffectForm
            initial={isNew ? blankEffect() : toForm(entry)}
            isNew={isNew}
            existingIds={existingIds}
            {...callbacks}
          />
        )}
      />
    </div>
  );
};

export default GmEffects;
