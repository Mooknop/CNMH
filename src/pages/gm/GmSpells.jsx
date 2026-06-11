import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import HistoryModal from '../../components/gm/HistoryModal';
import EffectsSubform, { effectsToForm, effectsFromForm } from '../../components/gm/EffectsSubform';
import {
  rollToForm, rollFromForm, RollSourceControl,
  foundryEffectToForm, foundryEffectFromForm, FoundryEffectControl,
  chainToForm, chainFromForm, ChainControl,
  frequencyRuleToForm, frequencyRuleFromForm, FrequencyRuleControl,
  immunityToForm, immunityFromForm, ImmunityControl,
} from '../../components/gm/AbilitySubforms';
import PageEditorShell from '../../components/gm/PageEditorShell';
import './gm.css';

// Spell catalog editor. Shape mirrors `src/data/spells.json` and the nested
// spell sub-form already used by GmItems for scroll/wand items: managed
// scalars + a `traits` CSV + a `heightened` rank→text list. Anything else
// (e.g. a `bloodline` flag on Dispel Magic) round-trips through a per-spell
// raw-JSON box, the same faithful pattern as elsewhere in GM Tools.

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
};
const toList = (csv) =>
  String(csv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const SPELL_STR = ['name', 'actions', 'range', 'area', 'targets', 'defense', 'duration', 'description'];

const toForm = (s) => {
  const src = s && typeof s === 'object' ? s : {};
  const rest = { ...src };
  ['id', ...SPELL_STR, 'level', 'traits', 'heightened', 'effects', 'roll', 'foundryEffect', 'chain', 'frequencyRule', 'immunity'].forEach((k) => delete rest[k]);
  const str = {};
  SPELL_STR.forEach((k) => {
    str[k] = src[k] != null ? String(src[k]) : '';
  });
  const heightened =
    src.heightened && typeof src.heightened === 'object'
      ? Object.entries(src.heightened).map(([key, text]) => ({ key, text: String(text) }))
      : [];
  const effects = effectsToForm(src.effects);
  return {
    id: src.id,
    str,
    level: src.level != null ? String(src.level) : '0',
    traits: Array.isArray(src.traits) ? src.traits.join(', ') : '',
    heightened,
    effects,
    roll: rollToForm(src.roll),
    foundryEffect: foundryEffectToForm(src.foundryEffect),
    chain: chainToForm(src.chain),
    frequencyRule: frequencyRuleToForm(src.frequencyRule),
    immunity: immunityToForm(src.immunity),
    restJson: JSON.stringify(rest, null, 2),
  };
};

const blankSpell = () => toForm({ effects: [] });

// Returns the rebuilt spell payload, or throws Error with a GM-readable message.
const fromForm = (f) => {
  if (!f.str.name.trim()) throw new Error('Spell name is required.');
  let rest;
  try {
    rest = f.restJson.trim() ? JSON.parse(f.restJson) : {};
  } catch {
    throw new Error(`Spell "${f.str.name}" has invalid JSON in its extra fields.`);
  }
  if (rest === null || typeof rest !== 'object' || Array.isArray(rest)) {
    throw new Error(`Spell "${f.str.name}" extra fields must be a JSON object.`);
  }
  const out = { ...rest };
  SPELL_STR.forEach((k) => {
    const v = f.str[k].trim();
    if (v) out[k] = v;
  });
  out.level = toInt(f.level);
  const traits = toList(f.traits);
  if (traits.length) out.traits = traits;
  const h = {};
  f.heightened.forEach((r) => {
    if (r.key.trim()) h[r.key.trim()] = r.text;
  });
  if (Object.keys(h).length) out.heightened = h;
  const effects = effectsFromForm(f.effects);
  if (effects.length) out.effects = effects;
  const roll = rollFromForm(f.roll);
  if (roll) out.roll = roll;
  const foundryEffect = foundryEffectFromForm(f.foundryEffect);
  if (foundryEffect) out.foundryEffect = foundryEffect;
  const chain = chainFromForm(f.chain);
  if (chain) out.chain = chain;
  const frequencyRule = frequencyRuleFromForm(f.frequencyRule);
  if (frequencyRule) out.frequencyRule = frequencyRule;
  const immunity = immunityFromForm(f.immunity);
  if (immunity) out.immunity = immunity;
  return out;
};

const SpellForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const [e, setE] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // null | {kind:'delete'} | {kind:'collision',id,payload}
  const [showHistory, setShowHistory] = useState(false);

  const setStr = (k, v) => setE((cur) => ({ ...cur, str: { ...cur.str, [k]: v } }));
  const set = (patch) => setE((cur) => ({ ...cur, ...patch }));
  const setH = (i, patch) =>
    setE((cur) => ({
      ...cur,
      heightened: cur.heightened.map((h, idx) => (idx === i ? { ...h, ...patch } : h)),
    }));
  const addH = () =>
    setE((cur) => ({ ...cur, heightened: [...cur.heightened, { key: '', text: '' }] }));
  const rmH = (i) =>
    setE((cur) => ({ ...cur, heightened: cur.heightened.filter((_, idx) => idx !== i) }));

  const submit = async (id, payload) => {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await saveDocument('spell', id, payload);
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
      await deleteDocument('spell', e.id);
      onSaved(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-card" data-testid={`spell-form-${e.id || 'new'}`}>
      <div className="gm-row">
        <div className="form-group">
          <label>Name</label>
          <input
            aria-label="name"
            value={e.str.name}
            onChange={(ev) => setStr('name', ev.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Level</label>
          <input
            aria-label="level"
            type="number"
            value={e.level}
            onChange={(ev) => set({ level: ev.target.value })}
          />
        </div>
      </div>
      <div className="form-group">
        <label>Traits (comma-separated)</label>
        <input
          aria-label="traits"
          value={e.traits}
          onChange={(ev) => set({ traits: ev.target.value })}
        />
      </div>
      <div className="gm-row">
        {['actions', 'range', 'area', 'targets', 'defense', 'duration'].map((k) => (
          <div className="form-group" key={k}>
            <label>{k}</label>
            <input
              aria-label={k}
              value={e.str[k]}
              onChange={(ev) => setStr(k, ev.target.value)}
            />
          </div>
        ))}
      </div>
      <RollSourceControl
        value={e.roll || rollToForm(null)}
        idPrefix="spell"
        onChange={(r) => set({ roll: r })}
      />
      <FoundryEffectControl
        value={e.foundryEffect || foundryEffectToForm(null)}
        idPrefix="spell"
        onChange={(fe) => set({ foundryEffect: fe })}
      />
      <ChainControl
        value={e.chain || chainToForm(null)}
        idPrefix="spell"
        onChange={(c) => set({ chain: c })}
      />
      <FrequencyRuleControl
        value={e.frequencyRule || frequencyRuleToForm(null)}
        idPrefix="spell"
        onChange={(r) => set({ frequencyRule: r })}
      />
      <ImmunityControl
        value={e.immunity || immunityToForm(null)}
        idPrefix="spell"
        onChange={(imm) => set({ immunity: imm })}
      />
      <div className="form-group">
        <label>Description</label>
        <textarea
          aria-label="description"
          rows={5}
          value={e.str.description}
          onChange={(ev) => setStr('description', ev.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Heightened</label>
        {e.heightened.map((h, i) => (
          <div key={i} className="gm-row gm-rank-row">
            <input
              aria-label={`heightened-${i}-key`}
              placeholder="e.g. 3rd / +1"
              value={h.key}
              onChange={(ev) => setH(i, { key: ev.target.value })}
            />
            <input
              aria-label={`heightened-${i}-text`}
              placeholder="effect"
              value={h.text}
              onChange={(ev) => setH(i, { text: ev.target.value })}
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
      <EffectsSubform
        value={e.effects || []}
        onChange={(next) => set({ effects: next })}
        idPrefix=""
      />

      <div className="form-group">
        <label>Extra fields — bloodline, anything else (raw JSON)</label>
        <textarea
          aria-label="rest-json"
          className="gm-json"
          rows={4}
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
          {isNew ? 'Create spell' : 'Save'}
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
          collection="spell"
          id={e.id}
          name={e.str.name}
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
        title="Delete spell"
        message={`Permanently delete the spell "${e.str.name}". Scrolls, wands, and staves that reference it will show "(unknown spell)" until repointed. This cannot be undone — restore it from History if you have it.`}
        confirmLabel="Delete forever"
        requireType={e.str.name}
        onConfirm={doRemove}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'collision'}
        title="Overwrite existing spell?"
        message={`A spell with id "${confirm?.id}" already exists. Saving will overwrite it.`}
        confirmLabel="Overwrite"
        onConfirm={() => submit(confirm.id, confirm.payload)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

const GmSpells = () => {
  const { spells } = useContent();
  const catalog = useMemo(() => (Array.isArray(spells) ? spells : []), [spells]);
  const existingIds = useMemo(() => existingIdSet(catalog), [catalog]);

  const sorted = useMemo(
    () =>
      catalog.slice().sort((a, b) => {
        const al = a.level != null ? a.level : 0;
        const bl = b.level != null ? b.level : 0;
        if (al !== bl) return al - bl;
        return String(a.name || a.id).toLowerCase().localeCompare(String(b.name || b.id).toLowerCase());
      }),
    [catalog]
  );

  return (
    <div className="gm-spells">
      <PageEditorShell
        entries={sorted}
        nameOf={(s) => s.name}
        noun="spell"
        addLabel="+ New spell"
        filterEntry={(s, q) =>
          [s.name, s.id, ...(s.traits || [])]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        }
        renderDetail={(entry, isNew, callbacks) => (
          <SpellForm
            initial={isNew ? blankSpell() : toForm(entry)}
            isNew={isNew}
            existingIds={existingIds}
            {...callbacks}
          />
        )}
      />
    </div>
  );
};

export default GmSpells;
