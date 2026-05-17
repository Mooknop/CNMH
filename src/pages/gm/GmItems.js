import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import HistoryModal from '../../components/gm/HistoryModal';
import './gm.css';

// Slice 2: the shared item catalog editor. Catalog items hold ONLY the shared
// definition — name/price/weight/traits/description, a container's intrinsic
// {capacity,ignored} (never its per-character contents), and a scroll/wand's
// nested spell. Per-character data (quantity / invested / which container an
// item sits in) lives on the reference in a character's inventory, never here.
// Rare mechanical blocks (strikes/potency/shield/actions) round-trip through a
// per-item raw-JSON box, the same faithful pattern as the character editor.

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
};

// Prices/weights are often decimals (2.5, 0.1); keep them as floats.
const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

const toList = (csv) =>
  csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Managed scalar fields on a scroll/wand's nested spell. Anything else on the
// spell (id, etc.) is preserved verbatim through `rest`.
const SPELL_STR = ['name', 'actions', 'range', 'area', 'targets', 'defense', 'duration', 'description'];

const spellToForm = (s) => {
  const src = s && typeof s === 'object' ? s : {};
  const rest = { ...src };
  [...SPELL_STR, 'level', 'traits', 'heightened'].forEach((k) => delete rest[k]);
  const str = {};
  SPELL_STR.forEach((k) => {
    str[k] = src[k] != null ? String(src[k]) : '';
  });
  const heightened =
    src.heightened && typeof src.heightened === 'object'
      ? Object.entries(src.heightened).map(([key, text]) => ({ key, text: String(text) }))
      : [];
  return {
    str,
    level: src.level != null ? String(src.level) : '0',
    traits: Array.isArray(src.traits) ? src.traits.join(', ') : '',
    heightened,
    rest, // id + any unmanaged keys, preserved
  };
};

const spellFromForm = (sf) => {
  const out = { ...sf.rest };
  SPELL_STR.forEach((k) => {
    const v = sf.str[k].trim();
    if (v) out[k] = v;
  });
  out.level = toInt(sf.level);
  const traits = toList(sf.traits);
  if (traits.length) out.traits = traits;
  const h = {};
  sf.heightened.forEach((r) => {
    if (r.key.trim()) h[r.key.trim()] = r.text;
  });
  if (Object.keys(h).length) out.heightened = h;
  return out;
};

// Keys that must never appear in the raw-JSON box: per-character data belongs
// on the inventory reference, and containers / scroll / wand have dedicated UI.
const FORBIDDEN_REST = ['quantity', 'invested', 'contents', 'container', 'scroll', 'wand'];

const toForm = (it) => {
  const rest = { ...it };
  ['id', 'name', 'price', 'weight', 'traits', 'description', 'container', 'scroll', 'wand'].forEach(
    (k) => delete rest[k]
  );
  return {
    id: it.id,
    name: it.name != null ? String(it.name) : '',
    price: it.price != null ? String(it.price) : '',
    weight: it.weight != null ? String(it.weight) : '',
    traits: Array.isArray(it.traits) ? it.traits.join(', ') : '',
    description: it.description != null ? String(it.description) : '',
    hasContainer: !!it.container,
    containerCapacity:
      it.container && it.container.capacity != null ? String(it.container.capacity) : '',
    containerIgnored:
      it.container && it.container.ignored != null ? String(it.container.ignored) : '',
    spellKind: it.scroll ? 'scroll' : it.wand ? 'wand' : 'none',
    spell: spellToForm(it.scroll || it.wand || {}),
    restJson: JSON.stringify(rest, null, 2),
  };
};

const blankItem = () => toForm({});

// Returns the rebuilt catalog item, or throws Error with a GM-readable message.
const itemFromForm = (f) => {
  if (!f.name.trim()) throw new Error('Item name is required.');
  let rest;
  try {
    rest = f.restJson.trim() ? JSON.parse(f.restJson) : {};
  } catch {
    throw new Error(`Item “${f.name}” has invalid JSON in its extra fields.`);
  }
  if (rest === null || typeof rest !== 'object' || Array.isArray(rest)) {
    throw new Error(`Item “${f.name}” extra fields must be a JSON object.`);
  }
  const bad = FORBIDDEN_REST.filter((k) => k in rest);
  if (bad.length) {
    throw new Error(
      `Extra fields must not include ${bad.join(', ')}. ` +
        'Per-character data (quantity/invested/contents) lives on the inventory ' +
        'reference; containers and scroll/wand spells have dedicated fields.'
    );
  }

  const out = { ...rest, name: f.name.trim() };
  if (f.description.trim()) out.description = f.description.trim();
  const traits = toList(f.traits);
  if (traits.length) out.traits = traits;
  if (f.price.trim() !== '') out.price = toNum(f.price);
  if (f.weight.trim() !== '') out.weight = toNum(f.weight);

  if (f.hasContainer) {
    out.container = {
      capacity: toInt(f.containerCapacity),
      ignored: toInt(f.containerIgnored),
    };
  }

  if (f.spellKind === 'scroll' || f.spellKind === 'wand') {
    if (!f.spell.str.name.trim()) {
      throw new Error(`The ${f.spellKind} spell on “${f.name}” needs a name.`);
    }
    out[f.spellKind] = spellFromForm(f.spell);
  }

  return out;
};

const SpellSubform = ({ kind, spell, onChange }) => {
  const setStr = (k, v) => onChange({ ...spell, str: { ...spell.str, [k]: v } });
  const setH = (i, patch) =>
    onChange({
      ...spell,
      heightened: spell.heightened.map((h, idx) => (idx === i ? { ...h, ...patch } : h)),
    });
  const addH = () => onChange({ ...spell, heightened: [...spell.heightened, { key: '', text: '' }] });
  const rmH = (i) =>
    onChange({ ...spell, heightened: spell.heightened.filter((_, idx) => idx !== i) });

  return (
    <div className="gm-card" data-testid="spell-subform">
      <p className="gm-count">{kind === 'scroll' ? 'Scroll' : 'Wand'} spell</p>
      <div className="gm-row">
        <div className="form-group">
          <label>spell name</label>
          <input
            aria-label="spell-name"
            value={spell.str.name}
            onChange={(e) => setStr('name', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>level</label>
          <input
            aria-label="spell-level"
            type="number"
            value={spell.level}
            onChange={(e) => onChange({ ...spell, level: e.target.value })}
          />
        </div>
      </div>
      <div className="gm-row">
        {['actions', 'range', 'area', 'targets', 'defense', 'duration'].map((k) => (
          <div className="form-group" key={k}>
            <label>{k}</label>
            <input
              aria-label={`spell-${k}`}
              value={spell.str[k]}
              onChange={(e) => setStr(k, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="form-group">
        <label>traits (comma-separated)</label>
        <input
          aria-label="spell-traits"
          value={spell.traits}
          onChange={(e) => onChange({ ...spell, traits: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>description</label>
        <textarea
          aria-label="spell-description"
          rows={3}
          value={spell.str.description}
          onChange={(e) => setStr('description', e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>heightened</label>
        {spell.heightened.map((h, i) => (
          <div key={i} className="gm-row gm-rank-row">
            <input
              aria-label={`spell-h-${i}-key`}
              placeholder="e.g. 3rd / +1"
              value={h.key}
              onChange={(e) => setH(i, { key: e.target.value })}
            />
            <input
              aria-label={`spell-h-${i}-text`}
              placeholder="effect"
              value={h.text}
              onChange={(e) => setH(i, { text: e.target.value })}
            />
            <button className="btn-small btn-danger" onClick={() => rmH(i)}>
              Remove
            </button>
          </div>
        ))}
        <button className="btn-small btn-secondary" onClick={addH}>
          Add heightened
        </button>
      </div>
    </div>
  );
};

const ItemForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const [e, setE] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // null | {kind:'delete'} | {kind:'collision',id,payload}
  const [showHistory, setShowHistory] = useState(false);

  const set = (patch) => setE((cur) => ({ ...cur, ...patch }));

  const submit = async (id, payload) => {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await saveDocument('item', id, payload);
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
      body = itemFromForm(e);
    } catch (err) {
      setError(err.message);
      return;
    }
    const id = e.id || slugify(e.name);
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
      await deleteDocument('item', e.id);
      onSaved(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-card" data-testid={`item-form-${e.id || 'new'}`}>
      <div className="gm-row">
        <div className="form-group">
          <label>Name</label>
          <input aria-label="name" value={e.name} onChange={(ev) => set({ name: ev.target.value })} />
        </div>
        <div className="form-group">
          <label>price</label>
          <input
            aria-label="price"
            type="number"
            value={e.price}
            onChange={(ev) => set({ price: ev.target.value })}
          />
        </div>
        <div className="form-group">
          <label>weight (Bulk)</label>
          <input
            aria-label="weight"
            type="number"
            value={e.weight}
            onChange={(ev) => set({ weight: ev.target.value })}
          />
        </div>
      </div>

      <div className="form-group">
        <label>traits (comma-separated)</label>
        <input aria-label="traits" value={e.traits} onChange={(ev) => set({ traits: ev.target.value })} />
      </div>
      <div className="form-group">
        <label>description</label>
        <textarea
          aria-label="description"
          rows={4}
          value={e.description}
          onChange={(ev) => set({ description: ev.target.value })}
        />
      </div>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            aria-label="is-container"
            checked={e.hasContainer}
            onChange={(ev) => set({ hasContainer: ev.target.checked })}
          />{' '}
          This item is a container
        </label>
      </div>
      {e.hasContainer && (
        <div className="gm-row">
          <div className="form-group">
            <label>capacity (Bulk)</label>
            <input
              aria-label="container-capacity"
              type="number"
              value={e.containerCapacity}
              onChange={(ev) => set({ containerCapacity: ev.target.value })}
            />
          </div>
          <div className="form-group">
            <label>ignored (Bulk)</label>
            <input
              aria-label="container-ignored"
              type="number"
              value={e.containerIgnored}
              onChange={(ev) => set({ containerIgnored: ev.target.value })}
            />
          </div>
        </div>
      )}

      <div className="form-group">
        <label>scroll / wand</label>
        <select
          aria-label="spell-kind"
          value={e.spellKind}
          onChange={(ev) => set({ spellKind: ev.target.value })}
        >
          <option value="none">none</option>
          <option value="scroll">scroll (nested spell)</option>
          <option value="wand">wand (nested spell)</option>
        </select>
      </div>
      {e.spellKind !== 'none' && (
        <SpellSubform
          kind={e.spellKind}
          spell={e.spell}
          onChange={(spell) => set({ spell })}
        />
      )}

      <div className="form-group">
        <label>extra fields — strikes, potency, shield, actions… (raw JSON)</label>
        <textarea
          aria-label="rest-json"
          className="gm-json"
          rows={5}
          value={e.restJson}
          onChange={(ev) => set({ restJson: ev.target.value })}
        />
      </div>

      {error && (
        <p className="gm-warn" role="alert">
          {error}
        </p>
      )}
      <div className="gm-actions">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {isNew ? 'Create item' : 'Save'}
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
          collection="item"
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
        title="Delete catalog item"
        message={`Permanently delete the catalog item “${e.name}”. Characters that reference it will show “(unknown item)” until repointed. This cannot be undone — restore it from History if you have it.`}
        confirmLabel="Delete forever"
        requireType={e.name}
        onConfirm={doRemove}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'collision'}
        title="Overwrite existing item?"
        message={`A catalog item with id “${confirm?.id}” already exists. Saving will overwrite it.`}
        confirmLabel="Overwrite"
        onConfirm={() => submit(confirm.id, confirm.payload)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

const GmItems = () => {
  const { items } = useContent();
  const catalog = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const existingIds = useMemo(() => existingIdSet(catalog), [catalog]);
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState(null);
  const [query, setQuery] = useState('');

  const onSaved = (wasNew) => {
    if (wasNew) setAdding(false);
    setFlash('Saved. Changes are live for every connected player.');
  };
  const onRestored = () => setFlash('Restored. Changes are live for every connected player.');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((it) =>
      [it.name, it.id, ...(it.traits || [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [catalog, query]);

  return (
    <div className="gm-items">
      {flash && (
        <p className="gm-ok" role="status">
          {flash}
        </p>
      )}

      <div className="form-group">
        <input
          aria-label="filter"
          placeholder={`Filter ${catalog.length} catalog items by name, trait or id…`}
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
        />
      </div>

      {adding ? (
        <ItemForm
          initial={blankItem()}
          isNew
          existingIds={existingIds}
          onSaved={onSaved}
          onRestored={onRestored}
        />
      ) : (
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + New item
        </button>
      )}

      <p className="gm-count">
        Showing {filtered.length} of {catalog.length}
      </p>
      <div className="gm-items-list">
        {filtered.map((it) => (
          <ItemForm
            key={it.id}
            initial={toForm(it)}
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

export default GmItems;
