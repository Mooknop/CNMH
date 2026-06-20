import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import { DAMAGE_TYPES } from '../../utils/damage';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import HistoryModal from '../../components/gm/HistoryModal';
import PageEditorShell from '../../components/gm/PageEditorShell';
import './gm.css';

// Property-rune catalog editor (#548 Slice 3b). Rune shape (src/data/pf2eRunes.js):
//   { id, type:'property', name, level, price, description,
//     rider: { vsTrait?, persistent?, damageType?, onCrit?: { conditions: [{name,value,duration}] } } }
// The rich rider is folded into the #222 damage step by
// weaponRunes.translatePropertyRider — this editor authors it with structured
// controls (no raw-JSON box). Potency/striking tiers are NOT runes here; they
// live as fixed tables in weaponRunes.js and are authored per-weapon in GmItems.

// Crit-condition durations the damage step phrases (weaponRunes.conditionPhrase).
const DURATIONS = [
  { value: '', label: '— (no duration)' },
  { value: 'end-of-next-turn', label: 'until the end of your next turn' },
  { value: 'while-persistent', label: 'while the persistent damage continues' },
];

const toForm = (r) => {
  const src = r && typeof r === 'object' ? r : {};
  const rd = src.rider && typeof src.rider === 'object' ? src.rider : {};
  return {
    id: src.id,
    name: src.name || '',
    level: src.level != null ? String(src.level) : '',
    price: src.price != null ? String(src.price) : '',
    description: src.description || '',
    vsTrait: rd.vsTrait || '',
    persistent: rd.persistent || '',
    damageType: rd.damageType || '',
    conditions: Array.isArray(rd.onCrit?.conditions)
      ? rd.onCrit.conditions.map((c) => ({
          name: c.name || '',
          value: c.value != null ? String(c.value) : '',
          duration: c.duration || '',
        }))
      : [],
  };
};

const blankRune = () => toForm({});
const blankCondition = () => ({ name: '', value: '1', duration: 'end-of-next-turn' });

const fromForm = (f) => {
  if (!f.name.trim()) throw new Error('Rune name is required.');

  const rider = {};
  if (f.vsTrait.trim()) rider.vsTrait = f.vsTrait.trim().toLowerCase();
  if (f.persistent.trim()) {
    rider.persistent = f.persistent.trim();
    if (f.damageType.trim()) rider.damageType = f.damageType.trim();
  }
  const conditions = f.conditions
    .filter((c) => c.name.trim())
    .map((c) => {
      const out = { name: c.name.trim() };
      const v = parseInt(c.value, 10);
      if (!Number.isNaN(v)) out.value = v;
      if (c.duration.trim()) out.duration = c.duration.trim();
      return out;
    });
  if (conditions.length) rider.onCrit = { conditions };

  const out = { type: 'property', name: f.name.trim() };
  const level = parseInt(f.level, 10);
  if (!Number.isNaN(level)) out.level = level;
  const price = parseFloat(f.price);
  if (!Number.isNaN(price)) out.price = price;
  if (f.description.trim()) out.description = f.description.trim();
  if (Object.keys(rider).length) out.rider = rider;
  return out;
};

const RuneForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const [e, setE] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  const set = (patch) => setE((cur) => ({ ...cur, ...patch }));
  const setCond = (i, patch) =>
    setE((cur) => ({
      ...cur,
      conditions: cur.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    }));
  const addCond = () => setE((cur) => ({ ...cur, conditions: [...cur.conditions, blankCondition()] }));
  const rmCond = (i) =>
    setE((cur) => ({ ...cur, conditions: cur.conditions.filter((_, idx) => idx !== i) }));

  const submit = async (id, payload) => {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await saveDocument('rune', id, payload);
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
      await deleteDocument('rune', e.id);
      onSaved(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-card" data-testid={`rune-form-${e.id || 'new'}`}>
      <div className="gm-row">
        <div className="form-group">
          <label>Name</label>
          <input aria-label="name" value={e.name} onChange={(ev) => set({ name: ev.target.value })} />
        </div>
        <div className="form-group">
          <label>level</label>
          <input
            aria-label="level"
            type="number"
            value={e.level}
            onChange={(ev) => set({ level: ev.target.value })}
          />
        </div>
        <div className="form-group">
          <label>price (gp)</label>
          <input
            aria-label="price"
            type="number"
            value={e.price}
            onChange={(ev) => set({ price: ev.target.value })}
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

      <div className="gm-card" data-testid="rune-rider">
        <p className="gm-count">Rider — folded into the damage step</p>
        <div className="gm-row">
          <div className="form-group">
            <label>only vs trait (optional)</label>
            <input
              aria-label="rider-vsTrait"
              placeholder="e.g. undead"
              value={e.vsTrait}
              onChange={(ev) => set({ vsTrait: ev.target.value })}
            />
          </div>
          <div className="form-group">
            <label>persistent damage (optional)</label>
            <input
              aria-label="rider-persistent"
              placeholder="e.g. 1d6"
              value={e.persistent}
              onChange={(ev) => set({ persistent: ev.target.value })}
            />
          </div>
          <div className="form-group">
            <label>damage type</label>
            <select
              aria-label="rider-damageType"
              value={e.damageType}
              disabled={!e.persistent.trim()}
              onChange={(ev) => set({ damageType: ev.target.value })}
            >
              <option value="">—</option>
              {DAMAGE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group" data-testid="rune-crit-conditions">
          <label>on critical hit — conditions</label>
          {e.conditions.map((c, i) => (
            <div key={i} className="gm-row gm-rank-row">
              <input
                aria-label={`condition-${i}-name`}
                placeholder="condition (e.g. enfeebled)"
                value={c.name}
                onChange={(ev) => setCond(i, { name: ev.target.value })}
              />
              <input
                aria-label={`condition-${i}-value`}
                type="number"
                placeholder="value"
                value={c.value}
                onChange={(ev) => setCond(i, { value: ev.target.value })}
              />
              <select
                aria-label={`condition-${i}-duration`}
                value={c.duration}
                onChange={(ev) => setCond(i, { duration: ev.target.value })}
              >
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              <button className="btn-small btn-danger" onClick={() => rmCond(i)}>
                Remove
              </button>
            </div>
          ))}
          <button className="btn-small btn-secondary" onClick={addCond}>
            Add crit condition
          </button>
        </div>
      </div>

      {error && <p className="gm-warn" role="alert">{error}</p>}

      <div className="gm-actions">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {isNew ? 'Create rune' : 'Save'}
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
          collection="rune"
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
        title="Delete rune"
        message={`Permanently delete the rune "${e.name}". This cannot be undone.`}
        confirmLabel="Delete forever"
        requireType={e.name}
        onConfirm={doRemove}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'collision'}
        title="Overwrite existing rune?"
        message={`A rune with id "${confirm?.id}" already exists. Saving will overwrite it.`}
        confirmLabel="Overwrite"
        onConfirm={() => submit(confirm.id, confirm.payload)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

const GmRunes = () => {
  const { runes } = useContent();
  const catalog = useMemo(() => (Array.isArray(runes) ? runes : []), [runes]);
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
    <div className="gm-runes">
      <PageEditorShell
        entries={sorted}
        nameOf={(r) => r.name}
        noun="rune"
        addLabel="+ New rune"
        filterEntry={(r, q) =>
          [r.name, r.id, r.description]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        }
        renderDetail={(entry, isNew, callbacks) => (
          <RuneForm
            initial={isNew ? blankRune() : toForm(entry)}
            isNew={isNew}
            existingIds={existingIds}
            {...callbacks}
          />
        )}
      />
    </div>
  );
};

export default GmRunes;
