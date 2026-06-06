import React, { useMemo, useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import { newEntryUid } from '../../utils/uid';
import { SKILL_ABILITY_MAP, getProficiencyLabel } from '../../utils/CharacterUtils';
import { formatBulk } from '../../utils/InventoryUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import HistoryModal from '../../components/gm/HistoryModal';
import CatalogPickerModal from '../../components/gm/CatalogPickerModal';
import ItemEditModal from '../../components/gm/ItemEditModal';
import EntryListEditor from '../../components/gm/EntryListEditor';
import ImageField from '../../components/gm/ImageField';
import {
  strikeToForm,
  strikeFromForm,
  blankStrike,
  StrikeSubform,
  actionToForm,
  actionFromForm,
  blankAction,
  ActionSubform,
  reactionToForm,
  reactionFromForm,
  blankReaction,
  ReactionSubform,
  featToForm,
  featFromForm,
  blankFeat,
  FeatSubform,
  familiarToForm,
  familiarFromForm,
  blankFamiliar,
  FamiliarSubform,
  animalCompanionToForm,
  animalCompanionFromForm,
  blankAnimalCompanion,
  AnimalCompanionSubform,
} from '../../components/gm/AbilitySubforms';
import './gm.css';

// 5a: identity/abilities/saves. 5b: skills + proficiencies. 5c: the top-level
// `spellcasting` object (tradition/ability/proficiency/focus/spell_slots and
// the per-spell list). Item-borne spells (staff/wand/scroll) and the remaining
// sections (inventory, feats, strikes, actions, familiar) stay in the Advanced
// raw-JSON blob until slices 5d–5e.
const STRINGS = ['name', 'ancestry', 'background', 'class', 'keyAbility', 'size', 'senses', 'loreEntryId'];
const NUMS = ['level', 'maxHp', 'ac', 'speed'];
const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const SAVES = ['fortitude', 'reflex', 'will'];
const SKILLS = Object.keys(SKILL_ABILITY_MAP);
const WEAPONS = ['simple', 'martial', 'advanced', 'unarmed'];
const ARMOR = ['unarmored', 'light', 'medium', 'heavy'];
const TIERS = [0, 1, 2, 3, 4];
// Per-spell scalar fields the form manages explicitly; anything else on a spell
// (id, etc.) is preserved verbatim.
const SPELL_STR = ['name', 'actions', 'range', 'area', 'targets', 'defense', 'duration'];
const SPELL_NUM = ['level', 'baseLevel'];

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
};

// Prices/weights are often decimals (2.5, 100.1); keep them as floats.
const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

// Inventory items are wildly heterogeneous (shields, strikes, bonus arrays,
// potency, containers, invested…). Bespoke fields cover the common scalars;
// every other key on the item round-trips through a per-item raw-JSON box,
// mirroring the character-level Advanced pattern, so nothing is lost.
const omit = (obj, keys) => {
  const out = { ...obj };
  keys.forEach((k) => delete out[k]);
  return out;
};

// Inventory entries are catalog references: { ref, quantity, [invested],
// [container:{contents}] }. The picker repoints `ref`; quantity/invested are
// per-character. A container reference's `contents` is itself a list of
// references, edited recursively with the same row. Non-container extra keys
// are preserved verbatim while the ref is unchanged; repointing drops that
// carry-over. Legacy inline items (no `ref`) still round-trip through the
// bespoke fields for back-compat.
const itemToForm = (it) => {
  if (it && it.ref != null) {
    const hasContainer = !!(it.container && typeof it.container === 'object');
    return {
      __ref: true,
      uid: it.uid,
      ref: String(it.ref),
      origRef: String(it.ref),
      quantity: it.quantity != null ? String(it.quantity) : '1',
      invested: it.invested === true,
      extra: omit(it, ['uid', 'ref', 'quantity', 'invested', 'container']),
      isContainer: hasContainer,
      containerExtra: hasContainer ? omit(it.container, ['contents']) : {},
      contents:
        hasContainer && Array.isArray(it.container.contents)
          ? it.container.contents.map(itemToForm)
          : [],
      forkName: '',
    };
  }
  const rest = { ...it };
  ['name', 'description', 'price', 'quantity', 'weight', 'traits'].forEach((k) => delete rest[k]);
  return {
    name: it.name != null ? String(it.name) : '',
    description: it.description != null ? String(it.description) : '',
    traits: Array.isArray(it.traits) ? it.traits.join(', ') : '',
    price: it.price != null ? String(it.price) : '',
    quantity: it.quantity != null ? String(it.quantity) : '',
    weight: it.weight != null ? String(it.weight) : '',
    restJson: JSON.stringify(rest, null, 2),
  };
};

// Final slice (5e): feats / strikes / actions / reactions are arrays of very
// heterogeneous objects where only `name` is reliably common, so each entry is
// a bespoke name + a per-entry raw-JSON box for the rest (same faithful
// pattern as inventory items). familiar / animalCompanion are single nested
// objects, each given its own labelled JSON box with an add/remove toggle.
const ARR_SECTIONS = [
  { key: 'feats', label: 'Feats' },
  { key: 'strikes', label: 'Strikes' },
  { key: 'actions', label: 'Actions' },
  { key: 'reactions', label: 'Reactions' },
];
const OBJ_SECTIONS = [
  { key: 'familiar', label: 'Familiar' },
  { key: 'animalCompanion', label: 'Animal Companion' },
];

const entryToForm = (e) => {
  const rest = { ...e };
  delete rest.name;
  return { name: e && e.name != null ? String(e.name) : '', restJson: JSON.stringify(rest, null, 2) };
};

const entryFromForm = (f, label, index) => {
  if (!f.name.trim()) throw new Error(`${label} entry ${index + 1} needs a name.`);
  let rest;
  try {
    rest = f.restJson.trim() ? JSON.parse(f.restJson) : {};
  } catch {
    throw new Error(`${label} entry "${f.name}" has invalid JSON in its extra fields.`);
  }
  if (rest === null || typeof rest !== 'object' || Array.isArray(rest)) {
    throw new Error(`${label} entry "${f.name}" extra fields must be a JSON object.`);
  }
  return { ...rest, name: f.name.trim() };
};

// Sections with a bespoke structured sub-form instead of the generic
// name + raw-JSON pair. `strikes` (Slice 1) uses the shared StrikeSubform;
// feats/actions/reactions still round-trip through entryToForm/entryFromForm
// until later slices replace them too.
// Action/Reaction share the AbilitySubform UI and the abilityTo/FromForm pair;
// only the new-entry default cost differs (blankReaction starts as Reaction).
// `nameOf` reads the same `str.name` path Strike uses, so EntryListEditor's
// picker labels match what the GM types into the right pane.
const abilityFrom = (toFn) => (f, label, index) => {
  if (!f.str.name.trim()) throw new Error(`${label} entry ${index + 1} needs a name.`);
  return toFn(f);
};
const abilityNameOf = (f) => f.str.name;
const SECTION_CODEC = {
  strikes: {
    Comp: StrikeSubform,
    to: strikeToForm,
    blank: blankStrike,
    nameOf: abilityNameOf,
    from: abilityFrom(strikeFromForm),
  },
  actions: {
    Comp: ActionSubform,
    to: actionToForm,
    blank: blankAction,
    nameOf: abilityNameOf,
    from: abilityFrom(actionFromForm),
  },
  reactions: {
    Comp: ReactionSubform,
    to: reactionToForm,
    blank: blankReaction,
    nameOf: abilityNameOf,
    from: abilityFrom(reactionFromForm),
  },
  // Feats keep the per-entry raw-JSON box for their nested ability arrays
  // (actions/strikes/freeActions/innate); only the envelope is structured.
  // `from` mirrors the entryFromForm error wording so existing tests/help
  // (e.g. "Feats entry ‘X’ has invalid JSON in its …") stay compatible.
  feats: {
    Comp: FeatSubform,
    to: featToForm,
    blank: blankFeat,
    nameOf: abilityNameOf,
    from: (f, label, index) => {
      if (!f.str.name.trim()) throw new Error(`${label} entry ${index + 1} needs a name.`);
      try {
        return featFromForm(f);
      } catch (e) {
        throw new Error(`${label} entry "${f.str.name}" has ${e.message}.`);
      }
    },
  },
};

// Per-object structured codec. When present, the section renders the codec's
// subform instead of the generic toggleable raw-JSON textarea. familiar lands
// in slice 4a; animalCompanion in slice 4b.
const OBJ_CODEC = {
  familiar: {
    Comp: FamiliarSubform,
    to: familiarToForm,
    from: familiarFromForm,
    blank: blankFamiliar,
  },
  animalCompanion: {
    Comp: AnimalCompanionSubform,
    to: animalCompanionToForm,
    from: animalCompanionFromForm,
    blank: blankAnimalCompanion,
  },
};

// Returns the rebuilt item, or throws Error with a GM-readable message.
const itemFromForm = (f, index) => {
  if (f && f.__ref) {
    const ref = String(f.ref || '').trim();
    if (!ref) throw new Error(`Inventory item ${index + 1}: choose a catalog item.`);
    // Carry non-container extra keys only while the ref is unchanged; a
    // repointed ref starts clean. `uid` is the stable per-entry id (Slice 1):
    // preserve an existing one, mint for a newly-added entry. It is placement
    // identity, independent of the catalog ref, so it survives a repoint
    // (handled here, never via `extra`).
    const keepExtra = ref === f.origRef;
    const out = { uid: f.uid || newEntryUid(), ...(keepExtra && f.extra ? f.extra : {}), ref };
    out.quantity = String(f.quantity).trim() === '' ? 1 : toInt(f.quantity);
    if (f.invested) out.invested = true;
    // A container reference always carries `container.contents` (possibly
    // empty) — that is the per-character packing; capacity/ignored live on
    // the catalog item. `isContainer` is kept in sync from the catalog.
    if (f.isContainer) {
      out.container = {
        ...(keepExtra && f.containerExtra ? f.containerExtra : {}),
        contents: (f.contents || []).map((c, i) => itemFromForm(c, i)),
      };
    }
    return out;
  }
  if (!f.name.trim()) throw new Error(`Inventory item ${index + 1} needs a name.`);
  let rest;
  try {
    rest = f.restJson.trim() ? JSON.parse(f.restJson) : {};
  } catch {
    throw new Error(`Inventory item "${f.name}" has invalid JSON in its extra fields.`);
  }
  if (rest === null || typeof rest !== 'object' || Array.isArray(rest)) {
    throw new Error(`Inventory item "${f.name}" extra fields must be a JSON object.`);
  }
  const out = { ...rest, name: f.name.trim() };
  if (f.description.trim()) out.description = f.description.trim();
  const traits = f.traits.split(',').map((t) => t.trim()).filter(Boolean);
  if (traits.length) out.traits = traits;
  if (f.price.trim() !== '') out.price = toNum(f.price);
  if (f.quantity.trim() !== '') out.quantity = toInt(f.quantity);
  if (f.weight.trim() !== '') out.weight = toNum(f.weight);
  return out;
};

const spellToForm = (s) => {
  const rest = { ...s };
  SPELL_STR.forEach((k) => delete rest[k]);
  SPELL_NUM.forEach((k) => delete rest[k]);
  delete rest.traits;
  delete rest.heightened;
  const str = {};
  SPELL_STR.forEach((k) => { str[k] = s[k] != null ? String(s[k]) : ''; });
  const num = {};
  SPELL_NUM.forEach((k) => { num[k] = s[k] != null ? String(s[k]) : '0'; });
  const heightened = s.heightened && typeof s.heightened === 'object'
    ? Object.entries(s.heightened).map(([key, text]) => ({ key, text: String(text) }))
    : [];
  return {
    str,
    num,
    traits: Array.isArray(s.traits) ? s.traits.join(', ') : '',
    heightened,
    rest, // id + any unmanaged keys, preserved
  };
};

const spellFromForm = (sf) => {
  const out = { ...sf.rest };
  SPELL_STR.forEach((k) => { const v = sf.str[k].trim(); if (v) out[k] = v; });
  SPELL_NUM.forEach((k) => { out[k] = toInt(sf.num[k]); });
  const traits = sf.traits.split(',').map((t) => t.trim()).filter(Boolean);
  if (traits.length) out.traits = traits;
  const h = {};
  sf.heightened.forEach((r) => { if (r.key.trim()) h[r.key.trim()] = r.text; });
  if (Object.keys(h).length) out.heightened = h;
  return out;
};

const scToForm = (sc) => {
  const src = sc && typeof sc === 'object' ? sc : {};
  const rest = { ...src };
  ['tradition', 'ability', 'proficiency', 'focus', 'spell_slots', 'spells'].forEach((k) => delete rest[k]);
  return {
    tradition: src.tradition || '',
    ability: src.ability || '',
    proficiency: String(src.proficiency || 0),
    focusMax: String((src.focus && src.focus.max) || 0),
    focusCurrent: String((src.focus && src.focus.current) || 0),
    slots: src.spell_slots && typeof src.spell_slots === 'object'
      ? Object.entries(src.spell_slots).map(([level, count]) => ({ level, count: String(count) }))
      : [],
    spells: Array.isArray(src.spells) ? src.spells.map(spellToForm) : [],
    rest,
  };
};

const scFromForm = (f) => {
  const sc = { ...f.spellcasting.rest };
  if (f.spellcasting.tradition.trim()) sc.tradition = f.spellcasting.tradition.trim();
  if (f.spellcasting.ability.trim()) sc.ability = f.spellcasting.ability.trim();
  sc.proficiency = toInt(f.spellcasting.proficiency);
  sc.focus = { max: toInt(f.spellcasting.focusMax), current: toInt(f.spellcasting.focusCurrent) };
  const slots = {};
  f.spellcasting.slots.forEach((r) => { if (r.level.trim()) slots[r.level.trim()] = toInt(r.count); });
  sc.spell_slots = slots;
  sc.spells = f.spellcasting.spells.map(spellFromForm);
  return sc;
};

const toForm = (c) => {
  const rest = { ...c };
  delete rest.id;
  STRINGS.forEach((k) => delete rest[k]);
  NUMS.forEach((k) => delete rest[k]);
  delete rest.abilities;
  delete rest.saves;
  delete rest.skills;
  delete rest.proficiencies;
  delete rest.spellcasting;
  delete rest.inventory;
  ARR_SECTIONS.forEach((s) => delete rest[s.key]);
  OBJ_SECTIONS.forEach((s) => delete rest[s.key]);

  const strings = {};
  STRINGS.forEach((k) => { strings[k] = c[k] != null ? String(c[k]) : ''; });
  const nums = {};
  NUMS.forEach((k) => { nums[k] = c[k] != null ? String(c[k]) : ''; });
  const abilities = {};
  ABILITIES.forEach((k) => { abilities[k] = String((c.abilities && c.abilities[k]) ?? 10); });
  const saves = {};
  SAVES.forEach((k) => { saves[k] = String((c.saves && c.saves[k]) ?? 0); });

  const srcSkills = (c.skills && typeof c.skills === 'object') ? c.skills : {};
  const skills = {};
  SKILLS.forEach((sk) => { skills[sk] = String((srcSkills[sk] && srcSkills[sk].proficiency) || 0); });
  const lore = Array.isArray(srcSkills.lore)
    ? srcSkills.lore.map((l) => ({ name: l.name || '', proficiency: String(l.proficiency || 0) }))
    : [];
  const skillsRest = {};
  Object.keys(srcSkills).forEach((k) => {
    if (k !== 'lore' && !SKILLS.includes(k)) skillsRest[k] = srcSkills[k];
  });

  const srcProf = (c.proficiencies && typeof c.proficiencies === 'object') ? c.proficiencies : {};
  const weapons = {};
  WEAPONS.forEach((w) => { weapons[w] = String((srcProf.weapons && srcProf.weapons[w] && srcProf.weapons[w].proficiency) || 0); });
  const armor = {};
  ARMOR.forEach((a) => { armor[a] = String((srcProf.armor && srcProf.armor[a] && srcProf.armor[a].proficiency) || 0); });
  const profRest = { ...srcProf };
  delete profRest.class;
  delete profRest.weapons;
  delete profRest.armor;

  return {
    id: c.id,
    strings,
    nums,
    abilities,
    saves,
    skills,
    lore,
    skillsRest,
    prof: { class: String(srcProf.class || 0), weapons, armor },
    profRest,
    profWeaponsRest: (srcProf.weapons && typeof srcProf.weapons === 'object') ? srcProf.weapons : {},
    profArmorRest: (srcProf.armor && typeof srcProf.armor === 'object') ? srcProf.armor : {},
    image: c.image || '',
    imagePosition: c.imagePosition || { x: 50, y: 50 },
    hasSpellcasting: !!(c.spellcasting && typeof c.spellcasting === 'object'),
    spellcasting: scToForm(c.spellcasting),
    inventory: Array.isArray(c.inventory) ? c.inventory.map(itemToForm) : [],
    arrays: ARR_SECTIONS.reduce((acc, s) => {
      const codec = SECTION_CODEC[s.key];
      const to = codec ? codec.to : entryToForm;
      acc[s.key] = Array.isArray(c[s.key]) ? c[s.key].map(to) : [];
      return acc;
    }, {}),
    objects: OBJ_SECTIONS.reduce((acc, s) => {
      const has = !!(c[s.key] && typeof c[s.key] === 'object');
      const codec = OBJ_CODEC[s.key];
      // Codec-backed sections carry a form state shaped by `to`; the rest still
      // round-trip through a `{has, json}` raw-JSON box until their slice lands.
      if (codec) acc[s.key] = { has, form: codec.to(has ? c[s.key] : {}) };
      else acc[s.key] = { has, json: JSON.stringify(has ? c[s.key] : {}, null, 2) };
      return acc;
    }, {}),
    advanced: JSON.stringify(rest, null, 2),
  };
};

const blankCharacter = () => toForm({ name: '' });

const tierEntry = (proficiency) => ({ proficiency, name: getProficiencyLabel(proficiency) });

const TierSelect = ({ label, name, value, onChange }) => (
  <div className="form-group">
    <label>{label}</label>
    <select aria-label={name || label} value={value} onChange={(e) => onChange(e.target.value)}>
      {TIERS.map((t) => <option key={t} value={t}>{t} · {getProficiencyLabel(t)}</option>)}
    </select>
  </div>
);

const SpellRow = ({ index, spell, onChange, onRemove }) => {
  const setStr = (k, v) => onChange({ ...spell, str: { ...spell.str, [k]: v } });
  const setNum = (k, v) => onChange({ ...spell, num: { ...spell.num, [k]: v } });
  const setH = (i, patch) =>
    onChange({ ...spell, heightened: spell.heightened.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) });
  const addH = () => onChange({ ...spell, heightened: [...spell.heightened, { key: '', text: '' }] });
  const rmH = (i) => onChange({ ...spell, heightened: spell.heightened.filter((_, idx) => idx !== i) });

  return (
    <div className="gm-card" data-testid={`spell-${index}`}>
      <div className="gm-row">
        <div className="form-group">
          <label>spell name</label>
          <input aria-label={`spell-${index}-name`} value={spell.str.name} onChange={(e) => setStr('name', e.target.value)} />
        </div>
        <div className="form-group">
          <label>level</label>
          <input aria-label={`spell-${index}-level`} type="number" value={spell.num.level} onChange={(e) => setNum('level', e.target.value)} />
        </div>
        <div className="form-group">
          <label>baseLevel</label>
          <input aria-label={`spell-${index}-baseLevel`} type="number" value={spell.num.baseLevel} onChange={(e) => setNum('baseLevel', e.target.value)} />
        </div>
      </div>
      <div className="gm-row">
        {['actions', 'range', 'area', 'targets', 'defense', 'duration'].map((k) => (
          <div className="form-group" key={k}>
            <label>{k}</label>
            <input aria-label={`spell-${index}-${k}`} value={spell.str[k]} onChange={(e) => setStr(k, e.target.value)} />
          </div>
        ))}
      </div>
      <div className="form-group">
        <label>traits (comma-separated)</label>
        <input aria-label={`spell-${index}-traits`} value={spell.traits} onChange={(e) => onChange({ ...spell, traits: e.target.value })} />
      </div>
      <div className="form-group">
        <label>description</label>
        <textarea aria-label={`spell-${index}-description`} rows={3} value={spell.str.description || ''} onChange={(e) => setStr('description', e.target.value)} />
      </div>
      <div className="form-group">
        <label>heightened</label>
        {spell.heightened.map((h, i) => (
          <div key={i} className="gm-row gm-rank-row">
            <input aria-label={`spell-${index}-h-${i}-key`} placeholder="e.g. +1 / 3rd" value={h.key} onChange={(e) => setH(i, { key: e.target.value })} />
            <input aria-label={`spell-${index}-h-${i}-text`} placeholder="effect" value={h.text} onChange={(e) => setH(i, { text: e.target.value })} />
            <button className="btn-small btn-danger" onClick={() => rmH(i)}>Remove</button>
          </div>
        ))}
        <button className="btn-small btn-secondary" onClick={addH}>Add heightened</button>
      </div>
      <button className="btn-small btn-danger" onClick={onRemove}>Remove spell</button>
    </div>
  );
};

// One compact inventory row: a clickable body (name · ×qty · Bulk · flags)
// that opens the edit modal, and a red ✕ at the far right that removes the
// entry. Controlled by the parent form; containers are a single row here —
// their contents are edited inside the modal.
const ItemRow = ({ item, tag, catalogList, onEdit, onRemove }) => {
  const isRef = !!item.__ref;
  const sel = isRef ? catalogList.find((c) => String(c.id) === String(item.ref)) : null;
  const known = isRef && !!sel;
  const label = isRef
    ? sel
      ? sel.name
      : `${item.ref || '(none)'} (not in catalog)`
    : item.name || '(unnamed item)';
  const qty =
    item.quantity === '' || item.quantity == null ? 1 : item.quantity;
  const bulk = isRef
    ? sel
      ? formatBulk(sel.weight || 0)
      : '—'
    : formatBulk(Number(item.weight) || 0);

  return (
    <div className="gm-inv-row" data-testid={tag}>
      <button type="button" className="gm-inv-main" onClick={onEdit}>
        <span
          className={`gm-inv-label${known ? '' : ' gm-warn'}`}
          data-testid={
            known ? `${tag}-summary` : isRef ? `${tag}-unknown` : undefined
          }
        >
          {label}
        </span>
        <span className="gm-inv-meta">
          ×{qty} · Bulk {bulk}
          {isRef && item.invested ? ' · invested' : ''}
          {isRef && (item.isContainer || (sel && sel.container)) ? ' · container' : ''}
          {!isRef ? ' · legacy' : ''}
        </span>
      </button>
      <button
        type="button"
        className="gm-inv-x"
        aria-label={`remove ${tag}`}
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
};

const CharacterForm = ({ initial, isNew, existingIds, catalog, onSaved, onRestored }) => {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const catalogList = Array.isArray(catalog) ? catalog : [];
  const [confirm, setConfirm] = useState(null); // null | {kind:'delete'} | {kind:'collision',id,payload}
  const [showHistory, setShowHistory] = useState(false);
  const [tab, setTab] = useState('stats'); // active subtab
  const [editing, setEditing] = useState(null); // { path:[i] } | null — open item editor
  const [picker, setPicker] = useState(null); // { kind:'top' } | { kind:'container', path } | { kind:'change', path } | null
  const [arrSel, setArrSel] = useState({}); // { [arraySectionKey]: openEntryIndex }

  const setStr = (k, v) => setF((c) => ({ ...c, strings: { ...c.strings, [k]: v } }));
  const setNum = (k, v) => setF((c) => ({ ...c, nums: { ...c.nums, [k]: v } }));
  const setAbility = (k, v) => setF((c) => ({ ...c, abilities: { ...c.abilities, [k]: v } }));
  const setSave = (k, v) => setF((c) => ({ ...c, saves: { ...c.saves, [k]: v } }));
  const setSkill = (k, v) => setF((c) => ({ ...c, skills: { ...c.skills, [k]: v } }));
  const setProfClass = (v) => setF((c) => ({ ...c, prof: { ...c.prof, class: v } }));
  const setWeapon = (k, v) => setF((c) => ({ ...c, prof: { ...c.prof, weapons: { ...c.prof.weapons, [k]: v } } }));
  const setArmor = (k, v) => setF((c) => ({ ...c, prof: { ...c.prof, armor: { ...c.prof.armor, [k]: v } } }));
  const setLore = (i, patch) => setF((c) => ({ ...c, lore: c.lore.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  const addLore = () => setF((c) => ({ ...c, lore: [...c.lore, { name: '', proficiency: '1' }] }));
  const removeLore = (i) => setF((c) => ({ ...c, lore: c.lore.filter((_, idx) => idx !== i) }));

  const sc = f.spellcasting;
  const setSc = (patch) => setF((c) => ({ ...c, spellcasting: { ...c.spellcasting, ...patch } }));
  const setSlot = (i, patch) => setSc({ slots: sc.slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const addSlot = () => setSc({ slots: [...sc.slots, { level: '', count: '0' }] });
  const rmSlot = (i) => setSc({ slots: sc.slots.filter((_, idx) => idx !== i) });
  const setSpell = (i, next) => setSc({ spells: sc.spells.map((s, idx) => (idx === i ? next : s)) });
  const addSpell = () => setSc({ spells: [...sc.spells, spellToForm({ name: '', level: 0, baseLevel: 1 })] });
  const rmSpell = (i) => setSc({ spells: sc.spells.filter((_, idx) => idx !== i) });

  // Inventory entries live at a path: [i] for a top-level row, [i, j] for the
  // j-th content of a container row (depth 1 — the data is at most one level).
  // All edits flow through these path helpers so the row list, the edit modal
  // and the catalog picker share one source of truth (the lifted form state).
  const patchAt = (path, patch) =>
    setF((c) => {
      const inv = c.inventory.slice();
      if (path.length === 1) {
        inv[path[0]] = { ...inv[path[0]], ...patch };
      } else {
        const [i, j] = path;
        const parent = inv[i];
        const contents = parent.contents.slice();
        contents[j] = { ...contents[j], ...patch };
        inv[i] = { ...parent, contents };
      }
      return { ...c, inventory: inv };
    });

  const removeAt = (path) =>
    setF((c) => {
      const inv = c.inventory.slice();
      if (path.length === 1) {
        inv.splice(path[0], 1);
      } else {
        const [i, j] = path;
        const parent = inv[i];
        inv[i] = { ...parent, contents: parent.contents.filter((_, k) => k !== j) };
      }
      return { ...c, inventory: inv };
    });

  // Re-point a row/content at another catalog item. Keeps `origRef` untouched
  // so itemFromForm drops stale extra/container carry-over (ref !== origRef),
  // and re-derives container-ness from the new catalog item.
  const repointAt = (path, refId) =>
    setF((c) => {
      const s = catalogList.find((x) => String(x.id) === String(refId));
      const willContain = !!(s && s.container);
      const apply = (it) => ({
        ...it,
        ref: refId,
        isContainer: willContain,
        contents: willContain ? it.contents || [] : [],
      });
      const inv = c.inventory.slice();
      if (path.length === 1) {
        inv[path[0]] = apply(inv[path[0]]);
      } else {
        const [i, j] = path;
        const parent = inv[i];
        const contents = parent.contents.slice();
        contents[j] = apply(contents[j]);
        inv[i] = { ...parent, contents };
      }
      return { ...c, inventory: inv };
    });

  // Append a fresh catalog reference (a new uid is minted by itemFromForm on
  // save). target: { kind:'top' } | { kind:'container', path:[i] }.
  const addRef = (target, refId) =>
    setF((c) => {
      const entry = itemToForm({ ref: refId, quantity: 1 });
      if (target.kind === 'container') {
        const i = target.path[0];
        const inv = c.inventory.slice();
        const parent = inv[i];
        inv[i] = { ...parent, contents: [...(parent.contents || []), entry] };
        return { ...c, inventory: inv };
      }
      return { ...c, inventory: [...c.inventory, entry] };
    });

  // The picker hands back an array. A re-point can only target one item
  // (multiSelect is off for 'change'); adds append every chosen ref.
  const onPickerSelect = (catalogItems) => {
    if (!picker || !catalogItems.length) return;
    if (picker.kind === 'change') repointAt(picker.path, catalogItems[0].id);
    else catalogItems.forEach((it) => addRef(picker, it.id));
  };

  // Before save, re-derive each ref's container-ness from the catalog (a
  // freshly added/repointed ref, or a forked id not yet synced, keeps its
  // current flag). Recurses into container contents.
  const syncFlags = (rows) =>
    (Array.isArray(rows) ? rows : []).map((it) => {
      if (!it.__ref) return it;
      const sel = catalogList.find((c) => String(c.id) === String(it.ref));
      return {
        ...it,
        isContainer: sel ? !!sel.container : !!it.isContainer,
        contents: syncFlags(it.contents || []),
      };
    });

  const setArr = (key, i, patch) =>
    setF((c) => ({
      ...c,
      arrays: { ...c.arrays, [key]: c.arrays[key].map((e, idx) => (idx === i ? { ...e, ...patch } : e)) },
    }));
  const selectArr = (key, i) => setArrSel((s) => ({ ...s, [key]: i }));
  const addArr = (key) => {
    // The appended entry's index is the current length; open it immediately.
    setArrSel((s) => ({ ...s, [key]: f.arrays[key].length }));
    setF((c) => {
      const codec = SECTION_CODEC[key];
      const entry = codec ? codec.blank() : { name: '', restJson: '{}' };
      return { ...c, arrays: { ...c.arrays, [key]: [...c.arrays[key], entry] } };
    });
  };
  const rmArr = (key, i) => {
    // Keep the open entry stable: deselect if it was removed, shift down if a
    // row above it went away.
    setArrSel((s) => {
      const cur = s[key];
      if (cur == null) return s;
      if (cur === i) return { ...s, [key]: null };
      if (cur > i) return { ...s, [key]: cur - 1 };
      return s;
    });
    setF((c) => ({ ...c, arrays: { ...c.arrays, [key]: c.arrays[key].filter((_, idx) => idx !== i) } }));
  };
  const setObj = (key, patch) =>
    setF((c) => ({ ...c, objects: { ...c.objects, [key]: { ...c.objects[key], ...patch } } }));

  const save = async () => {
    const name = f.strings.name.trim();
    if (!name) { setError('Name is required.'); return; }
    let rest;
    try {
      rest = f.advanced.trim() ? JSON.parse(f.advanced) : {};
    } catch {
      setError('Advanced JSON is not valid JSON.');
      return;
    }
    if (rest === null || typeof rest !== 'object' || Array.isArray(rest)) {
      setError('Advanced JSON must be an object.');
      return;
    }

    const id = f.id || slugify(name);
    const payload = { ...rest, id };
    STRINGS.forEach((k) => { const v = f.strings[k].trim(); if (v) payload[k] = v; });
    NUMS.forEach((k) => { payload[k] = toInt(f.nums[k]); });
    payload.abilities = {};
    ABILITIES.forEach((k) => { payload.abilities[k] = toInt(f.abilities[k]); });
    payload.saves = {};
    SAVES.forEach((k) => { payload.saves[k] = toInt(f.saves[k]); });

    const skills = { ...f.skillsRest };
    SKILLS.forEach((sk) => { const p = toInt(f.skills[sk]); if (p > 0) skills[sk] = { proficiency: p }; });
    const lore = f.lore.map((l) => ({ name: l.name.trim(), proficiency: toInt(l.proficiency) })).filter((l) => l.name);
    if (lore.length) skills.lore = lore;
    payload.skills = skills;

    payload.proficiencies = {
      ...f.profRest,
      class: toInt(f.prof.class),
      weapons: { ...f.profWeaponsRest },
      armor: { ...f.profArmorRest },
    };
    WEAPONS.forEach((w) => { payload.proficiencies.weapons[w] = tierEntry(toInt(f.prof.weapons[w])); });
    ARMOR.forEach((a) => { payload.proficiencies.armor[a] = tierEntry(toInt(f.prof.armor[a])); });

    if (f.image) { payload.image = f.image; payload.imagePosition = f.imagePosition; }
    if (f.hasSpellcasting) payload.spellcasting = scFromForm(f);

    try {
      payload.inventory = syncFlags(f.inventory).map((it, idx) => itemFromForm(it, idx));
      ARR_SECTIONS.forEach((s) => {
        const from = SECTION_CODEC[s.key] ? SECTION_CODEC[s.key].from : entryFromForm;
        payload[s.key] = f.arrays[s.key].map((e, idx) => from(e, s.label, idx));
      });
    } catch (e) {
      setError(e.message);
      return;
    }
    for (const s of OBJ_SECTIONS) {
      const o = f.objects[s.key];
      if (!o.has) continue;
      const codec = OBJ_CODEC[s.key];
      if (codec) {
        try {
          payload[s.key] = codec.from(o.form);
        } catch (e) {
          setError(`${s.label} ${e.message}`);
          return;
        }
      } else {
        let parsed;
        try {
          parsed = o.json.trim() ? JSON.parse(o.json) : {};
        } catch {
          setError(`${s.label} is not valid JSON.`);
          return;
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setError(`${s.label} must be a JSON object.`);
          return;
        }
        payload[s.key] = parsed;
      }
    }

    if (isNew && existingIds && existingIds.has(id)) {
      setConfirm({ kind: 'collision', id, payload });
      return;
    }
    await submit(id, payload);
  };

  const submit = async (id, payload) => {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await saveDocument('character', id, payload);
      onSaved(isNew, id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async () => {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      await deleteDocument('character', f.id);
      onSaved(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const SUBTABS = [
    { key: 'stats', label: 'Stats' },
    { key: 'proficiencies', label: 'Proficiencies' },
    { key: 'spellcasting', label: 'Spellcasting' },
    { key: 'feats', label: 'Feats' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'strikes', label: 'Strikes' },
    { key: 'reactions', label: 'Reactions' },
    { key: 'actions', label: 'Actions' },
    { key: 'familiar', label: 'Familiar' },
    { key: 'animalCompanion', label: 'Animal Companion' },
    { key: 'advanced', label: 'Advanced' },
  ];

  // Master-detail: the section's entries are a searchable picker list; only the
  // selected entry's editor mounts on the right. The detail body is unchanged
  // from before (codec subform, or the generic name + raw-JSON pair) so every
  // existing per-entry testid/aria-label still resolves once a row is opened.
  const renderArrSection = (s) => {
    const codec = SECTION_CODEC[s.key];
    const nameOf = codec && codec.nameOf ? codec.nameOf : (e) => e.name;
    return (
      <EntryListEditor
        label={s.label}
        idPrefix={s.key}
        entries={f.arrays[s.key]}
        selectedIndex={arrSel[s.key] ?? null}
        onSelect={(i) => selectArr(s.key, i)}
        onAdd={() => addArr(s.key)}
        onRemove={(i) => rmArr(s.key, i)}
        nameOf={nameOf}
        addLabel={`Add ${s.label.toLowerCase()} entry`}
        renderDetail={(e, i) => (
          <div className="gm-card" data-testid={`${s.key}-${i}`}>
            {codec ? (
              <codec.Comp
                value={e}
                idPrefix={`${s.key}-${i}`}
                onChange={(next) => setArr(s.key, i, next)}
              />
            ) : (
              <>
                <div className="form-group">
                  <label>name</label>
                  <input
                    aria-label={`${s.key}-${i}-name`}
                    value={e.name}
                    onChange={(ev) => setArr(s.key, i, { name: ev.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>extra fields (raw JSON)</label>
                  <textarea
                    aria-label={`${s.key}-${i}-json`}
                    className="gm-json"
                    rows={4}
                    value={e.restJson}
                    onChange={(ev) => setArr(s.key, i, { restJson: ev.target.value })}
                  />
                </div>
              </>
            )}
          </div>
        )}
      />
    );
  };

  const renderObjSection = (s) => {
    const codec = OBJ_CODEC[s.key];
    const o = f.objects[s.key];
    return (
      <div className="form-group">
        <label>{s.label}</label>
        {!o.has ? (
          <button
            className="btn-small btn-secondary"
            onClick={() =>
              setObj(s.key, codec ? { has: true, form: codec.blank() } : { has: true })
            }
          >
            Add {s.label.toLowerCase()}
          </button>
        ) : codec ? (
          <>
            <codec.Comp
              value={o.form}
              idPrefix={s.key}
              onChange={(form) => setObj(s.key, { form })}
            />
            <button
              className="btn-small btn-danger"
              onClick={() => setObj(s.key, { has: false })}
            >
              Remove {s.label.toLowerCase()}
            </button>
          </>
        ) : (
          <>
            <textarea
              aria-label={`${s.key}-json`}
              className="gm-json"
              rows={6}
              value={o.json}
              onChange={(ev) => setObj(s.key, { json: ev.target.value })}
            />
            <button
              className="btn-small btn-danger"
              onClick={() => setObj(s.key, { has: false })}
            >
              Remove {s.label.toLowerCase()}
            </button>
          </>
        )}
      </div>
    );
  };

  const arrFor = (key) => ARR_SECTIONS.find((s) => s.key === key);
  const objFor = (key) => OBJ_SECTIONS.find((s) => s.key === key);
  const editItem = editing ? f.inventory[editing.path[0]] : null;
  const editTag = editing ? `item-${editing.path[0]}` : 'item';

  return (
    <div className="gm-card" data-testid={`character-form-${f.id || 'new'}`}>
      <h3>{f.strings.name || '(new character)'}</h3>

      <div className="gm-subtabs" aria-label="character sections">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`gm-subtab${tab === t.key ? ' active' : ''}`}
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="gm-subtab-content">
        {tab === 'stats' && (
          <>
            <div className="gm-row">
              {STRINGS.map((k) => (
                <div className="form-group" key={k}>
                  <label>{k}</label>
                  <input aria-label={k} value={f.strings[k]} onChange={(e) => setStr(k, e.target.value)} />
                </div>
              ))}
            </div>

            <div className="gm-row">
              {NUMS.map((k) => (
                <div className="form-group" key={k}>
                  <label>{k}</label>
                  <input aria-label={k} type="number" value={f.nums[k]} onChange={(e) => setNum(k, e.target.value)} />
                </div>
              ))}
            </div>

            <div className="form-group">
              <label>Portrait</label>
              <ImageField value={f.image} onChange={(v) => setF((c) => ({ ...c, image: v }))} position={f.imagePosition} onPositionChange={(p) => setF((c) => ({ ...c, imagePosition: p }))} ariaLabel="character-image" />
            </div>

            <div className="form-group">
              <label>Abilities</label>
              <div className="gm-row">
                {ABILITIES.map((k) => (
                  <div className="form-group" key={k}>
                    <label>{k}</label>
                    <input aria-label={k} type="number" value={f.abilities[k]} onChange={(e) => setAbility(k, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Saves</label>
              <div className="gm-row">
                {SAVES.map((k) => (
                  <div className="form-group" key={k}>
                    <label>{k}</label>
                    <input aria-label={k} type="number" value={f.saves[k]} onChange={(e) => setSave(k, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Skills (proficiency tier)</label>
              <div className="gm-row gm-skill-grid">
                {SKILLS.map((sk) => (
                  <TierSelect key={sk} label={sk} value={f.skills[sk]} onChange={(v) => setSkill(sk, v)} />
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Lore</label>
              {f.lore.map((l, i) => (
                <div key={i} className="gm-row gm-rank-row">
                  <input aria-label={`lore-${i}-name`} placeholder="Lore name" value={l.name} onChange={(e) => setLore(i, { name: e.target.value })} />
                  <select aria-label={`lore-${i}-proficiency`} value={l.proficiency} onChange={(e) => setLore(i, { proficiency: e.target.value })}>
                    {TIERS.map((t) => <option key={t} value={t}>{t} · {getProficiencyLabel(t)}</option>)}
                  </select>
                  <button className="btn-small btn-danger" onClick={() => removeLore(i)}>Remove</button>
                </div>
              ))}
              <button className="btn-small btn-secondary" onClick={addLore}>Add lore</button>
            </div>
          </>
        )}

        {tab === 'proficiencies' && (
          <div className="form-group">
            <label>Proficiencies</label>
            <div className="gm-row">
              <TierSelect label="class" name="class-proficiency" value={f.prof.class} onChange={setProfClass} />
            </div>
            <p className="gm-count">Weapons</p>
            <div className="gm-row">
              {WEAPONS.map((w) => <TierSelect key={w} label={w} value={f.prof.weapons[w]} onChange={(v) => setWeapon(w, v)} />)}
            </div>
            <p className="gm-count">Armor</p>
            <div className="gm-row">
              {ARMOR.map((a) => <TierSelect key={a} label={a} value={f.prof.armor[a]} onChange={(v) => setArmor(a, v)} />)}
            </div>
          </div>
        )}

        {tab === 'spellcasting' && (
          <div className="form-group">
            <label>Spellcasting</label>
            {!f.hasSpellcasting ? (
              <button
                className="btn-small btn-secondary"
                onClick={() => setF((c) => ({ ...c, hasSpellcasting: true }))}
              >
                Add spellcasting
              </button>
            ) : (
              <>
                <div className="gm-row">
                  <div className="form-group">
                    <label>tradition</label>
                    <input aria-label="sc-tradition" value={sc.tradition} onChange={(e) => setSc({ tradition: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>ability</label>
                    <input aria-label="sc-ability" value={sc.ability} onChange={(e) => setSc({ ability: e.target.value })} />
                  </div>
                  <TierSelect label="proficiency" name="sc-proficiency" value={sc.proficiency} onChange={(v) => setSc({ proficiency: v })} />
                  <div className="form-group">
                    <label>focus max</label>
                    <input aria-label="sc-focus-max" type="number" value={sc.focusMax} onChange={(e) => setSc({ focusMax: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>focus current</label>
                    <input aria-label="sc-focus-current" type="number" value={sc.focusCurrent} onChange={(e) => setSc({ focusCurrent: e.target.value })} />
                  </div>
                </div>

                <p className="gm-count">Spell slots</p>
                {sc.slots.map((s, i) => (
                  <div key={i} className="gm-row gm-rank-row">
                    <input aria-label={`slot-${i}-level`} placeholder="rank (e.g. 1)" value={s.level} onChange={(e) => setSlot(i, { level: e.target.value })} />
                    <input aria-label={`slot-${i}-count`} type="number" placeholder="count" value={s.count} onChange={(e) => setSlot(i, { count: e.target.value })} />
                    <button className="btn-small btn-danger" onClick={() => rmSlot(i)}>Remove</button>
                  </div>
                ))}
                <button className="btn-small btn-secondary" onClick={addSlot}>Add slot rank</button>

                <p className="gm-count">Spells</p>
                {sc.spells.map((s, i) => (
                  <SpellRow
                    key={i}
                    index={i}
                    spell={s}
                    onChange={(next) => setSpell(i, next)}
                    onRemove={() => rmSpell(i)}
                  />
                ))}
                <button className="btn-small btn-secondary" onClick={addSpell}>Add spell</button>
              </>
            )}
          </div>
        )}

        {tab === 'feats' && renderArrSection(arrFor('feats'))}
        {tab === 'strikes' && renderArrSection(arrFor('strikes'))}
        {tab === 'reactions' && renderArrSection(arrFor('reactions'))}
        {tab === 'actions' && renderArrSection(arrFor('actions'))}
        {tab === 'familiar' && renderObjSection(objFor('familiar'))}
        {tab === 'animalCompanion' && renderObjSection(objFor('animalCompanion'))}

        {tab === 'inventory' && (
          <div className="form-group">
            <label>Inventory</label>
            {f.inventory.length === 0 && (
              <p className="gm-count">No items yet. Use “Add item”.</p>
            )}
            {f.inventory.map((it, i) => (
              <ItemRow
                key={i}
                item={it}
                tag={`item-${i}`}
                catalogList={catalogList}
                onEdit={() => setEditing({ path: [i] })}
                onRemove={() => removeAt([i])}
              />
            ))}
            <button
              className="btn-small btn-secondary"
              onClick={() => setPicker({ kind: 'top' })}
            >
              Add item
            </button>
          </div>
        )}

        {tab === 'advanced' && (
          <div className="form-group">
            <label>Advanced — class blocks (thaumaturge/monk), crafting, staff/wand spells, metadata… (raw JSON)</label>
            <textarea
              aria-label="advanced-json"
              className="gm-json"
              rows={12}
              value={f.advanced}
              onChange={(e) => setF((c) => ({ ...c, advanced: e.target.value }))}
            />
          </div>
        )}
      </div>

      {error && <p className="gm-warn" role="alert">{error}</p>}
      <div className="gm-actions">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {isNew ? 'Create character' : 'Save'}
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

      <ItemEditModal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        item={editItem}
        tag={editTag}
        catalogList={catalogList}
        onPatch={(p) => editing && patchAt(editing.path, p)}
        onRepoint={() => editing && setPicker({ kind: 'change', path: editing.path })}
        onAddToContainer={() => editing && setPicker({ kind: 'container', path: editing.path })}
        onContentPatch={(j, p) => editing && patchAt([editing.path[0], j], p)}
        onContentRepoint={(j) => editing && setPicker({ kind: 'change', path: [editing.path[0], j] })}
        onContentRemove={(j) => editing && removeAt([editing.path[0], j])}
      />

      <CatalogPickerModal
        isOpen={!!picker}
        onClose={() => setPicker(null)}
        catalog={catalogList}
        onSelect={onPickerSelect}
        multiSelect={!!picker && picker.kind !== 'change'}
        title={
          picker && picker.kind === 'container'
            ? 'Add items to the container'
            : picker && picker.kind === 'change'
            ? 'Change catalog item'
            : 'Add items from the catalog'
        }
      />

      {!isNew && (
        <HistoryModal
          isOpen={showHistory}
          collection="character"
          id={f.id}
          name={f.strings.name}
          onClose={() => setShowHistory(false)}
          onRestored={(doc) => {
            setShowHistory(false);
            if (doc) setF(toForm(doc));
            setError(null);
            onRestored();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={confirm?.kind === 'delete'}
        title="Delete character"
        message={`Permanently delete the character “${f.strings.name}”. This cannot be undone — restore it from History if you have it.`}
        confirmLabel="Delete forever"
        requireType={f.strings.name}
        onConfirm={doRemove}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        isOpen={confirm?.kind === 'collision'}
        title="Overwrite existing entry?"
        message={`A character with id “${confirm?.id}” already exists. Saving will overwrite it.`}
        confirmLabel="Overwrite"
        onConfirm={() => submit(confirm.id, confirm.payload)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};

const GmCharacters = () => {
  // Edit the AUTHORED docs (catalog refs intact), never the resolved view.
  const { rawCharacters, items } = useContent();
  const list = useMemo(
    () => (Array.isArray(rawCharacters) ? rawCharacters : []),
    [rawCharacters]
  );
  const existingIds = useMemo(() => existingIdSet(list), [list]);
  const [flash, setFlash] = useState(null);
  const [activeId, setActiveId] = useState(null); // character id, 'new', or null

  const ids = list.map((c) => c.id);
  // Resolve the effective tab: keep the chosen one if still valid, else the
  // first character, else the New tab (empty roster). This also lands us on a
  // freshly created character once it arrives in the synced list.
  const current =
    activeId && (activeId === 'new' || ids.includes(activeId))
      ? activeId
      : ids[0] || 'new';
  const activeChar = current === 'new' ? null : list.find((c) => c.id === current);

  const onSaved = (wasNew, id) => {
    setFlash('Saved. Changes are live for every connected player.');
    if (wasNew && id) setActiveId(id);
  };
  const onRestored = () =>
    setFlash('Restored. Changes are live for every connected player.');

  return (
    <div className="gm-characters">
      {flash && <p className="gm-ok" role="status">{flash}</p>}

      <nav className="gm-nav" aria-label="characters">
        {list.map((c) => (
          <button
            key={c.id}
            className={`gm-nav-link ${c.id === current ? 'active' : ''}`}
            aria-pressed={c.id === current}
            onClick={() => setActiveId(c.id)}
          >
            {c.name || c.id}
          </button>
        ))}
        <button
          className={`gm-nav-link ${current === 'new' ? 'active' : ''}`}
          aria-pressed={current === 'new'}
          onClick={() => setActiveId('new')}
        >
          + New character
        </button>
      </nav>

      {/* Only the active character's (very large) form mounts. */}
      {current === 'new' ? (
        <CharacterForm
          key="new"
          initial={blankCharacter()}
          isNew
          existingIds={existingIds}
          catalog={items}
          onSaved={onSaved}
          onRestored={onRestored}
        />
      ) : activeChar ? (
        <CharacterForm
          key={activeChar.id}
          initial={toForm(activeChar)}
          isNew={false}
          existingIds={existingIds}
          catalog={items}
          onSaved={onSaved}
          onRestored={onRestored}
        />
      ) : null}
    </div>
  );
};

export default GmCharacters;
