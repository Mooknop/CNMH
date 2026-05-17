import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify } from '../../utils/contentUtils';
import { SKILL_ABILITY_MAP, getProficiencyLabel } from '../../utils/CharacterUtils';
import './gm.css';

// Slice 5a: bespoke identity/abilities/saves + raw-JSON Advanced for the rest.
// Slice 5b: skills (incl. the `lore` sub-list) and proficiencies (class /
// weapons / armor) get dedicated forms and leave the Advanced blob. Remaining
// sections (spells, inventory, feats, strikes, actions, familiar) stay in
// Advanced until their own sub-slices.
const STRINGS = ['name', 'ancestry', 'background', 'class', 'keyAbility', 'size', 'senses', 'loreEntryId'];
const NUMS = ['level', 'maxHp', 'ac', 'speed'];
const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const SAVES = ['fortitude', 'reflex', 'will'];
const SKILLS = Object.keys(SKILL_ABILITY_MAP); // 17 standard skills incl. perception
const WEAPONS = ['simple', 'martial', 'advanced', 'unarmed'];
const ARMOR = ['unarmored', 'light', 'medium', 'heavy'];
const TIERS = [0, 1, 2, 3, 4];

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
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

  const strings = {};
  STRINGS.forEach((k) => { strings[k] = c[k] != null ? String(c[k]) : ''; });
  const nums = {};
  NUMS.forEach((k) => { nums[k] = c[k] != null ? String(c[k]) : ''; });
  const abilities = {};
  ABILITIES.forEach((k) => { abilities[k] = String((c.abilities && c.abilities[k]) ?? 10); });
  const saves = {};
  SAVES.forEach((k) => { saves[k] = String((c.saves && c.saves[k]) ?? 0); });

  // Skills: standard skills -> proficiency string; `lore` is an array; any
  // other (unexpected) keys are preserved verbatim.
  const srcSkills = (c.skills && typeof c.skills === 'object') ? c.skills : {};
  const skills = {};
  SKILLS.forEach((sk) => {
    const entry = srcSkills[sk];
    skills[sk] = String((entry && entry.proficiency) || 0);
  });
  const lore = Array.isArray(srcSkills.lore)
    ? srcSkills.lore.map((l) => ({ name: l.name || '', proficiency: String(l.proficiency || 0) }))
    : [];
  const skillsRest = {};
  Object.keys(srcSkills).forEach((k) => {
    if (k !== 'lore' && !SKILLS.includes(k)) skillsRest[k] = srcSkills[k];
  });

  // Proficiencies: class + weapons + armor; preserve any extra categories.
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
    advanced: JSON.stringify(rest, null, 2),
  };
};

const blankCharacter = () => toForm({ name: '' });

const tierEntry = (proficiency) => ({ proficiency, name: getProficiencyLabel(proficiency) });

const TierSelect = ({ label, name, value, onChange }) => (
  <div className="form-group">
    <label>{label}</label>
    <select aria-label={name || label} value={value} onChange={(e) => onChange(e.target.value)}>
      {TIERS.map((t) => (
        <option key={t} value={t}>{t} · {getProficiencyLabel(t)}</option>
      ))}
    </select>
  </div>
);

const CharacterForm = ({ initial, isNew, onSaved }) => {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const setStr = (k, v) => setF((c) => ({ ...c, strings: { ...c.strings, [k]: v } }));
  const setNum = (k, v) => setF((c) => ({ ...c, nums: { ...c.nums, [k]: v } }));
  const setAbility = (k, v) => setF((c) => ({ ...c, abilities: { ...c.abilities, [k]: v } }));
  const setSave = (k, v) => setF((c) => ({ ...c, saves: { ...c.saves, [k]: v } }));
  const setSkill = (k, v) => setF((c) => ({ ...c, skills: { ...c.skills, [k]: v } }));
  const setProfClass = (v) => setF((c) => ({ ...c, prof: { ...c.prof, class: v } }));
  const setWeapon = (k, v) => setF((c) => ({ ...c, prof: { ...c.prof, weapons: { ...c.prof.weapons, [k]: v } } }));
  const setArmor = (k, v) => setF((c) => ({ ...c, prof: { ...c.prof, armor: { ...c.prof.armor, [k]: v } } }));
  const setLore = (i, patch) =>
    setF((c) => ({ ...c, lore: c.lore.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  const addLore = () => setF((c) => ({ ...c, lore: [...c.lore, { name: '', proficiency: '1' }] }));
  const removeLore = (i) => setF((c) => ({ ...c, lore: c.lore.filter((_, idx) => idx !== i) }));

  const save = async () => {
    const name = f.strings.name.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
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
    STRINGS.forEach((k) => {
      const v = f.strings[k].trim();
      if (v) payload[k] = v;
    });
    NUMS.forEach((k) => { payload[k] = toInt(f.nums[k]); });
    payload.abilities = {};
    ABILITIES.forEach((k) => { payload.abilities[k] = toInt(f.abilities[k]); });
    payload.saves = {};
    SAVES.forEach((k) => { payload.saves[k] = toInt(f.saves[k]); });

    // Skills: only emit trained+ skills (untrained is implicit, matching the
    // source data); keep the lore list and any preserved unknown keys.
    const skills = { ...f.skillsRest };
    SKILLS.forEach((sk) => {
      const p = toInt(f.skills[sk]);
      if (p > 0) skills[sk] = { proficiency: p };
    });
    const lore = f.lore
      .map((l) => ({ name: l.name.trim(), proficiency: toInt(l.proficiency) }))
      .filter((l) => l.name);
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

  const remove = async () => {
    if (!f.id || !window.confirm(`Delete character "${f.strings.name}"?`)) return;
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
            <input
              aria-label={`lore-${i}-name`}
              placeholder="Lore name"
              value={l.name}
              onChange={(e) => setLore(i, { name: e.target.value })}
            />
            <select
              aria-label={`lore-${i}-proficiency`}
              value={l.proficiency}
              onChange={(e) => setLore(i, { proficiency: e.target.value })}
            >
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
          {WEAPONS.map((w) => (
            <TierSelect key={w} label={w} value={f.prof.weapons[w]} onChange={(v) => setWeapon(w, v)} />
          ))}
        </div>
        <p className="gm-count">Armor</p>
        <div className="gm-row">
          {ARMOR.map((a) => (
            <TierSelect key={a} label={a} value={f.prof.armor[a]} onChange={(v) => setArmor(a, v)} />
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>Advanced — spells, inventory, feats, strikes, actions, familiar… (raw JSON)</label>
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
          <button className="btn-danger" disabled={busy} onClick={remove}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
};

const GmCharacters = () => {
  const { characters } = useContent();
  const list = Array.isArray(characters) ? characters : [];
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState(null);

  const onSaved = (wasNew) => {
    if (wasNew) setAdding(false);
    setFlash('Saved. Changes are live for every connected player.');
  };

  return (
    <div className="gm-characters">
      {flash && <p className="gm-ok" role="status">{flash}</p>}

      {adding ? (
        <CharacterForm initial={blankCharacter()} isNew onSaved={onSaved} />
      ) : (
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + New character
        </button>
      )}

      <div className="gm-character-list">
        {list.map((c) => (
          <CharacterForm key={c.id} initial={toForm(c)} isNew={false} onSaved={onSaved} />
        ))}
      </div>
    </div>
  );
};

export default GmCharacters;
