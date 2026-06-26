import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import HistoryModal from '../../components/gm/HistoryModal';
import PageEditorShell from '../../components/gm/PageEditorShell';
import './gm.css';

// Armor property-rune catalog editor (#727, R3). Armor runes share the `rune`
// collection with weapon runes but are flagged armorRune:true — the etch
// discriminator GmItems filters on, and the split that keeps these two editors
// apart (GmRunes shows the rest). Rune shape (src/data/armorRunes.js):
//   { id, type:'property', armorRune:true, name, level, price, description,
//     modifiers?: [{ stat, kind, amount }], riders?: [{ id, text }] }
// `modifiers` fold onto the sheet through useWornGear (#726); `riders` are
// passive reminders with no engine side-effect. Potency/resilient are
// fundamental runes (fixed tables in utils/armorRunes.js), authored per-armor in
// GmItems — not catalog entries here.

// Stats the worn-gear / effect engine can model. AC + saves apply today; skills
// light up with W2 (#731). Authored as a dropdown so there's no raw-JSON box.
const MODIFIER_STATS = [
  'ac', 'fort', 'reflex', 'will', 'perception',
  'acrobatics', 'arcana', 'athletics', 'crafting', 'deception', 'diplomacy',
  'intimidation', 'medicine', 'nature', 'occultism', 'performance', 'religion',
  'society', 'stealth', 'survival', 'thievery',
];
const MODIFIER_KINDS = ['item', 'status', 'circumstance'];

const toForm = (r) => {
  const src = r && typeof r === 'object' ? r : {};
  return {
    id: src.id,
    name: src.name || '',
    level: src.level != null ? String(src.level) : '',
    price: src.price != null ? String(src.price) : '',
    description: src.description || '',
    modifiers: Array.isArray(src.modifiers)
      ? src.modifiers.map((m) => ({
          stat: m.stat || 'ac',
          kind: m.kind || 'item',
          amount: m.amount != null ? String(m.amount) : '',
        }))
      : [],
    reminders: Array.isArray(src.riders)
      ? src.riders.map((rd) => (typeof rd === 'string' ? rd : rd?.text || '')).filter(Boolean)
      : [],
  };
};

const blankRune = () => toForm({});
const blankModifier = () => ({ stat: 'ac', kind: 'item', amount: '1' });

const fromForm = (f) => {
  if (!f.name.trim()) throw new Error('Rune name is required.');
  const out = { type: 'property', armorRune: true, name: f.name.trim() };
  const level = parseInt(f.level, 10);
  if (!Number.isNaN(level)) out.level = level;
  const price = parseFloat(f.price);
  if (!Number.isNaN(price)) out.price = price;
  if (f.description.trim()) out.description = f.description.trim();

  const modifiers = f.modifiers
    .map((m) => ({ stat: m.stat, kind: m.kind, amount: parseInt(m.amount, 10) }))
    .filter((m) => m.stat && m.kind && !Number.isNaN(m.amount));
  if (modifiers.length) out.modifiers = modifiers;

  const id = f.id || slugify(out.name);
  const riders = f.reminders
    .map((t) => String(t).trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `${id}-reminder-${i}`, text }));
  if (riders.length) out.riders = riders;
  return out;
};

const RuneForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
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
  const addMod = () => setE((cur) => ({ ...cur, modifiers: [...cur.modifiers, blankModifier()] }));
  const rmMod = (i) =>
    setE((cur) => ({ ...cur, modifiers: cur.modifiers.filter((_, idx) => idx !== i) }));
  const setReminder = (i, text) =>
    setE((cur) => ({ ...cur, reminders: cur.reminders.map((r, idx) => (idx === i ? text : r)) }));
  const addReminder = () => setE((cur) => ({ ...cur, reminders: [...cur.reminders, ''] }));
  const rmReminder = (i) =>
    setE((cur) => ({ ...cur, reminders: cur.reminders.filter((_, idx) => idx !== i) }));

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
    <div className="gm-card" data-testid={`armor-rune-form-${e.id || 'new'}`}>
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

      <div className="gm-card" data-testid="armor-rune-modifiers">
        <p className="gm-count">Modifiers — fold onto the sheet via worn gear (AC/saves now, skills with W2)</p>
        {e.modifiers.map((m, i) => (
          <div key={i} className="gm-row gm-rank-row">
            <select
              aria-label={`modifier-${i}-stat`}
              value={m.stat}
              onChange={(ev) => setMod(i, { stat: ev.target.value })}
            >
              {MODIFIER_STATS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label={`modifier-${i}-kind`}
              value={m.kind}
              onChange={(ev) => setMod(i, { kind: ev.target.value })}
            >
              {MODIFIER_KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <input
              aria-label={`modifier-${i}-amount`}
              type="number"
              placeholder="amount"
              value={m.amount}
              onChange={(ev) => setMod(i, { amount: ev.target.value })}
            />
            <button className="btn-small btn-danger" onClick={() => rmMod(i)}>Remove</button>
          </div>
        ))}
        <button className="btn-small btn-secondary" onClick={addMod}>Add modifier</button>
      </div>

      <div className="gm-card" data-testid="armor-rune-reminders">
        <p className="gm-count">Reminders — passive notes, no engine effect</p>
        {e.reminders.map((text, i) => (
          <div key={i} className="gm-row gm-rank-row">
            <input
              aria-label={`reminder-${i}`}
              value={text}
              onChange={(ev) => setReminder(i, ev.target.value)}
            />
            <button className="btn-small btn-danger" onClick={() => rmReminder(i)}>Remove</button>
          </div>
        ))}
        <button className="btn-small btn-secondary" onClick={addReminder}>Add reminder</button>
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
        title="Delete armor rune"
        message={`Permanently delete the rune "${e.name}". This cannot be undone. (A standard seeded rune will reappear from the bootstrap catalog.)`}
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

const GmArmorRunes = () => {
  const { runes } = useContent();
  // Only armor runes — weapon property runes live in GmRunes.
  const catalog = useMemo(
    () => (Array.isArray(runes) ? runes : []).filter((r) => r && r.armorRune),
    [runes]
  );
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
    <div className="gm-armor-runes">
      <PageEditorShell
        entries={sorted}
        nameOf={(r) => r.name}
        noun="armor rune"
        addLabel="+ New armor rune"
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

export default GmArmorRunes;
