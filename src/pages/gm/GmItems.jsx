import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import { isRuneItem } from '../../utils/runeClassify';
import { useGmEntryForm } from '../../hooks/useGmEntryForm';
import GmEntryDialogs from '../../components/gm/GmEntryDialogs';
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
import { resolveArmor } from '../../utils/armorRunes';
import { resolveShield, REINFORCING, REINFORCING_TIERS } from '../../utils/shieldRunes';
import { resolveScroll, resolveWand, castRank } from '../../utils/spellItems';
import { ARMOR_CATEGORIES } from '../../utils/InventoryUtils';
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
// spell is a `spellRef` into the shared catalog only (epic #622 — no inline
// spells); the staff `staff.spells` list is `ref`-based for the same reason.

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
};

// Prices/weights are often decimals (2.5, 0.1); keep them as floats.
const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

// A scroll/wand spell is a catalog reference only (epic #622 — no inline spells):
// the form holds the `spellRef`, an optional cast-rank override (#812 S4 — for a
// heightened scroll/wand), plus any other non-ref keys preserved through `rest`.
const spellToForm = (s) => {
  const src = s && typeof s === 'object' ? s : {};
  const { spellRef, rank, ...rest } = src;
  return {
    spellRef: spellRef != null ? String(spellRef) : '',
    rank: rank != null ? String(rank) : '', // optional cast-rank override
    rest, // id + any unmanaged keys, preserved
  };
};

// The catalog spell supplies every field at resolution time, so emit ONLY the
// minimal block: the ref, the cast-rank override when set to a positive integer
// (blank ⇒ the spell's own rank is used), and any preserved rest. Only called
// once a ref is present (validated).
const spellFromForm = (sf) => {
  const rankNum = parseInt(sf.rank, 10);
  return {
    ...sf.rest,
    spellRef: sf.spellRef.trim(),
    ...(Number.isInteger(rankNum) && rankNum > 0 ? { rank: rankNum } : {}),
  };
};

// Keys that must never appear in the raw-JSON box: per-character data belongs
// on the inventory reference, and containers / scroll / wand / variants /
// consumable metadata have dedicated UI.
const FORBIDDEN_REST = ['quantity', 'invested', 'contents', 'container', 'scroll', 'wand', 'variants', 'consumable', 'armor'];

// Variant keys the form manages via dedicated fields. Everything else (e.g.
// per-tier `name`, `overrides`, Coda staff data) is unmanaged and must survive
// edit→save untouched, so it is stashed in `variantRest` — mirroring the
// top-level `restJson`/`runeRest` pattern. Dropping these silently strips live
// data (cloak-of-repute tier bonuses, boots-of-bounding names, Coda staves).
const VARIANT_MANAGED = ['level', 'label', 'price', 'effect'];

const variantToForm = (v) => ({
  level: v.level != null ? String(v.level) : '',
  label: v.label != null ? String(v.label) : '',
  price: v.price != null ? String(v.price) : '',
  effect: v.effect != null ? String(v.effect) : '',
  rest: Object.fromEntries(Object.entries(v || {}).filter(([k]) => !VARIANT_MANAGED.includes(k))),
});

const blankVariant = () => ({ level: '', label: '', price: '', effect: '', rest: {} });

const variantFromForm = (vf) => {
  const out = { ...(vf.rest || {}) };
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
  // `image`/`imagePosition` are owned by the dedicated ImageField — they must
  // NOT leak into the raw-JSON rest blob, or itemFromForm's `{ ...rest }`
  // resurrects a removed image on save (the un-deletable Vangloris art bug).
  ['id', 'name', 'price', 'weight', 'traits', 'description', 'image', 'imagePosition', 'container', 'scroll', 'wand', 'strikes', 'variants', 'consumable', 'runes', 'potency', 'armor'].forEach(
    (k) => delete rest[k]
  );
  // Weapon runes (#548 Slice 2): potency/striking are authored via dropdowns,
  // not the raw-JSON box. A new `runes` block is the structured model; a legacy
  // flat `potency` (no `runes`) is preserved untouched and surfaced as a notice
  // so saving never re-derives a baked weapon's name/dice — migration is Slice 4.
  const runes = it.runes && typeof it.runes === 'object' && !Array.isArray(it.runes) ? it.runes : null;
  const RUNE_MANAGED = ['potency', 'striking', 'resilient', 'property', 'reinforcing'];
  const runeRest = runes
    ? Object.fromEntries(Object.entries(runes).filter(([k]) => !RUNE_MANAGED.includes(k)))
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
    // Resilient is armor's second fundamental rune (the analogue of striking).
    runeResilient: runes && runes.resilient ? runes.resilient : 'none',
    // Reinforcing is a shield's ONLY fundamental rune (#1165). The shield stat
    // block itself stays in the raw-JSON box for now; hasShield gates the dropdown.
    runeReinforcing: runes && runes.reinforcing ? runes.reinforcing : 'none',
    runeProperty: runes && Array.isArray(runes.property)
      ? runes.property.map((p) => (typeof p === 'string' ? p : p?.id)).filter(Boolean)
      : [],
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
    // Armor block (AC1, #747): structured defensive stats the AC-recompute epic
    // derives base AC from. `category` defaults to light; an empty Dex cap means
    // uncapped (heavy armor still authors one explicitly).
    hasArmor: !!it.armor,
    hasShield: !!it.shield,
    armorCategory: it.armor?.category || 'light',
    armorAcBonus: it.armor?.acBonus != null ? String(it.armor.acBonus) : '',
    armorDexCap: it.armor?.dexCap != null ? String(it.armor.dexCap) : '',
    armorStrength: it.armor?.strength != null ? String(it.armor.strength) : '',
    armorGroup: it.armor?.group != null ? String(it.armor.group) : '',
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

  // Weapon runes (#548 Slices 2–3b). The dropdowns/pickers are the single
  // source of truth, so drop any `runes`/`potency` pasted into the raw-JSON box.
  // When potency/striking/property is set we emit the structured `runes` block;
  // property runes are stored as catalog ids and capped at the potency tier
  // (PF2e: a weapon holds property runes up to its potency value). Otherwise an
  // un-migrated legacy flat `potency` is re-emitted verbatim.
  delete out.runes;
  delete out.potency;
  // A shield holds ONLY a reinforcing rune (#1165) — no potency/striking/property.
  const reinforcing = f.hasShield && f.runeReinforcing && f.runeReinforcing !== 'none' ? f.runeReinforcing : null;
  const potencyTier = f.hasShield ? 0 : parseInt(f.runePotency, 10) || 0;
  // Armor's second fundamental is resilient; a weapon's is striking. Pick by the
  // item's nature so an armor never carries striking (or vice versa), and a shield
  // never carries either.
  const striking = !f.hasArmor && !f.hasShield && f.runeStriking && f.runeStriking !== 'none' ? f.runeStriking : null;
  const resilient = f.hasArmor && f.runeResilient && f.runeResilient !== 'none' ? f.runeResilient : null;
  // Property runes occupy slots equal to the potency value (#607), for armor and
  // weapons alike. Over-slotting is rejected (not silently truncated) so the GM
  // never loses a rune unawares; striking/resilient have no potency prerequisite.
  const property = f.hasShield ? [] : (f.runeProperty || []).filter(Boolean);
  if (property.length > potencyTier) {
    const noun = f.hasArmor ? 'armor' : 'weapon';
    throw new Error(
      potencyTier === 0
        ? `Property runes need a potency rune to hold them. Add potency, or remove the property ${property.length === 1 ? 'rune' : 'runes'}.`
        : `This ${noun} has ${property.length} property runes but its +${potencyTier} potency grants only ${potencyTier} slot${potencyTier === 1 ? '' : 's'}. Remove the extra ${property.length - potencyTier === 1 ? 'rune' : 'runes'} or raise potency.`
    );
  }
  if (potencyTier > 0 || striking || resilient || reinforcing || property.length || Object.keys(f.runeRest || {}).length) {
    out.runes = {
      ...(f.runeRest || {}),
      ...(potencyTier > 0 ? { potency: potencyTier } : {}),
      ...(striking ? { striking } : {}),
      ...(resilient ? { resilient } : {}),
      ...(reinforcing ? { reinforcing } : {}),
      ...(property.length ? { property } : {}),
    };
  } else if (f.legacyPotency != null) {
    out.potency = f.legacyPotency;
  }
  if (f.description.trim()) out.description = f.description.trim();
  // The ImageField is the single source of truth: scrub any copy that arrived
  // via the raw-JSON box, then emit only when an image is actually set — so
  // clearing the field genuinely removes the art from the saved doc.
  delete out.image;
  delete out.imagePosition;
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

  // Armor block (AC1, #747). The dedicated fields are the single source of
  // truth, so any `armor` pasted into the raw-JSON box is already rejected by
  // FORBIDDEN_REST. `category` always emits; numeric stats omit when blank so
  // the canonical shape stays sparse (absent ≠ 0). An empty Dex cap = uncapped.
  delete out.armor;
  if (f.hasArmor) {
    const armor = { category: f.armorCategory };
    if (f.armorAcBonus.trim() !== '') armor.acBonus = toInt(f.armorAcBonus);
    if (f.armorDexCap.trim() !== '') armor.dexCap = toInt(f.armorDexCap);
    if (f.armorStrength.trim() !== '') armor.strength = toInt(f.armorStrength);
    if (f.armorGroup.trim() !== '') armor.group = f.armorGroup.trim();
    out.armor = armor;
  }

  if (f.spellKind === 'scroll' || f.spellKind === 'wand') {
    if (!(f.spell.spellRef && f.spell.spellRef.trim())) {
      throw new Error(
        `The ${f.spellKind} on "${f.name}" needs a catalog spell reference.`
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

// Build the resolved-block input the S1 resolver expects from the form: the
// catalog spell plus the form's cast-rank override (the resolver reads
// block.rank ?? spell.level). Returns null when no real catalog spell matches.
const spellPreview = (kind, spellForm, spells) => {
  const ref = (spellForm.spellRef || '').trim();
  if (!ref) return null;
  const match = (Array.isArray(spells) ? spells : []).find((s) => String(s.id) === ref);
  if (!match) return null;
  const rankNum = parseInt(spellForm.rank, 10);
  const block = { spellRef: ref, ...(Number.isInteger(rankNum) && rankNum > 0 ? { rank: rankNum } : {}) };
  return (kind === 'scroll' ? resolveScroll : resolveWand)(match, block);
};

// The derived item-name for a scroll/wand, or null when no spell is selected
// (a dangling unknown ref keeps the existing item name unchanged — the GM can
// repoint without losing data). Uses the resolver so a heightened override
// surfaces its "(Rank N)" suffix here too.
const derivedItemName = (e, spells) => {
  if (e.spellKind !== 'scroll' && e.spellKind !== 'wand') return null;
  const preview = spellPreview(e.spellKind, e.spell, spells);
  return preview ? preview.name : null;
};

// Display name for a RAW catalog item in the master list / search. Scroll/wand
// entries no longer author a `name` (#812 S5 — it's derived from the spell), so
// derive it from the raw `{ spellRef, rank? }` block; everything else uses its
// authored name.
const catalogDisplayName = (it, spells) => {
  if (it && (it.scroll || it.wand)) {
    const kind = it.scroll ? 'scroll' : 'wand';
    const preview = spellPreview(kind, it[kind] || {}, spells);
    if (preview) return preview.name;
  }
  return it ? it.name : undefined;
};

const SpellSubform = ({ kind, spell, spells, onChange }) => {
  const ref = (spell.spellRef || '').trim();
  const refMatch = ref
    ? (Array.isArray(spells) ? spells : []).find((s) => String(s.id) === ref)
    : null;

  // A scroll/wand spell is a catalog reference only (epic #622 — no inline
  // spells): the GM picks the spell from the catalog and nothing else.
  const sortedSpells = (Array.isArray(spells) ? spells : [])
    .slice()
    .sort((a, b) =>
      String(a.name || a.id).toLowerCase().localeCompare(String(b.name || b.id).toLowerCase())
    );

  // Read-only derived preview (#812 S4): the base-template fields S1/S2 will
  // generate from the spell's cast rank, so the GM sees the output without
  // hand-typing it. The cast rank is the override (blank ⇒ the spell's own
  // rank); a wand tops out at rank 9, a scroll at 10.
  const preview = spellPreview(kind, spell, spells);
  const effectiveRank = refMatch ? castRank(refMatch, { rank: parseInt(spell.rank, 10) || undefined }) : null;

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
          <option value="">— (select a spell) —</option>
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
            : 'Pick a spell from the catalog.'}
        </p>
      </div>
      <div className="form-group">
        <label>cast rank (optional)</label>
        <input
          aria-label="spell-rank"
          type="number"
          min="1"
          max={kind === 'wand' ? 9 : 10}
          placeholder={refMatch ? `default ${refMatch.level}` : 'spell rank'}
          value={spell.rank || ''}
          onChange={(ev) => onChange({ ...spell, rank: ev.target.value })}
        />
        <p className="gm-hint">
          Leave blank to use the spell&rsquo;s own rank. Set higher for a heightened {kind}.
        </p>
      </div>
      {preview && (
        <p className="gm-hint" data-testid="spell-item-preview">
          Resolves to: <strong>{preview.name}</strong>
          {preview.level != null
            ? ` · Item ${preview.level} · ${preview.price} gp · Bulk ${preview.bulk}`
            : ` · rank ${effectiveRank ?? '?'} is out of range — no item level/price`}
          {preview.traits && preview.traits.length > 0 && ` · ${preview.traits.join(', ')}`}
        </p>
      )}
    </div>
  );
};

// List row: name + a "no image" flag for items missing one, so the GM can spot
// gaps at a glance without opening each entry.
const ItemRow = ({ item, spells }) => {
  const name = catalogDisplayName(item, spells) || item.id;
  return !item.image ? (
    <span className="gm-item-row-title">
      {name}
      <span className="gm-item-row-noimg" title="No image set" aria-hidden="true">No image</span>
    </span>
  ) : (
    name
  );
};

const VariantSubform = ({ variant, idPrefix, onChange }) => {
  // Unmanaged variant keys (per-tier `name`, `overrides`, Coda staff data) have
  // no dedicated field but round-trip untouched via `rest`. Surface them so the
  // GM knows editing this variant won't strip them.
  const restKeys = Object.keys(variant.rest || {});
  return (
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
      {restKeys.length > 0 && (
        <p className="gm-hint" data-testid={`${idPrefix}-preserved`}>
          Preserved on save: {restKeys.join(', ')}
        </p>
      )}
    </div>
  );
};

const ItemForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const { spells, effects, runes: runeCatalog } = useContent();
  const [e, setE] = useState(initial);
  const form = useGmEntryForm({ collection: 'item', isNew, existingIds, onSaved });

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

  // For a scroll or wand, the item's name is generated from the contained
  // spell ("Scroll of <Spell>" / "Wand of <Spell>"). Recompute on every render
  // so a fresh spell pick updates the disabled Name input + the slug-derived id.
  const derivedName = derivedItemName(e, spells);
  const isSpellItem = e.spellKind === 'scroll' || e.spellKind === 'wand';

  // Weapon-rune preview (#548 Slice 2). The runes block drives a derived display
  // name + price and scales each strike's native dice; show what it resolves to
  // so the GM authors base name/price and sees the effect before saving.
  const isArmorRune = e.hasArmor;
  // A shield authors only its reinforcing rune; the base shield stat block lives
  // in the raw-JSON box, so parse it (defensively) to preview resolved H/HP/BT.
  const isShieldItem = e.hasShield;
  const runeReinforcingKey = isShieldItem && e.runeReinforcing !== 'none' ? e.runeReinforcing : null;
  let shieldBase = null;
  if (isShieldItem) {
    try {
      const parsed = JSON.parse(e.restJson || '{}');
      if (parsed && parsed.shield && typeof parsed.shield === 'object') shieldBase = parsed.shield;
    } catch { /* mid-edit invalid JSON — skip the resolved-stat preview */ }
  }
  const shieldPreview = isShieldItem
    ? resolveShield(
        { name: e.name, price: e.price.trim() !== '' ? toNum(e.price) : 0, ...(shieldBase || {}) },
        runeReinforcingKey ? { reinforcing: runeReinforcingKey } : {}
      )
    : null;
  const runePotencyTier = parseInt(e.runePotency, 10) || 0;
  const runeStrikingKey = !isArmorRune && e.runeStriking !== 'none' ? e.runeStriking : null;
  const runeResilientKey = isArmorRune && e.runeResilient !== 'none' ? e.runeResilient : null;
  const strikingDice = runeStrikingKey && STRIKING[runeStrikingKey] ? STRIKING[runeStrikingKey].extraDice : 0;
  // Property runes (#548 Slice 3b / #727): armor and weapon property runes share
  // the `rune` collection but are discriminated by `armorRune` — an armor item
  // picks from armorRune runes, a weapon from the rest. Slot count = potency.
  const propertyRuneCatalog = (Array.isArray(runeCatalog) ? runeCatalog : [])
    .filter((r) => (r.type || 'property') === 'property' && !!r.armorRune === isArmorRune)
    .slice()
    .sort((a, b) => String(a.name || a.id).toLowerCase().localeCompare(String(b.name || b.id).toLowerCase()));
  const runeById = new Map(propertyRuneCatalog.map((r) => [String(r.id), r]));
  // Property runes occupy slots equal to the potency value (#607); striking is
  // potency-independent. `selectedProperty` is the dense list of picked ids;
  // anything past the tier is over-slotted (potency was lowered, or stale data)
  // and is surfaced + blocked on save rather than silently dropped.
  const selectedProperty = e.runeProperty.filter(Boolean);
  const propertyOverflow = selectedProperty.slice(runePotencyTier);
  const selectedPropertyRunes = selectedProperty
    .slice(0, runePotencyTier)
    .map((id) => runeById.get(String(id)))
    .filter(Boolean);
  const hasRunes = runePotencyTier > 0 || !!runeStrikingKey || !!runeResilientKey || selectedProperty.length > 0;
  const runeBase = { name: e.name, price: e.price.trim() !== '' ? toNum(e.price) : 0 };
  const runeProperties = selectedPropertyRunes.length ? { property: selectedPropertyRunes } : {};
  const runePreview = isArmorRune
    ? resolveArmor(runeBase, {
        potency: runePotencyTier,
        ...(runeResilientKey ? { resilient: runeResilientKey } : {}),
        ...runeProperties,
      })
    : resolveWeapon(runeBase, {
        potency: runePotencyTier,
        ...(runeStrikingKey ? { striking: runeStrikingKey } : {}),
        ...runeProperties,
      });
  // A shield's bash strikes block must NOT surface the weapon-rune UI — its only
  // rune is reinforcing, authored in its own block below (#1165 S3).
  const showRunes = !isSpellItem && !isShieldItem && (isArmorRune || e.strikes.length > 0 || hasRunes || e.legacyPotency != null);
  const showShieldRunes = !isSpellItem && isShieldItem;

  // Set one property slot (by index) within the dense id list — clearing a slot
  // removes it, picking in an empty trailing slot appends. Overflow entries are
  // preserved (not silently dropped) so the GM resolves them explicitly (#607).
  const setPropertySlot = (slotIdx, id) => {
    const cur = e.runeProperty.filter(Boolean);
    let next;
    if (!id) next = cur.filter((_, i) => i !== slotIdx);
    else if (slotIdx < cur.length) next = cur.map((v, i) => (i === slotIdx ? id : v));
    else next = [...cur, id];
    set({ runeProperty: next });
  };
  const removePropertyRune = (idx) =>
    set({ runeProperty: e.runeProperty.filter(Boolean).filter((_, i) => i !== idx) });

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
      form.setError(err.message);
      return;
    }
    const id = candidate.id || slugify(candidate.name);
    await form.save(id, { ...body, id });
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

      {/* Armor block (AC1, #747): structured defensive stats. AC derivation
          (AC3) is a later slice — this slice only authors + round-trips the
          data. Hidden behind a toggle so non-armor items stay clean. */}
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            aria-label="is-armor"
            checked={e.hasArmor}
            onChange={(ev) => set({ hasArmor: ev.target.checked })}
          />{' '}
          This item is armor
        </label>
      </div>
      {e.hasArmor && (
        <div data-testid="item-armor">
          <div className="gm-row">
            <div className="form-group">
              <label>category</label>
              <select
                aria-label="armor-category"
                value={e.armorCategory}
                onChange={(ev) => set({ armorCategory: ev.target.value })}
              >
                {ARMOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>AC bonus (item)</label>
              <input
                aria-label="armor-ac-bonus"
                type="number"
                value={e.armorAcBonus}
                onChange={(ev) => set({ armorAcBonus: ev.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Dex cap (blank = uncapped)</label>
              <input
                aria-label="armor-dex-cap"
                type="number"
                value={e.armorDexCap}
                onChange={(ev) => set({ armorDexCap: ev.target.value })}
              />
            </div>
          </div>
          <div className="gm-row">
            <div className="form-group">
              <label>strength (negates speed penalty)</label>
              <input
                aria-label="armor-strength"
                type="number"
                value={e.armorStrength}
                onChange={(ev) => set({ armorStrength: ev.target.value })}
              />
            </div>
            <div className="form-group">
              <label>group (e.g. plate, leather)</label>
              <input
                aria-label="armor-group"
                value={e.armorGroup}
                onChange={(ev) => set({ armorGroup: ev.target.value })}
              />
            </div>
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

      {/* Shield rune (#1165 S3): a shield holds exactly one fundamental rune —
          reinforcing — which raises Hardness/HP/BT on an additive-with-cap curve.
          No potency/striking/property. The base shield stat block is authored in
          the raw-JSON box; this dropdown emits runes.reinforcing and previews the
          resolved name + durability. */}
      {showShieldRunes && (
        <div className="form-group" data-testid="item-shield-rune">
          <label>Shield rune</label>
          <div className="gm-row">
            <div className="form-group">
              <label>reinforcing</label>
              <select
                aria-label="rune-reinforcing"
                value={e.runeReinforcing}
                onChange={(ev) => set({ runeReinforcing: ev.target.value })}
              >
                <option value="none">none</option>
                {REINFORCING_TIERS.map((k) => (
                  <option key={k} value={k}>
                    {REINFORCING[k].label.replace(' Reinforcing', '').toLowerCase()} (item {REINFORCING[k].level})
                  </option>
                ))}
              </select>
            </div>
          </div>
          {shieldPreview && (
            <p className="gm-hint" data-testid="item-shield-preview">
              {runeReinforcingKey
                ? shieldBase
                  ? `→ ${shieldPreview.name} · Hardness ${shieldPreview.hardness} / HP ${shieldPreview.hp} / BT ${shieldPreview.brokenThreshold} · ${shieldPreview.price} gp`
                  : `→ ${shieldPreview.name} (add a shield stat block in the raw-JSON box below to preview resolved Hardness/HP/BT)`
                : 'No reinforcing rune — the shield uses its base Hardness/HP/BT.'}
            </p>
          )}
        </div>
      )}

      {/* Weapon runes (#548 Slices 2–3b): potency + striking dropdowns and the
          potency-gated property-rune picker replace the raw-JSON `potency`
          field. A legacy baked weapon keeps its flat field (notice below) until
          the Slice 4 content migration. */}
      {showRunes && (
        <div className="form-group" data-testid="item-runes">
          <label>{isArmorRune ? 'Armor runes' : 'Weapon runes'}</label>
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
            {isArmorRune ? (
              <div className="form-group">
                <label>resilient</label>
                <select
                  aria-label="rune-resilient"
                  value={e.runeResilient}
                  onChange={(ev) => set({ runeResilient: ev.target.value })}
                >
                  <option value="none">none</option>
                  <option value="resilient">resilient (+1 saves)</option>
                  <option value="greater">greater (+2 saves)</option>
                  <option value="major">major (+3 saves)</option>
                </select>
              </div>
            ) : (
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
            )}
          </div>

          {/* Property-rune slots (#548 Slice 3b / #607): a weapon holds property
              runes up to its potency value, so the slot count IS the potency
              tier. Over-slotted runes (potency lowered, or stale data) are shown
              and removable rather than silently dropped. */}
          <div className="form-group" data-testid="item-rune-property">
            <label>property runes ({runePotencyTier} {runePotencyTier === 1 ? 'slot' : 'slots'})</label>
            {runePotencyTier === 0 && propertyOverflow.length === 0 ? (
              <p className="gm-hint">Add potency to unlock property-rune slots.</p>
            ) : (
              Array.from({ length: runePotencyTier }, (_, i) => (
                <select
                  key={i}
                  aria-label={`rune-property-${i}`}
                  value={selectedProperty[i] || ''}
                  onChange={(ev) => setPropertySlot(i, ev.target.value)}
                >
                  <option value="">— none —</option>
                  {propertyRuneCatalog.map((r) => (
                    <option key={r.id} value={r.id}>{r.name || r.id}</option>
                  ))}
                  {selectedProperty[i] && !runeById.has(String(selectedProperty[i])) && (
                    <option value={selectedProperty[i]}>(unknown: {selectedProperty[i]})</option>
                  )}
                </select>
              ))
            )}
            {propertyOverflow.length > 0 && (
              <div className="gm-warn" data-testid="item-rune-property-overflow">
                <p>
                  {propertyOverflow.length} property {propertyOverflow.length === 1 ? 'rune exceeds' : 'runes exceed'}{' '}
                  {runePotencyTier === 0
                    ? `this ${isArmorRune ? 'armor' : 'weapon'}’s lack of a potency rune`
                    : `the +${runePotencyTier} potency’s ${runePotencyTier} slot${runePotencyTier === 1 ? '' : 's'}`}
                  {' '}— raise potency or remove {propertyOverflow.length === 1 ? 'it' : 'them'}. Saving is blocked until resolved.
                </p>
                {propertyOverflow.map((id, k) => {
                  const idx = runePotencyTier + k;
                  const r = runeById.get(String(id));
                  return (
                    <div key={idx} className="gm-row gm-rank-row">
                      <span>{r ? (r.name || r.id) : `(unknown: ${id})`}</span>
                      <button
                        type="button"
                        className="btn-small btn-danger"
                        aria-label={`remove-overflow-property-${k}`}
                        onClick={() => removePropertyRune(idx)}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
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

      {form.error && (
        <p className="gm-warn" role="alert">
          {form.error}
        </p>
      )}
      <div className="gm-actions">
        <button className="btn-primary" disabled={form.busy} onClick={save}>
          {isNew ? 'Create item' : 'Save'}
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
        collection="item"
        noun="catalog item"
        id={e.id}
        name={e.name}
        isNew={isNew}
        onRestored={(doc) => {
          if (doc) setE(toForm(doc));
          onRestored();
        }}
        deleteMessage={`Permanently delete the catalog item "${e.name}". Characters that reference it will show "(unknown item)" until repointed. This cannot be undone — restore it from History if you have it.`}
      />
    </div>
  );
};

const GmItems = () => {
  const { items, spells, runes } = useContent();
  // Runes (armor/weapon property + fundamental item entries) belong to the
  // dedicated rune editors, not the general items list (#885). Exclude them.
  const runeIds = useMemo(() => new Set((Array.isArray(runes) ? runes : []).map((r) => String(r.id))), [runes]);
  const catalog = useMemo(
    () => (Array.isArray(items) ? items : []).filter((it) => !isRuneItem(it, runeIds)),
    [items, runeIds]
  );
  // Collision check spans ALL item ids (incl. the hidden rune items), so a new
  // item can't reuse a rune-item id.
  const existingIds = useMemo(() => existingIdSet(items), [items]);

  return (
    <div className="gm-items">
      <PageEditorShell
        entries={catalog}
        nameOf={(it) => <ItemRow item={it} spells={spells} />}
        noun="item"
        addLabel="+ New item"
        filterEntry={(it, q) =>
          [catalogDisplayName(it, spells), it.id, ...(it.traits || [])]
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
