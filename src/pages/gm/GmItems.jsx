import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import HistoryModal from '../../components/gm/HistoryModal';
import {
  strikeToForm,
  strikeFromForm,
  blankStrike,
  StrikeSubform,
} from '../../components/gm/AbilitySubforms';
import ImageField from '../../components/gm/ImageField';
import PageEditorShell from '../../components/gm/PageEditorShell';
import TraitsField from '../../components/shared/TraitsField';
import { toList } from '../../utils/traitRefs';
import { resolveWeapon, scaleDamageDice, STRIKING } from '../../utils/weaponRunes';
import './gm.css';

// Slice 2: the shared item catalog editor. Catalog items hold ONLY the shared
// definition — name/price/weight/traits/description, a container's intrinsic
// {capacity,ignored} (never its per-character contents), and a scroll/wand's
// nested spell. Per-character data (quantity / invested / which container an
// item sits in) lives on the reference in a character's inventory, never here.
// Weapon runes (potency/striking) have dedicated dropdowns (#548 Slice 2); the
// remaining rare mechanical blocks (shield/actions, an artifact's level-gated
// `artifact` tiers / a staff's `staff` spell list) round-trip through a per-item
// raw-JSON box, the same faithful pattern as the character editor. A scroll/wand
// spell can be authored inline OR set to a `spellRef` into the shared catalog.

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
};

// Prices/weights are often decimals (2.5, 0.1); keep them as floats.
const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

// Managed scalar fields on a scroll/wand's nested spell. Anything else on the
// spell (id, etc.) is preserved verbatim through `rest`.
const SPELL_STR = ['name', 'actions', 'range', 'area', 'targets', 'defense', 'duration', 'description'];

const spellToForm = (s) => {
  const src = s && typeof s === 'object' ? s : {};
  const rest = { ...src };
  [...SPELL_STR, 'level', 'traits', 'heightened', 'spellRef'].forEach((k) => delete rest[k]);
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
    spellRef: src.spellRef != null ? String(src.spellRef) : '',
    rest, // id + any unmanaged keys, preserved
  };
};

const spellFromForm = (sf) => {
  const rest = { ...sf.rest };
  // A spell reference is the canonical form: the catalog spell supplies every
  // field at resolution time, so emit ONLY the ref (+ any preserved rest) and
  // skip the inline scalars entirely — no spurious empty/level-0 keys.
  if (sf.spellRef && sf.spellRef.trim()) {
    return { ...rest, spellRef: sf.spellRef.trim() };
  }
  const out = rest;
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
// on the inventory reference, and containers / scroll / wand / variants /
// consumable metadata have dedicated UI.
const FORBIDDEN_REST = ['quantity', 'invested', 'contents', 'container', 'scroll', 'wand', 'variants', 'consumable'];

const variantToForm = (v) => ({
  level: v.level != null ? String(v.level) : '',
  label: v.label != null ? String(v.label) : '',
  price: v.price != null ? String(v.price) : '',
  effect: v.effect != null ? String(v.effect) : '',
});

const blankVariant = () => ({ level: '', label: '', price: '', effect: '' });

const variantFromForm = (vf) => {
  const out = {};
  const lvl = parseInt(vf.level, 10);
  if (!Number.isNaN(lvl)) out.level = lvl;
  if (vf.label.trim()) out.label = vf.label.trim();
  const p = parseFloat(vf.price);
  if (!Number.isNaN(p)) out.price = p;
  if (vf.effect.trim()) out.effect = vf.effect.trim();
  return out;
};

const toForm = (it) => {
  const rest = { ...it };
  ['id', 'name', 'price', 'weight', 'traits', 'description', 'container', 'scroll', 'wand', 'strikes', 'variants', 'consumable', 'runes', 'potency'].forEach(
    (k) => delete rest[k]
  );
  // Weapon runes (#548 Slice 2): potency/striking are authored via dropdowns,
  // not the raw-JSON box. A new `runes` block is the structured model; a legacy
  // flat `potency` (no `runes`) is preserved untouched and surfaced as a notice
  // so saving never re-derives a baked weapon's name/dice — migration is Slice 4.
  const runes = it.runes && typeof it.runes === 'object' && !Array.isArray(it.runes) ? it.runes : null;
  const runeRest = runes
    ? Object.fromEntries(Object.entries(runes).filter(([k]) => k !== 'potency' && k !== 'striking'))
    : {};
  const legacyPotency = !runes && it.potency != null ? it.potency : null;
  // A weapon's `strikes` is usually an array, but a single-strike weapon
  // (e.g. "+1 Striking Pick") stores a lone object. Edit either as a list and
  // re-emit the same shape on save (see itemFromForm).
  const strikesWasObject = !!(it.strikes && typeof it.strikes === 'object' && !Array.isArray(it.strikes));
  const strikesSrc = Array.isArray(it.strikes)
    ? it.strikes
    : strikesWasObject
    ? [it.strikes]
    : [];
  return {
    strikes: strikesSrc.map(strikeToForm),
    strikesWasObject,
    runePotency: runes && runes.potency != null ? String(runes.potency) : '0',
    runeStriking: runes && runes.striking ? runes.striking : 'none',
    runeRest,
    legacyPotency,
    variants: (Array.isArray(it.variants) ? it.variants : []).map(variantToForm),
    id: it.id,
    name: it.name != null ? String(it.name) : '',
    price: it.price != null ? String(it.price) : '',
    weight: it.weight != null ? String(it.weight) : '',
    traits: Array.isArray(it.traits) ? it.traits.join(', ') : '',
    description: it.description != null ? String(it.description) : '',
    image: it.image || '',
    imagePosition: it.imagePosition || { x: 50, y: 50 },
    hasContainer: !!it.container,
    containerCapacity:
      it.container && it.container.capacity != null ? String(it.container.capacity) : '',
    containerIgnored:
      it.container && it.container.ignored != null ? String(it.container.ignored) : '',
    spellKind: it.scroll ? 'scroll' : it.wand ? 'wand' : 'none',
    spell: spellToForm(it.scroll || it.wand || {}),
    consumableKind: it.consumable?.kind || 'none',
    consumableTarget: it.consumable?.target === 'item' ? 'item' : 'self',
    consumableEffectId: it.consumable?.effectId != null ? String(it.consumable.effectId) : '',
    consumableDuration:
      it.consumable?.durationMinutes != null ? String(it.consumable.durationMinutes) : '',
    consumableLabel: it.consumable?.label != null ? String(it.consumable.label) : '',
    consumableTransient: !!it.consumable?.transient,
    consumableNote: it.consumable?.note != null ? String(it.consumable.note) : '',
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
    throw new Error(`Item "${f.name}" has invalid JSON in its extra fields.`);
  }
  if (rest === null || typeof rest !== 'object' || Array.isArray(rest)) {
    throw new Error(`Item "${f.name}" extra fields must be a JSON object.`);
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
  // Strikes have a dedicated editor now — it is the single source of truth,
  // so a stray `strikes` pasted into the raw-JSON box never double-authors.
  // A weapon strike's name is optional: a single-strike weapon (e.g. "+1
  // Striking Pick") deliberately has none and inherits the item name.
  delete out.strikes;
  const strikes = (f.strikes || []).map(strikeFromForm);
  if (strikes.length) {
    out.strikes = f.strikesWasObject && strikes.length === 1 ? strikes[0] : strikes;
  }
  delete out.variants;
  const variants = (f.variants || []).map(variantFromForm);
  if (variants.length) out.variants = variants;

  // Weapon runes (#548 Slice 2). The dropdowns are the single source of truth,
  // so drop any `runes`/`potency` pasted into the raw-JSON box. When potency or
  // striking is set we emit the structured `runes` block (preserving any other
  // rune keys, e.g. Slice 3 property runes). Otherwise an un-migrated legacy
  // flat `potency` is re-emitted verbatim so its back-compat resolution holds.
  delete out.runes;
  delete out.potency;
  const potencyTier = parseInt(f.runePotency, 10) || 0;
  const striking = f.runeStriking && f.runeStriking !== 'none' ? f.runeStriking : null;
  if (potencyTier > 0 || striking || Object.keys(f.runeRest || {}).length) {
    out.runes = {
      ...(f.runeRest || {}),
      ...(potencyTier > 0 ? { potency: potencyTier } : {}),
      ...(striking ? { striking } : {}),
    };
  } else if (f.legacyPotency != null) {
    out.potency = f.legacyPotency;
  }
  if (f.description.trim()) out.description = f.description.trim();
  if (f.image) { out.image = f.image; out.imagePosition = f.imagePosition; }
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
    const hasRef = !!(f.spell.spellRef && f.spell.spellRef.trim());
    if (!hasRef && !f.spell.str.name.trim()) {
      throw new Error(
        `The ${f.spellKind} spell on "${f.name}" needs a spell reference or a name.`
      );
    }
    out[f.spellKind] = spellFromForm(f.spell);
  }

  if (f.consumableKind === 'healing' || f.consumableKind === 'effect') {
    // Item-target effect consumables (oils, #339) track on an inventory item and
    // use a label, so they don't require a catalog effect id.
    const isItemTarget = f.consumableKind === 'effect' && f.consumableTarget === 'item';
    const effectId = (f.consumableEffectId || '').trim();
    if (f.consumableKind === 'effect' && !isItemTarget && !effectId) {
      throw new Error(`The effect consumable "${f.name}" needs an effect from the catalog.`);
    }
    const minutes = parseInt(f.consumableDuration, 10);
    out.consumable = {
      kind: f.consumableKind,
      ...(isItemTarget ? { target: 'item' } : {}),
      ...(isItemTarget && f.consumableTransient ? { transient: true } : {}),
      ...(f.consumableKind === 'effect' && !isItemTarget ? { effectId } : {}),
      ...(isItemTarget && f.consumableLabel.trim() ? { label: f.consumableLabel.trim() } : {}),
      ...(f.consumableKind === 'effect' && !Number.isNaN(minutes) && minutes > 0
        ? { durationMinutes: minutes }
        : {}),
      ...(f.consumableNote.trim() ? { note: f.consumableNote.trim() } : {}),
    };
  }

  return out;
};

// "Scroll of <Spell>" / "Wand of <Spell>" — the standard PF2e item-name shape.
// Both slugify cleanly to scroll-of-x / wand-of-x for the new-item id default.
const scrollWandName = (kind, spellName) =>
  `${kind === 'scroll' ? 'Scroll' : 'Wand'} of ${spellName}`;

// The derived item-name for a scroll/wand, or null when no spell is selected
// (a dangling unknown ref keeps the existing item name unchanged — the GM can
// repoint without losing data). Slice 5b extends the auto-derive path to wand.
const derivedItemName = (e, spells) => {
  if (e.spellKind !== 'scroll' && e.spellKind !== 'wand') return null;
  const ref = (e.spell.spellRef || '').trim();
  let spellName = '';
  if (ref) {
    const match = (Array.isArray(spells) ? spells : []).find((s) => String(s.id) === ref);
    if (match) spellName = String(match.name || '');
  }
  if (!spellName) spellName = e.spell.str.name.trim();
  return spellName ? scrollWandName(e.spellKind, spellName) : null;
};

const SpellSubform = ({ kind, spell, spells, onChange }) => {
  const setStr = (k, v) => onChange({ ...spell, str: { ...spell.str, [k]: v } });
  const ref = (spell.spellRef || '').trim();
  const refMatch = ref
    ? (Array.isArray(spells) ? spells : []).find((s) => String(s.id) === ref)
    : null;
  const setH = (i, patch) =>
    onChange({
      ...spell,
      heightened: spell.heightened.map((h, idx) => (idx === i ? { ...h, ...patch } : h)),
    });
  const addH = () => onChange({ ...spell, heightened: [...spell.heightened, { key: '', text: '' }] });
  const rmH = (i) =>
    onChange({ ...spell, heightened: spell.heightened.filter((_, idx) => idx !== i) });

  // Slice 5a→5b: both scrolls and wands pick their spell from the catalog and
  // tuck the inline authoring fields into a collapsed details block. The
  // subform is only mounted for those two kinds, so the layout is unconditional.
  const sortedSpells = (Array.isArray(spells) ? spells : [])
    .slice()
    .sort((a, b) =>
      String(a.name || a.id).toLowerCase().localeCompare(String(b.name || b.id).toLowerCase())
    );

  const inlineFields = (
    <>
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
        <label>traits</label>
        <TraitsField
          ariaLabel="spell-traits"
          value={spell.traits}
          onChange={(v) => onChange({ ...spell, traits: v })}
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
    </>
  );

  return (
    <div className="gm-card" data-testid="spell-subform">
      <p className="gm-count">{kind === 'scroll' ? 'Scroll' : 'Wand'} spell</p>
      <div className="form-group">
        <label>spell</label>
        <select
          aria-label="spell-ref"
          value={spell.spellRef || ''}
          onChange={(ev) => onChange({ ...spell, spellRef: ev.target.value })}
        >
          <option value="">— (author inline below) —</option>
          {sortedSpells.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || s.id}
            </option>
          ))}
          {ref && !refMatch && <option value={ref}>(unknown: {ref})</option>}
        </select>
        <p className="gm-hint" data-testid="spell-ref-preview">
          {ref
            ? refMatch
              ? `→ ${refMatch.name}`
              : '→ (unknown spell — will show a stub until the id matches)'
            : 'Pick a spell from the catalog, or expand the inline editor below to author one.'}
        </p>
      </div>
      <details className="gm-spell-inline" data-testid="spell-inline-details">
        <summary>Edit inline spell fields</summary>
        {inlineFields}
      </details>
    </div>
  );
};

const VariantSubform = ({ variant, idPrefix, onChange }) => (
  <div className="gm-row">
    <div className="form-group">
      <label>level</label>
      <input
        aria-label={`${idPrefix}-level`}
        type="number"
        value={variant.level}
        onChange={(e) => onChange({ ...variant, level: e.target.value })}
      />
    </div>
    <div className="form-group">
      <label>label</label>
      <input
        aria-label={`${idPrefix}-label`}
        value={variant.label}
        onChange={(e) => onChange({ ...variant, label: e.target.value })}
      />
    </div>
    <div className="form-group">
      <label>price</label>
      <input
        aria-label={`${idPrefix}-price`}
        type="number"
        value={variant.price}
        onChange={(e) => onChange({ ...variant, price: e.target.value })}
      />
    </div>
    <div className="form-group">
      <label>effect</label>
      <input
        aria-label={`${idPrefix}-effect`}
        value={variant.effect}
        onChange={(e) => onChange({ ...variant, effect: e.target.value })}
      />
    </div>
  </div>
);

const ItemForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const { spells, effects } = useContent();
  const [e, setE] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // null | {kind:'delete'} | {kind:'collision',id,payload}
  const [showHistory, setShowHistory] = useState(false);

  const set = (patch) => setE((cur) => ({ ...cur, ...patch }));
  const setStrike = (i, next) =>
    setE((cur) => ({ ...cur, strikes: cur.strikes.map((s, idx) => (idx === i ? next : s)) }));
  const addStrike = () => setE((cur) => ({ ...cur, strikes: [...cur.strikes, blankStrike()] }));
  const rmStrike = (i) =>
    setE((cur) => ({ ...cur, strikes: cur.strikes.filter((_, idx) => idx !== i) }));

  const setVariant = (i, next) =>
    setE((cur) => ({ ...cur, variants: cur.variants.map((v, idx) => (idx === i ? next : v)) }));
  const addVariant = () => setE((cur) => ({ ...cur, variants: [...cur.variants, blankVariant()] }));
  const rmVariant = (i) =>
    setE((cur) => ({ ...cur, variants: cur.variants.filter((_, idx) => idx !== i) }));

  const submit = async (id, payload) => {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await saveDocument('item', id, payload);
      onSaved(isNew, id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // For a scroll or wand, the item's name is generated from the contained
  // spell ("Scroll of <Spell>" / "Wand of <Spell>"). Recompute on every render
  // so a fresh spell pick updates the disabled Name input + the slug-derived id.
  const derivedName = derivedItemName(e, spells);
  const isSpellItem = e.spellKind === 'scroll' || e.spellKind === 'wand';

  // Weapon-rune preview (#548 Slice 2). The runes block drives a derived display
  // name + price and scales each strike's native dice; show what it resolves to
  // so the GM authors base name/price and sees the effect before saving.
  const runePotencyTier = parseInt(e.runePotency, 10) || 0;
  const runeStrikingKey = e.runeStriking !== 'none' ? e.runeStriking : null;
  const hasRunes = runePotencyTier > 0 || !!runeStrikingKey;
  const strikingDice = runeStrikingKey && STRIKING[runeStrikingKey] ? STRIKING[runeStrikingKey].extraDice : 0;
  const runePreview = resolveWeapon(
    { name: e.name, price: e.price.trim() !== '' ? toNum(e.price) : 0 },
    { potency: runePotencyTier, ...(runeStrikingKey ? { striking: runeStrikingKey } : {}) }
  );
  const showRunes = !isSpellItem && (e.strikes.length > 0 || hasRunes || e.legacyPotency != null);

  // Effect-consumable picker options (mirrors the scroll/wand spell-ref select,
  // including the dangling-ref option so a stale id can be repointed).
  const sortedEffects = (Array.isArray(effects) ? effects : [])
    .slice()
    .sort((a, b) =>
      String(a.name || a.id).toLowerCase().localeCompare(String(b.name || b.id).toLowerCase())
    );
  const effectMatch = e.consumableEffectId
    ? sortedEffects.find((fx) => String(fx.id) === e.consumableEffectId)
    : null;

  const save = async () => {
    // Override the item name only when we actually derived one (a known spell
    // picked or an inline name authored); otherwise itemFromForm's existing
    // "needs a spell reference or a name" validation reports the real problem.
    const candidate = derivedName ? { ...e, name: derivedName } : e;
    let body;
    try {
      body = itemFromForm(candidate);
    } catch (err) {
      setError(err.message);
      return;
    }
    const id = candidate.id || slugify(candidate.name);
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
          <input
            aria-label="name"
            value={isSpellItem ? derivedName ?? e.name : e.name}
            disabled={isSpellItem}
            onChange={(ev) => set({ name: ev.target.value })}
          />
          {isSpellItem && (
            <p className="gm-hint">Auto-derived from the spell selected below.</p>
          )}
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
        <label>traits</label>
        <TraitsField ariaLabel="traits" value={e.traits} onChange={(v) => set({ traits: v })} />
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
        <label>Image</label>
        <ImageField value={e.image} onChange={(v) => set({ image: v })} position={e.imagePosition} onPositionChange={(p) => set({ imagePosition: p })} ariaLabel="item-image" />
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
          spells={spells}
          onChange={(spell) => set({ spell })}
        />
      )}

      {/* Consumable metadata (#217) — drives the Use/Drink/Apply flow on the
          character sheet. Scrolls are consumed via the cast flow instead. */}
      <div className="form-group">
        <label>consumable</label>
        <select
          aria-label="consumable-kind"
          value={e.consumableKind}
          onChange={(ev) => set({ consumableKind: ev.target.value })}
        >
          <option value="none">none</option>
          <option value="healing">healing (player enters HP)</option>
          <option value="effect">effect (applies a catalog effect)</option>
        </select>
      </div>
      {e.consumableKind === 'effect' && (
        <>
          <div className="form-group">
            <label>target</label>
            <select
              aria-label="consumable-target"
              value={e.consumableTarget}
              onChange={(ev) => set({ consumableTarget: ev.target.value })}
            >
              <option value="self">the user (creature effect)</option>
              <option value="item">an inventory item (oil, #339)</option>
            </select>
          </div>
          <div className="gm-row">
            {e.consumableTarget === 'item' ? (
              <div className="form-group">
                <label>badge label (e.g. "Weightless")</label>
                <input
                  aria-label="consumable-label"
                  value={e.consumableLabel}
                  onChange={(ev) => set({ consumableLabel: ev.target.value })}
                />
              </div>
            ) : (
              <div className="form-group">
                <label>effect</label>
                <select
                  aria-label="consumable-effect"
                  value={e.consumableEffectId}
                  onChange={(ev) => set({ consumableEffectId: ev.target.value })}
                >
                  <option value="">— pick an effect —</option>
                  {sortedEffects.map((fx) => (
                    <option key={fx.id} value={fx.id}>
                      {fx.name || fx.id}
                    </option>
                  ))}
                  {e.consumableEffectId && !effectMatch && (
                    <option value={e.consumableEffectId}>(unknown: {e.consumableEffectId})</option>
                  )}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>duration (minutes, blank = until removed)</label>
              <input
                aria-label="consumable-duration"
                type="number"
                value={e.consumableDuration}
                onChange={(ev) => set({ consumableDuration: ev.target.value })}
              />
            </div>
          </div>
          {e.consumableTarget === 'item' && (
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  aria-label="consumable-transient"
                  checked={e.consumableTransient}
                  onChange={(ev) => set({ consumableTransient: ev.target.checked })}
                />
                {' '}instantaneous (log-only, no tracked effect — e.g. Rust Scrub)
              </label>
            </div>
          )}
        </>
      )}
      {e.consumableKind !== 'none' && (
        <div className="form-group">
          <label>note (shown in the use modal, e.g. "1d8 HP")</label>
          <input
            aria-label="consumable-note"
            value={e.consumableNote}
            onChange={(ev) => set({ consumableNote: ev.target.value })}
          />
        </div>
      )}

      {/* Weapon runes (#548 Slice 2): potency + striking dropdowns replace the
          raw-JSON `potency` field. A legacy baked weapon keeps its flat field
          (notice below) until the Slice 4 content migration. */}
      {showRunes && (
        <div className="form-group" data-testid="item-runes">
          <label>Weapon runes</label>
          {e.legacyPotency != null && !hasRunes && (
            <p className="gm-warn" data-testid="item-runes-legacy">
              Legacy baked potency (+{e.legacyPotency}) — its +N, dice, and price are fused
              into this item. It keeps working as-is; re-authoring it as base + runes happens
              in the Slice 4 content pass. Setting a rune below switches it to the new model.
            </p>
          )}
          <div className="gm-row">
            <div className="form-group">
              <label>potency</label>
              <select
                aria-label="rune-potency"
                value={e.runePotency}
                onChange={(ev) => set({ runePotency: ev.target.value })}
              >
                <option value="0">none</option>
                <option value="1">+1</option>
                <option value="2">+2</option>
                <option value="3">+3</option>
              </select>
            </div>
            <div className="form-group">
              <label>striking</label>
              <select
                aria-label="rune-striking"
                value={e.runeStriking}
                onChange={(ev) => set({ runeStriking: ev.target.value })}
              >
                <option value="none">none</option>
                <option value="striking">striking (+1 die)</option>
                <option value="greater">greater (+2 dice)</option>
                <option value="major">major (+3 dice)</option>
              </select>
            </div>
          </div>
          {hasRunes && (
            <p className="gm-hint" data-testid="item-runes-preview">
              Resolves to: <strong>{runePreview.name}</strong> · {runePreview.price} gp
            </p>
          )}
        </div>
      )}

      {/* Neither scrolls nor wands have strikes — hide the editor entirely.
          itemFromForm already drops a stale `strikes` paste on save, so the
          catalog stays clean even if data once authored one. */}
      {!isSpellItem && (
        <div className="form-group" data-testid="item-strikes">
          <label>Strikes</label>
          {e.strikes.map((s, i) => (
            <div className="gm-card" data-testid={`item-strike-${i}`} key={i}>
              <StrikeSubform
                value={s}
                idPrefix={`item-strike-${i}`}
                onChange={(next) => setStrike(i, next)}
              />
              {strikingDice > 0 && s.str.damage.trim() && (
                <p className="gm-hint" data-testid={`item-strike-${i}-scaled`}>
                  With {STRIKING[runeStrikingKey].label}: {scaleDamageDice(s.str.damage, strikingDice)}
                </p>
              )}
              <button className="btn-small btn-danger" onClick={() => rmStrike(i)}>
                Remove strike
              </button>
            </div>
          ))}
          <button className="btn-small btn-secondary" onClick={addStrike}>
            Add strike
          </button>
        </div>
      )}

      <div className="form-group" data-testid="item-variants">
        <label>Variants (multi-level: level, grade label, price, effect)</label>
        {e.variants.map((v, i) => (
          <div className="gm-card" data-testid={`item-variant-${i}`} key={i}>
            <VariantSubform
              variant={v}
              idPrefix={`item-variant-${i}`}
              onChange={(next) => setVariant(i, next)}
            />
            <button className="btn-small btn-danger" onClick={() => rmVariant(i)}>
              Remove variant
            </button>
          </div>
        ))}
        <button className="btn-small btn-secondary" onClick={addVariant}>
          Add variant
        </button>
      </div>

      <div className="form-group">
        <label>extra fields — shield, actions… (raw JSON)</label>
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
        message={`Permanently delete the catalog item "${e.name}". Characters that reference it will show "(unknown item)" until repointed. This cannot be undone — restore it from History if you have it.`}
        confirmLabel="Delete forever"
        requireType={e.name}
        onConfirm={doRemove}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'collision'}
        title="Overwrite existing item?"
        message={`A catalog item with id "${confirm?.id}" already exists. Saving will overwrite it.`}
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

  return (
    <div className="gm-items">
      <PageEditorShell
        entries={catalog}
        nameOf={(it) => it.name}
        noun="item"
        addLabel="+ New item"
        filterEntry={(it, q) =>
          [it.name, it.id, ...(it.traits || [])]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        }
        renderDetail={(entry, isNew, callbacks) => (
          <ItemForm
            initial={isNew ? blankItem() : toForm(entry)}
            isNew={isNew}
            existingIds={existingIds}
            {...callbacks}
          />
        )}
      />
    </div>
  );
};

export default GmItems;
