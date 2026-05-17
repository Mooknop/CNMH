import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify, existingIdSet } from '../../utils/contentUtils';
import { SKILL_ABILITY_MAP, getProficiencyLabel } from '../../utils/CharacterUtils';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import HistoryModal from '../../components/gm/HistoryModal';
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
const itemToForm = (it) => {
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

// Returns the rebuilt item, or throws Error with a GM-readable message.
const itemFromForm = (f, index) => {
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
    hasSpellcasting: !!(c.spellcasting && typeof c.spellcasting === 'object'),
    spellcasting: scToForm(c.spellcasting),
    inventory: Array.isArray(c.inventory) ? c.inventory.map(itemToForm) : [],
    arrays: ARR_SECTIONS.reduce((acc, s) => {
      acc[s.key] = Array.isArray(c[s.key]) ? c[s.key].map(entryToForm) : [];
      return acc;
    }, {}),
    objects: OBJ_SECTIONS.reduce((acc, s) => {
      const has = !!(c[s.key] && typeof c[s.key] === 'object');
      acc[s.key] = { has, json: JSON.stringify(has ? c[s.key] : {}, null, 2) };
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

const CharacterForm = ({ initial, isNew, existingIds, onSaved, onRestored }) => {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // null | {kind:'delete'} | {kind:'collision',id,payload}
  const [showHistory, setShowHistory] = useState(false);

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

  const setItem = (i, patch) =>
    setF((c) => ({ ...c, inventory: c.inventory.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));
  const addItem = () => setF((c) => ({ ...c, inventory: [...c.inventory, itemToForm({ name: '' })] }));
  const rmItem = (i) => setF((c) => ({ ...c, inventory: c.inventory.filter((_, idx) => idx !== i) }));

  const setArr = (key, i, patch) =>
    setF((c) => ({
      ...c,
      arrays: { ...c.arrays, [key]: c.arrays[key].map((e, idx) => (idx === i ? { ...e, ...patch } : e)) },
    }));
  const addArr = (key) =>
    setF((c) => ({ ...c, arrays: { ...c.arrays, [key]: [...c.arrays[key], { name: '', restJson: '{}' }] } }));
  const rmArr = (key, i) =>
    setF((c) => ({ ...c, arrays: { ...c.arrays, [key]: c.arrays[key].filter((_, idx) => idx !== i) } }));
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

    if (f.hasSpellcasting) payload.spellcasting = scFromForm(f);

    try {
      payload.inventory = f.inventory.map((it, idx) => itemFromForm(it, idx));
      ARR_SECTIONS.forEach((s) => {
        payload[s.key] = f.arrays[s.key].map((e, idx) => entryFromForm(e, s.label, idx));
      });
    } catch (e) {
      setError(e.message);
      return;
    }
    for (const s of OBJ_SECTIONS) {
      const o = f.objects[s.key];
      if (!o.has) continue;
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
      onSaved(isNew);
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

  return (
    <div className="gm-card" data-testid={`character-form-${f.id || 'new'}`}>
      <h3>{f.strings.name || '(new character)'}</h3>

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

      <div className="form-group">
        <label>Inventory</label>
        {f.inventory.map((it, i) => (
          <div className="gm-card" data-testid={`item-${i}`} key={i}>
            <div className="gm-row">
              <div className="form-group">
                <label>name</label>
                <input aria-label={`item-${i}-name`} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>price</label>
                <input aria-label={`item-${i}-price`} type="number" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} />
              </div>
              <div className="form-group">
                <label>quantity</label>
                <input aria-label={`item-${i}-quantity`} type="number" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} />
              </div>
              <div className="form-group">
                <label>weight</label>
                <input aria-label={`item-${i}-weight`} type="number" value={it.weight} onChange={(e) => setItem(i, { weight: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>traits (comma-separated)</label>
              <input aria-label={`item-${i}-traits`} value={it.traits} onChange={(e) => setItem(i, { traits: e.target.value })} />
            </div>
            <div className="form-group">
              <label>description</label>
              <textarea aria-label={`item-${i}-description`} rows={2} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
            </div>
            <div className="form-group">
              <label>extra fields — shield, strikes, bonus, potency, invested… (raw JSON)</label>
              <textarea
                aria-label={`item-${i}-json`}
                className="gm-json"
                rows={5}
                value={it.restJson}
                onChange={(e) => setItem(i, { restJson: e.target.value })}
              />
            </div>
            <button className="btn-small btn-danger" onClick={() => rmItem(i)}>Remove item</button>
          </div>
        ))}
        <button className="btn-small btn-secondary" onClick={addItem}>Add item</button>
      </div>

      {ARR_SECTIONS.map((s) => (
        <div className="form-group" key={s.key}>
          <label>{s.label}</label>
          {f.arrays[s.key].map((e, i) => (
            <div className="gm-card" data-testid={`${s.key}-${i}`} key={i}>
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
              <button className="btn-small btn-danger" onClick={() => rmArr(s.key, i)}>
                Remove {s.label.toLowerCase()} entry
              </button>
            </div>
          ))}
          <button className="btn-small btn-secondary" onClick={() => addArr(s.key)}>
            Add {s.label.toLowerCase()} entry
          </button>
        </div>
      ))}

      {OBJ_SECTIONS.map((s) => (
        <div className="form-group" key={s.key}>
          <label>{s.label}</label>
          {!f.objects[s.key].has ? (
            <button className="btn-small btn-secondary" onClick={() => setObj(s.key, { has: true })}>
              Add {s.label.toLowerCase()}
            </button>
          ) : (
            <>
              <textarea
                aria-label={`${s.key}-json`}
                className="gm-json"
                rows={6}
                value={f.objects[s.key].json}
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
      ))}

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

      {!isNew && (
        <HistoryModal
          isOpen={showHistory}
          collection="character"
          id={f.id}
          name={f.strings.name}
          onClose={() => setShowHistory(false)}
          onRestored={() => {
            setShowHistory(false);
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
  const { characters } = useContent();
  const list = Array.isArray(characters) ? characters : [];
  const existingIds = existingIdSet(list);
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState(null);

  const onSaved = (wasNew) => {
    if (wasNew) setAdding(false);
    setFlash('Saved. Changes are live for every connected player.');
  };
  const onRestored = () =>
    setFlash('Restored. Changes are live for every connected player.');

  return (
    <div className="gm-characters">
      {flash && <p className="gm-ok" role="status">{flash}</p>}

      {adding ? (
        <CharacterForm
          initial={blankCharacter()}
          isNew
          existingIds={existingIds}
          onSaved={onSaved}
          onRestored={onRestored}
        />
      ) : (
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + New character
        </button>
      )}

      <div className="gm-character-list">
        {list.map((c) => (
          <CharacterForm
            key={c.id}
            initial={toForm(c)}
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

export default GmCharacters;
