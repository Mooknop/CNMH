import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';
import { slugify } from '../../utils/contentUtils';
import './gm.css';

// Slice 5a: bespoke fields for the parts a GM tweaks most (identity, abilities,
// saves) plus a validated raw-JSON editor for the deep nested rest (skills,
// proficiencies, spells, inventory, feats, strikes, actions, familiar…). Later
// sub-slices replace sections of the Advanced blob with dedicated forms.
const STRINGS = ['name', 'ancestry', 'background', 'class', 'keyAbility', 'size', 'senses', 'loreEntryId'];
const NUMS = ['level', 'maxHp', 'ac', 'speed'];
const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const SAVES = ['fortitude', 'reflex', 'will'];

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

  const strings = {};
  STRINGS.forEach((k) => { strings[k] = c[k] != null ? String(c[k]) : ''; });
  const nums = {};
  NUMS.forEach((k) => { nums[k] = c[k] != null ? String(c[k]) : ''; });
  const abilities = {};
  ABILITIES.forEach((k) => { abilities[k] = String((c.abilities && c.abilities[k]) ?? 10); });
  const saves = {};
  SAVES.forEach((k) => { saves[k] = String((c.saves && c.saves[k]) ?? 0); });

  return {
    id: c.id,
    strings,
    nums,
    abilities,
    saves,
    advanced: JSON.stringify(rest, null, 2),
  };
};

const blankCharacter = () => toForm({ name: '' });

const CharacterForm = ({ initial, isNew, onSaved }) => {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const setStr = (k, v) => setF((c) => ({ ...c, strings: { ...c.strings, [k]: v } }));
  const setNum = (k, v) => setF((c) => ({ ...c, nums: { ...c.nums, [k]: v } }));
  const setAbility = (k, v) => setF((c) => ({ ...c, abilities: { ...c.abilities, [k]: v } }));
  const setSave = (k, v) => setF((c) => ({ ...c, saves: { ...c.saves, [k]: v } }));

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
            <input
              aria-label={k}
              type="number"
              value={f.nums[k]}
              onChange={(e) => setNum(k, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="form-group">
        <label>Abilities</label>
        <div className="gm-row">
          {ABILITIES.map((k) => (
            <div className="form-group" key={k}>
              <label>{k}</label>
              <input
                aria-label={k}
                type="number"
                value={f.abilities[k]}
                onChange={(e) => setAbility(k, e.target.value)}
              />
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
              <input
                aria-label={k}
                type="number"
                value={f.saves[k]}
                onChange={(e) => setSave(k, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>Advanced — skills, proficiencies, spells, inventory, feats… (raw JSON)</label>
        <textarea
          aria-label="advanced"
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
