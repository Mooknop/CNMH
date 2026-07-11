import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import { runeTarget } from '../../utils/runeClassify';
import { ACCESSORY_TAGS } from '../../utils/accessoryRunes';
import { DAMAGE_TYPES } from '../../utils/damage';
import { useGmEntryForm } from '../../hooks/useGmEntryForm';
import GmEntryDialogs from '../../components/gm/GmEntryDialogs';
import PageEditorShell from '../../components/gm/PageEditorShell';
import RuneIcon from '../../components/shared/RuneIcon';
import { ArmorRuneForm, armorToForm, armorBlankRune, MODIFIER_STATS, MODIFIER_KINDS } from './GmArmorRunes';
import './gm.css';

// Property-rune catalog editor (#548 Slice 3b). Rune shape (src/data/pf2eRunes.js):
//   { id, type:'property', name, level, price, description,
//     rider: { vsTrait?, dice?, persistent?, damageType?,
//              onCrit?: { persistent?, conditions?: [{name,value,duration}] } } }
// `dice` is the immediate extra-dice form (#1019 — flaming's 1d6 fire, its own
// damage instance); `onCrit.persistent` is crit-only persistent damage
// (flaming's 1d10 persistent fire). Both share `damageType`.
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
    dice: rd.dice || '',
    persistent: rd.persistent || '',
    critPersistent: rd.onCrit?.persistent || '',
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
  if (f.dice.trim()) rider.dice = f.dice.trim();
  if (f.persistent.trim()) rider.persistent = f.persistent.trim();
  // damageType rides any of the damage forms (immediate dice, persistent,
  // crit persistent) — translatePropertyRider stamps it on each.
  if ((rider.dice || rider.persistent || f.critPersistent.trim()) && f.damageType.trim()) {
    rider.damageType = f.damageType.trim();
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
  const onCrit = {};
  if (f.critPersistent.trim()) onCrit.persistent = f.critPersistent.trim();
  if (conditions.length) onCrit.conditions = conditions;
  if (Object.keys(onCrit).length) rider.onCrit = onCrit;

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
  const form = useGmEntryForm({ collection: 'rune', isNew, existingIds, onSaved });

  const set = (patch) => setE((cur) => ({ ...cur, ...patch }));
  const setCond = (i, patch) =>
    setE((cur) => ({
      ...cur,
      conditions: cur.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    }));
  const addCond = () => setE((cur) => ({ ...cur, conditions: [...cur.conditions, blankCondition()] }));
  const rmCond = (i) =>
    setE((cur) => ({ ...cur, conditions: cur.conditions.filter((_, idx) => idx !== i) }));

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
            <label>extra damage dice (optional)</label>
            <input
              aria-label="rider-dice"
              placeholder="e.g. 1d6"
              value={e.dice}
              onChange={(ev) => set({ dice: ev.target.value })}
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
            <label>on crit — persistent damage (optional)</label>
            <input
              aria-label="rider-critPersistent"
              placeholder="e.g. 1d10"
              value={e.critPersistent}
              onChange={(ev) => set({ critPersistent: ev.target.value })}
            />
          </div>
          <div className="form-group">
            <label>damage type</label>
            <select
              aria-label="rider-damageType"
              value={e.damageType}
              disabled={!e.dice.trim() && !e.persistent.trim() && !e.critPersistent.trim()}
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

      {form.error && <p className="gm-warn" role="alert">{form.error}</p>}

      <div className="gm-actions">
        <button className="btn-primary" disabled={form.busy} onClick={save}>
          {isNew ? 'Create rune' : 'Save'}
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
        collection="rune"
        noun="rune"
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

// ── Safe preserve-on-save form (ring #967 R9, shield #1196 G3/G4) ─────────────
// Some property runes carry hand-authored mechanics the structured weapon form
// can't express and would DROP on save: ring activations
// (actions[]/freeActions[]/reactions[]) + riders (#248), and a shield rune's
// `actuated` block (Weapon-Storing's Interact toggle, the Class B spell casts,
// the Class C reactions), its `shieldCategories` etch gate, and the
// `duplicable`/`choices` pair (Energy-Resistant's damage-type pick). This form
// edits only the descriptive fields and PRESERVES every other field by spreading
// the original doc on save, so an edit never guts a rune (the GmItems variant
// clobber, #1170 task_316f46df, in rune form).
const preserveToForm = (r) => {
  const src = r && typeof r === 'object' ? r : {};
  return {
    id: src.id,
    name: src.name || '',
    level: src.level != null ? String(src.level) : '',
    price: src.price != null ? String(src.price) : '',
    description: src.description || '',
    _original: src,
  };
};
const preserveFromForm = (target, f) => {
  if (!f.name.trim()) throw new Error('Rune name is required.');
  const out = { ...(f._original || {}), type: 'property', target, name: f.name.trim() };
  const level = parseInt(f.level, 10);
  if (Number.isNaN(level)) delete out.level; else out.level = level;
  const price = parseFloat(f.price);
  if (Number.isNaN(price)) delete out.price; else out.price = price;
  if (f.description.trim()) out.description = f.description.trim(); else delete out.description;
  delete out.id; // the caller stamps the id (slug or existing)
  return out;
};

// One-line summary of the mechanics this form preserves but never edits, so the
// GM sees what a bare descriptive save keeps intact. Returns null when there's
// nothing but the descriptive fields.
const ringPreservedNote = (o) => {
  const activations = ['actions', 'freeActions', 'reactions'].reduce(
    (n, k) => n + (Array.isArray(o[k]) ? o[k].length : 0), 0);
  const riders = Array.isArray(o.riders) ? o.riders.length : 0;
  if (!activations && !riders) return null;
  return `${activations} activation${activations === 1 ? '' : 's'} · ${riders} rider${riders === 1 ? '' : 's'}`;
};
const shieldPreservedNote = (o) => {
  const parts = [];
  if (o.actuated) parts.push('an activation');
  const choices = Array.isArray(o.choices) ? o.choices.length : 0;
  if (choices) parts.push(`${choices} etch choice${choices === 1 ? '' : 's'}`);
  if (Array.isArray(o.shieldCategories) && o.shieldCategories.length) parts.push('a shield-category restriction');
  return parts.length ? parts.join(' · ') : null;
};

const PreserveRuneForm = ({ initial, isNew, existingIds, onSaved, onRestored, target, noteTestId, preservedNote }) => {
  const [e, setE] = useState(initial);
  const form = useGmEntryForm({ collection: 'rune', isNew, existingIds, onSaved });
  const set = (patch) => setE((cur) => ({ ...cur, ...patch }));

  const save = async () => {
    let body;
    try { body = preserveFromForm(target, e); } catch (err) { form.setError(err.message); return; }
    const id = e.id || slugify(body.name);
    await form.save(id, { ...body, id });
  };

  const note = preservedNote(e._original || {});

  return (
    <div className="gm-card" data-testid={`rune-form-${e.id || 'new'}`}>
      <div className="gm-row">
        <div className="form-group">
          <label>Name</label>
          <input aria-label="name" value={e.name} onChange={(ev) => set({ name: ev.target.value })} />
        </div>
        <div className="form-group">
          <label>level</label>
          <input aria-label="level" type="number" value={e.level} onChange={(ev) => set({ level: ev.target.value })} />
        </div>
        <div className="form-group">
          <label>price (gp)</label>
          <input aria-label="price" type="number" value={e.price} onChange={(ev) => set({ price: ev.target.value })} />
        </div>
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea aria-label="description" rows={3} value={e.description} onChange={(ev) => set({ description: ev.target.value })} />
      </div>
      {note && (
        <p className="gm-count" data-testid={noteTestId}>
          Preserved on save: {note} (authored in content).
        </p>
      )}
      {form.error && <p className="gm-warn" role="alert">{form.error}</p>}
      <div className="gm-actions">
        <button className="btn-primary" disabled={form.busy} onClick={save}>{isNew ? 'Create rune' : 'Save'}</button>
        {!isNew && (
          <>
            <button className="btn-secondary" disabled={form.busy} onClick={() => form.setShowHistory(true)}>History</button>
            <button className="btn-danger" disabled={form.busy} onClick={form.requestDelete}>Delete</button>
          </>
        )}
      </div>
      <GmEntryDialogs form={form} collection="rune" noun="rune" id={e.id} name={e.name} isNew={isNew}
        onRestored={(doc) => { if (doc) setE(preserveToForm(doc)); onRestored(); }} />
    </div>
  );
};

const RingRuneForm = (props) => (
  <PreserveRuneForm {...props} target="ring" noteTestId="ring-preserved-note" preservedNote={ringPreservedNote} />
);
const ShieldRuneForm = (props) => (
  <PreserveRuneForm {...props} target="shield" noteTestId="shield-preserved-note" preservedNote={shieldPreservedNote} />
);

// ── Accessory runes (#1033 S4) ───────────────────────────────────────────────
// Accessory runes inscribe onto mundane worn items matched by USAGE TAGS
// (utils/accessoryRunes). This form authors the descriptive fields, rarity (the
// #982 shop filter), the usage-tag list, worn `modifiers` (the armor vocabulary
// plus the special `resistance` stat, which carries a damage descriptor and the
// optional persistent-bleed flat-check ease), and rider reminders — and, like
// the ring form, PRESERVES the content-authored activation fields (actuated /
// actions / freeActions / reactions / onBlock) by spreading the original doc.
const ACC_USAGE_TAGS = [...ACCESSORY_TAGS, 'shield', 'container', 'light'];
const ACC_RARITIES = ['common', 'uncommon', 'rare'];
const ACC_MODIFIER_STATS = [...MODIFIER_STATS, 'resistance'];

const accToForm = (r) => {
  const src = r && typeof r === 'object' ? r : {};
  return {
    id: src.id,
    name: src.name || '',
    level: src.level != null ? String(src.level) : '',
    price: src.price != null ? String(src.price) : '',
    rarity: String(src.rarity || 'common').toLowerCase(),
    description: src.description || '',
    usage: Array.isArray(src.usage) ? src.usage.map(String) : [],
    modifiers: Array.isArray(src.modifiers)
      ? src.modifiers.map((m) => ({
          stat: m.stat || 'ac',
          kind: m.kind || 'item',
          amount: m.amount != null ? String(m.amount) : '',
          vs: m.vs != null ? String(m.vs) : '',
          ease: !!m.flatCheckEase,
        }))
      : [],
    reminders: Array.isArray(src.riders)
      ? src.riders.map((rd) => (typeof rd === 'string' ? rd : rd?.text || '')).filter(Boolean)
      : [],
    _original: src,
  };
};
const accBlankRune = () => accToForm({});
const accBlankModifier = () => ({ stat: 'ac', kind: 'item', amount: '1', vs: '', ease: false });

const accFromForm = (f) => {
  if (!f.name.trim()) throw new Error('Rune name is required.');
  const usage = (f.usage || []).filter(Boolean);
  if (!usage.length) throw new Error('Pick at least one usage tag.');
  const out = { ...(f._original || {}), type: 'property', target: 'accessory', name: f.name.trim(), usage };
  const level = parseInt(f.level, 10);
  if (Number.isNaN(level)) delete out.level; else out.level = level;
  const price = parseFloat(f.price);
  if (Number.isNaN(price)) delete out.price; else out.price = price;
  if (f.description.trim()) out.description = f.description.trim(); else delete out.description;
  // Common is the filter default (#982) — stored only when it isn't.
  if (f.rarity && f.rarity !== 'common') out.rarity = f.rarity; else delete out.rarity;

  const modifiers = f.modifiers
    .map((m) => {
      if (m.stat === 'resistance') {
        // Special damage modifier: needs a descriptor; amount and the
        // flat-check ease are each optional (Stanching carries no amount).
        const vs = String(m.vs || '').trim().toLowerCase();
        if (!vs) return null;
        const mod = { stat: 'resistance', vs };
        const amount = parseInt(m.amount, 10);
        if (!Number.isNaN(amount)) mod.amount = amount;
        if (m.ease) mod.flatCheckEase = true;
        return mod;
      }
      const amount = parseInt(m.amount, 10);
      if (!m.stat || !m.kind || Number.isNaN(amount)) return null;
      return { stat: m.stat, kind: m.kind, amount };
    })
    .filter(Boolean);
  if (modifiers.length) out.modifiers = modifiers; else delete out.modifiers;

  const id = f.id || slugify(out.name);
  const riders = f.reminders
    .map((t) => String(t).trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `${id}-reminder-${i}`, text }));
  if (riders.length) out.riders = riders; else delete out.riders;

  delete out.id; // the caller stamps the id (slug or existing)
  return out;
};

const AccessoryRuneForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const [e, setE] = useState(initial);
  const form = useGmEntryForm({ collection: 'rune', isNew, existingIds, onSaved });

  const set = (patch) => setE((cur) => ({ ...cur, ...patch }));
  const toggleUsage = (tag) =>
    setE((cur) => ({
      ...cur,
      usage: cur.usage.includes(tag) ? cur.usage.filter((t) => t !== tag) : [...cur.usage, tag],
    }));
  const setMod = (i, patch) =>
    setE((cur) => ({
      ...cur,
      modifiers: cur.modifiers.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    }));
  const addMod = () => setE((cur) => ({ ...cur, modifiers: [...cur.modifiers, accBlankModifier()] }));
  const rmMod = (i) =>
    setE((cur) => ({ ...cur, modifiers: cur.modifiers.filter((_, idx) => idx !== i) }));
  const setReminder = (i, text) =>
    setE((cur) => ({ ...cur, reminders: cur.reminders.map((r, idx) => (idx === i ? text : r)) }));
  const addReminder = () => setE((cur) => ({ ...cur, reminders: [...cur.reminders, ''] }));
  const rmReminder = (i) =>
    setE((cur) => ({ ...cur, reminders: cur.reminders.filter((_, idx) => idx !== i) }));

  const save = async () => {
    let body;
    try { body = accFromForm(e); } catch (err) { form.setError(err.message); return; }
    const id = e.id || slugify(body.name);
    await form.save(id, { ...body, id });
  };

  // Content-authored activation surfaces this form never edits, only preserves.
  const preserved = [];
  if (e._original?.actuated) preserved.push('an activation');
  const cardCount = ['actions', 'freeActions', 'reactions'].reduce(
    (n, k) => n + (Array.isArray(e._original?.[k]) ? e._original[k].length : 0), 0);
  if (cardCount) preserved.push(`${cardCount} action card${cardCount === 1 ? '' : 's'}`);
  if (e._original?.onBlock) preserved.push('a Shield Block rider');

  return (
    <div className="gm-card" data-testid={`rune-form-${e.id || 'new'}`}>
      <div className="gm-row">
        <div className="form-group">
          <label>Name</label>
          <input aria-label="name" value={e.name} onChange={(ev) => set({ name: ev.target.value })} />
        </div>
        <div className="form-group">
          <label>level</label>
          <input aria-label="level" type="number" value={e.level} onChange={(ev) => set({ level: ev.target.value })} />
        </div>
        <div className="form-group">
          <label>price (gp)</label>
          <input aria-label="price" type="number" value={e.price} onChange={(ev) => set({ price: ev.target.value })} />
        </div>
        <div className="form-group">
          <label>rarity</label>
          <select aria-label="rarity" value={e.rarity} onChange={(ev) => set({ rarity: ev.target.value })}>
            {ACC_RARITIES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea aria-label="description" rows={3} value={e.description} onChange={(ev) => set({ description: ev.target.value })} />
      </div>

      <div className="form-group" data-testid="accessory-usage">
        <label>usage — host items whose tags match any of these</label>
        <div className="gm-shop-chips" role="group" aria-label="usage tags">
          {ACC_USAGE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`gm-shop-chip${e.usage.includes(tag) ? ' is-on' : ''}`}
              aria-pressed={e.usage.includes(tag)}
              aria-label={`usage-${tag}`}
              onClick={() => toggleUsage(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="gm-card" data-testid="accessory-rune-modifiers">
        <p className="gm-count">
          Modifiers — fold onto the sheet while worn + invested; `resistance` takes
          a damage descriptor (e.g. fire, persistent-bleed) instead of a kind
        </p>
        {e.modifiers.map((m, i) => (
          <div key={i} className="gm-row gm-rank-row">
            <select
              aria-label={`modifier-${i}-stat`}
              value={m.stat}
              onChange={(ev) => setMod(i, { stat: ev.target.value })}
            >
              {ACC_MODIFIER_STATS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {m.stat === 'resistance' ? (
              <>
                <input
                  aria-label={`modifier-${i}-vs`}
                  placeholder="vs (e.g. fire)"
                  value={m.vs}
                  onChange={(ev) => setMod(i, { vs: ev.target.value })}
                />
                <label className="gm-checkbox">
                  <input
                    type="checkbox"
                    aria-label={`modifier-${i}-ease`}
                    checked={m.ease}
                    onChange={(ev) => setMod(i, { ease: ev.target.checked })}
                  />
                  ease flat check
                </label>
              </>
            ) : (
              <select
                aria-label={`modifier-${i}-kind`}
                value={m.kind}
                onChange={(ev) => setMod(i, { kind: ev.target.value })}
              >
                {MODIFIER_KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            )}
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

      <div className="gm-card" data-testid="accessory-rune-reminders">
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

      {preserved.length > 0 && (
        <p className="gm-count" data-testid="accessory-preserved-note">
          Preserved on save: {preserved.join(' · ')} (authored in content).
        </p>
      )}
      {form.error && <p className="gm-warn" role="alert">{form.error}</p>}
      <div className="gm-actions">
        <button className="btn-primary" disabled={form.busy} onClick={save}>{isNew ? 'Create rune' : 'Save'}</button>
        {!isNew && (
          <>
            <button className="btn-secondary" disabled={form.busy} onClick={() => form.setShowHistory(true)}>History</button>
            <button className="btn-danger" disabled={form.busy} onClick={form.requestDelete}>Delete</button>
          </>
        )}
      </div>
      <GmEntryDialogs form={form} collection="rune" noun="rune" id={e.id} name={e.name} isNew={isNew}
        onRestored={(doc) => { if (doc) setE(accToForm(doc)); onRestored(); }} />
    </div>
  );
};

// Target facet (#967 R9): one editor over ALL property runes, filtered + grouped
// by rune target so weapon/armor/ring/accessory are distinguishable at a glance.
// The facet also picks the target for a NEW rune (weapon when 'All').
// Fundamentals (type:'fundamental') are table-derived — not authored here.
const TARGETS = ['weapon', 'armor', 'shield', 'ring', 'accessory'];
const TARGET_LABEL = { weapon: 'Weapon', armor: 'Armor', shield: 'Shield', ring: 'Ring', accessory: 'Accessory' };
const TARGET_ORDER = { weapon: 0, armor: 1, shield: 2, ring: 3, accessory: 4 };

const GmRunes = () => {
  const { runes } = useContent();
  const [facet, setFacet] = useState('all');

  const catalog = useMemo(
    () => (Array.isArray(runes) ? runes : []).filter((r) => r && r.type === 'property'),
    [runes]
  );
  const existingIds = useMemo(() => existingIdSet(catalog), [catalog]);

  const sorted = useMemo(() => {
    const list = facet === 'all' ? catalog : catalog.filter((r) => runeTarget(r) === facet);
    return list.slice().sort((a, b) => {
      const ta = TARGET_ORDER[runeTarget(a)] ?? 9;
      const tb = TARGET_ORDER[runeTarget(b)] ?? 9;
      if (ta !== tb) return ta - tb;
      return String(a.name || a.id).toLowerCase().localeCompare(String(b.name || b.id).toLowerCase());
    });
  }, [catalog, facet]);

  const newTarget = facet === 'all' ? 'weapon' : facet;
  const detailFor = (entry, isNew, callbacks) => {
    const t = isNew ? newTarget : runeTarget(entry);
    if (t === 'armor') {
      return <ArmorRuneForm initial={isNew ? armorBlankRune() : armorToForm(entry)} isNew={isNew} existingIds={existingIds} {...callbacks} />;
    }
    if (t === 'ring') {
      return <RingRuneForm initial={isNew ? preserveToForm({}) : preserveToForm(entry)} isNew={isNew} existingIds={existingIds} {...callbacks} />;
    }
    if (t === 'shield') {
      return <ShieldRuneForm initial={isNew ? preserveToForm({}) : preserveToForm(entry)} isNew={isNew} existingIds={existingIds} {...callbacks} />;
    }
    if (t === 'accessory') {
      return <AccessoryRuneForm initial={isNew ? accBlankRune() : accToForm(entry)} isNew={isNew} existingIds={existingIds} {...callbacks} />;
    }
    return <RuneForm initial={isNew ? blankRune() : toForm(entry)} isNew={isNew} existingIds={existingIds} {...callbacks} />;
  };

  const header = (
    <div className="gm-rune-facets" role="group" aria-label="rune target filter">
      {['all', ...TARGETS].map((t) => (
        <button key={t} type="button"
          className={`btn-small ${facet === t ? 'btn-primary' : 'btn-secondary'}`}
          aria-pressed={facet === t}
          onClick={() => setFacet(t)}>
          {t === 'all' ? 'All' : TARGET_LABEL[t]}
        </button>
      ))}
    </div>
  );

  return (
    <div className="gm-runes">
      <PageEditorShell
        entries={sorted}
        nameOf={(r) => (
          // The resolved glyph doubles as a registry-coverage audit (#1372):
          // a generic bindrune here means the family has no drawn art yet.
          <>
            <RuneIcon runeId={r.id} tint className="gm-rune-glyph" />
            {r.name} <span className="gm-rune-badge" aria-hidden="true">{TARGET_LABEL[runeTarget(r)] || runeTarget(r)}</span>
          </>
        )}
        noun="rune"
        addLabel={facet === 'all' ? '+ New rune' : `+ New ${facet} rune`}
        header={header}
        groupOf={facet === 'all' ? (r) => `${TARGET_LABEL[runeTarget(r)] || 'Other'} runes` : undefined}
        filterEntry={(r, q) =>
          [r.name, r.id, r.description].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
        }
        renderDetail={detailFor}
      />
    </div>
  );
};

export default GmRunes;
