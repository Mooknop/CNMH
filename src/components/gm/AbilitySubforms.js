// Shared GM-editor sub-forms for the recurring shapes that used to live in
// raw-JSON boxes (Strike now; Action/Reaction and Feat in later slices).
// Same faithful contract as GmItems' SpellSubform: managed scalars + a `rest`
// blob that carries every unmodelled key verbatim and is spread back first on
// `fromForm`, so nothing is ever lost.
import React from 'react';
import ImageField from './ImageField';

export const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
};
export const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};
export const toList = (csv) =>
  String(csv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// ----- Action cost -----------------------------------------------------------
// One simple control (1 · 2 · 3 · R · Variable). Authored data uses any of
// `action` / `actionCount` (number OR "One to Two") / `variableActionCount` /
// `actions` (string). We read whatever is there into a single control state
// and re-emit ONE canonical encoding that every downstream consumer already
// normalizes identically:
//   1|2|3   -> actionCount: <n>
//             (strikeUtils parseInt, actionUtils, ActionCardList, StrikesList)
//   Variable-> variableActionCount:{min,max} + actionCount:"<min> to <max>"
//             (char strikes/actions read variableActionCount; the feat-strike
//              path in strikeUtils only derives a range from a STRING
//              actionCount, hence both keys, kept consistent)
//   R       -> actions:"Reaction"  (ActionIcon renders the reaction glyph)
// mode === '' means the cost is not modelled here; the original cost keys are
// left untouched in `rest` so an exotic value (e.g. actions:"Special") survives.
const COST_KEYS = ['action', 'actionCount', 'variableActionCount', 'actions'];
const WORD_NUM = { one: 1, two: 2, three: 3, 1: 1, 2: 2, 3: 3 };

const rangeFrom = (str) => {
  const m = String(str).toLowerCase().match(/(\w+)\s+to\s+(\w+)/);
  if (!m) return null;
  const min = WORD_NUM[m[1]];
  const max = WORD_NUM[m[2]];
  return min && max && min <= max ? { min, max } : null;
};

const variFromRange = ({ min, max }) => {
  const o = { mode: 'V', v1: false, v2: false, v3: false };
  for (let n = min; n <= max; n += 1) o[`v${n}`] = true;
  return o;
};

const blankCost = () => ({ mode: '', v1: false, v2: false, v3: false });

export const costToForm = (src) => {
  const s = src && typeof src === 'object' ? src : {};
  const vac = s.variableActionCount;
  if (vac && typeof vac === 'object' && vac.min >= 1 && vac.max <= 3 && vac.min <= vac.max) {
    return variFromRange(vac);
  }
  if (typeof s.actionCount === 'string') {
    const r = rangeFrom(s.actionCount);
    if (r && r.min >= 1 && r.max <= 3) return variFromRange(r);
  }
  if (typeof s.actions === 'string') {
    const t = s.actions.toLowerCase();
    if (t.includes('reaction')) return { ...blankCost(), mode: 'R' };
    const r = rangeFrom(t);
    if (r && r.min >= 1 && r.max <= 3) return variFromRange(r);
    const m = t.match(/\b(one|two|three|[123])\b\s*actions?/);
    if (m && WORD_NUM[m[1]]) return { ...blankCost(), mode: String(WORD_NUM[m[1]]) };
  }
  const num = s.actionCount != null ? s.actionCount : s.action;
  if (num === 1 || num === 2 || num === 3) return { ...blankCost(), mode: String(num) };
  return blankCost();
};

// Returns the canonical cost keys, or null when the control is unset (mode '')
// so the caller keeps whatever original cost it stashed in `rest`.
export const costFromForm = (cost) => {
  const c = cost || {};
  if (c.mode === '1' || c.mode === '2' || c.mode === '3') return { actionCount: Number(c.mode) };
  if (c.mode === 'R') return { actions: 'Reaction' };
  if (c.mode === 'V') {
    const sel = [1, 2, 3].filter((n) => c[`v${n}`]);
    if (!sel.length) return {};
    const min = sel[0];
    const max = sel[sel.length - 1];
    return { variableActionCount: { min, max }, actionCount: `${min} to ${max}` };
  }
  return null;
};

export const ActionCost = ({ cost, onChange, idPrefix }) => {
  const set = (patch) => onChange({ ...cost, ...patch });
  return (
    <div className="form-group">
      <label>action cost</label>
      <select
        aria-label={`${idPrefix}-cost`}
        value={cost.mode}
        onChange={(e) => set({ mode: e.target.value })}
      >
        <option value="">— (unset / preserved)</option>
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="R">R (reaction)</option>
        <option value="V">Variable</option>
      </select>
      {cost.mode === 'V' && (
        <div className="gm-row gm-rank-row">
          {[1, 2, 3].map((n) => (
            <label key={n}>
              <input
                type="checkbox"
                aria-label={`${idPrefix}-cost-v${n}`}
                checked={!!cost[`v${n}`]}
                onChange={(e) => set({ [`v${n}`]: e.target.checked })}
              />{' '}
              {n}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

// ----- Strike ----------------------------------------------------------------
const STRIKE_STR = ['name', 'proficiency', 'type', 'damage', 'range', 'description'];

export const strikeToForm = (s) => {
  const src = s && typeof s === 'object' ? s : {};
  const rest = { ...src };
  STRIKE_STR.forEach((k) => delete rest[k]);
  delete rest.traits;
  COST_KEYS.forEach((k) => delete rest[k]);
  const cost = costToForm(src);
  // Cost not recognised → put the original cost keys back so they round-trip.
  if (cost.mode === '') {
    COST_KEYS.forEach((k) => {
      if (src[k] !== undefined) rest[k] = src[k];
    });
  }
  const str = {};
  STRIKE_STR.forEach((k) => {
    str[k] = src[k] != null ? String(src[k]) : '';
  });
  return {
    str,
    traits: Array.isArray(src.traits) ? src.traits.join(', ') : '',
    cost,
    rest,
  };
};

export const strikeFromForm = (f) => {
  const out = { ...f.rest };
  STRIKE_STR.forEach((k) => {
    const v = f.str[k].trim();
    if (v) out[k] = v;
  });
  const traits = toList(f.traits);
  if (traits.length) out.traits = traits;
  const c = costFromForm(f.cost);
  if (c) Object.assign(out, c);
  return out;
};

export const blankStrike = () => strikeToForm({});

// ----- Action / Reaction -----------------------------------------------------
// Actions and reactions share the same managed scalars (a name + cost + traits
// + the usual trigger/requirements/frequency/description envelope). Only the
// new-entry default cost differs — reactions start as Reaction, actions are
// unset (the GM picks 1/2/3/Variable). Faithful contract as Strike: anything
// unmodelled (e.g. `degrees` on the bundled Exploit Vulnerability) lives in
// `rest` and is spread back first on `fromForm`.
const ABILITY_STR = ['name', 'trigger', 'requirements', 'frequency', 'description'];

const abilityToForm = (s) => {
  const src = s && typeof s === 'object' ? s : {};
  const rest = { ...src };
  ABILITY_STR.forEach((k) => delete rest[k]);
  delete rest.traits;
  COST_KEYS.forEach((k) => delete rest[k]);
  const cost = costToForm(src);
  // Cost not recognised → put the original cost keys back so they round-trip.
  if (cost.mode === '') {
    COST_KEYS.forEach((k) => {
      if (src[k] !== undefined) rest[k] = src[k];
    });
  }
  const str = {};
  ABILITY_STR.forEach((k) => {
    str[k] = src[k] != null ? String(src[k]) : '';
  });
  return {
    str,
    traits: Array.isArray(src.traits) ? src.traits.join(', ') : '',
    cost,
    rest,
  };
};

const abilityFromForm = (f) => {
  const out = { ...f.rest };
  ABILITY_STR.forEach((k) => {
    const v = f.str[k].trim();
    if (v) out[k] = v;
  });
  const traits = toList(f.traits);
  if (traits.length) out.traits = traits;
  const c = costFromForm(f.cost);
  if (c) Object.assign(out, c);
  return out;
};

export const actionToForm = abilityToForm;
export const actionFromForm = abilityFromForm;
export const blankAction = () => abilityToForm({});

export const reactionToForm = abilityToForm;
export const reactionFromForm = abilityFromForm;
export const blankReaction = () => {
  const f = abilityToForm({});
  f.cost = { ...f.cost, mode: 'R' };
  return f;
};

// One shared subform for both (different idPrefix per entry); the only kind-
// specific thing — the default cost on a new entry — is set by blank{Reaction}.
export const AbilitySubform = ({ value, onChange, idPrefix }) => {
  const setStr = (k, v) => onChange({ ...value, str: { ...value.str, [k]: v } });
  return (
    <div className="gm-card" data-testid={`${idPrefix}-ability`}>
      <div className="gm-row">
        <div className="form-group">
          <label>name</label>
          <input
            aria-label={`${idPrefix}-name`}
            value={value.str.name}
            onChange={(e) => setStr('name', e.target.value)}
          />
        </div>
        <ActionCost
          cost={value.cost}
          idPrefix={idPrefix}
          onChange={(c) => onChange({ ...value, cost: c })}
        />
      </div>
      <div className="form-group">
        <label>traits (comma-separated)</label>
        <input
          aria-label={`${idPrefix}-traits`}
          value={value.traits}
          onChange={(e) => onChange({ ...value, traits: e.target.value })}
        />
      </div>
      <div className="gm-row">
        <div className="form-group">
          <label>trigger</label>
          <input
            aria-label={`${idPrefix}-trigger`}
            value={value.str.trigger}
            onChange={(e) => setStr('trigger', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>requirements</label>
          <input
            aria-label={`${idPrefix}-requirements`}
            value={value.str.requirements}
            onChange={(e) => setStr('requirements', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>frequency</label>
          <input
            aria-label={`${idPrefix}-frequency`}
            value={value.str.frequency}
            onChange={(e) => setStr('frequency', e.target.value)}
          />
        </div>
      </div>
      <div className="form-group">
        <label>description</label>
        <textarea
          aria-label={`${idPrefix}-description`}
          rows={4}
          value={value.str.description}
          onChange={(e) => setStr('description', e.target.value)}
        />
      </div>
    </div>
  );
};

// Distinct exports so the codec table reads naturally; both render the same UI.
export const ActionSubform = AbilitySubform;
export const ReactionSubform = AbilitySubform;

// ----- Feat ------------------------------------------------------------------
// Feats are heterogeneous envelopes: the common scalars (name/level/source/
// description) plus optional nested ability arrays (actions, strikes,
// freeActions, innate, reactions) authored verbatim per the surrounding
// gameplay. We manage the scalars and keep EVERYTHING else — including the
// nested arrays and any feat `id` — in a per-feat raw-JSON box. The box round-
// trips losslessly; a full nested-array editor is intentionally out of scope
// (slice scope: structured envelope, faithful body).
const FEAT_STR = ['name', 'source', 'description'];
const FEAT_NUM = ['level'];

export const featToForm = (s) => {
  const src = s && typeof s === 'object' ? s : {};
  const rest = { ...src };
  FEAT_STR.forEach((k) => delete rest[k]);
  FEAT_NUM.forEach((k) => delete rest[k]);
  delete rest.traits;
  const str = {};
  FEAT_STR.forEach((k) => {
    str[k] = src[k] != null ? String(src[k]) : '';
  });
  const num = {};
  FEAT_NUM.forEach((k) => {
    num[k] = src[k] != null ? String(src[k]) : '';
  });
  return {
    str,
    num,
    traits: Array.isArray(src.traits) ? src.traits.join(', ') : '',
    // Single source of truth for the nested body — the form box is what the
    // GM edits, so featFromForm always re-parses it rather than carrying a
    // separate `rest` object that could drift.
    restJson: JSON.stringify(rest, null, 2),
  };
};

export const featFromForm = (f) => {
  let rest;
  try {
    rest = f.restJson.trim() ? JSON.parse(f.restJson) : {};
  } catch {
    throw new Error('invalid JSON in its nested fields');
  }
  if (rest === null || typeof rest !== 'object' || Array.isArray(rest)) {
    throw new Error('nested fields must be a JSON object');
  }
  const out = { ...rest };
  FEAT_STR.forEach((k) => {
    const v = f.str[k].trim();
    if (v) out[k] = v;
  });
  FEAT_NUM.forEach((k) => {
    if (f.num[k].trim() !== '') out[k] = toInt(f.num[k]);
  });
  const traits = toList(f.traits);
  if (traits.length) out.traits = traits;
  return out;
};

export const blankFeat = () => featToForm({});

// ----- Familiar --------------------------------------------------------------
// One real familiar in the bundled data (Lazarus, the Squox). Managed scalars
// cover the stat block envelope; the `abilities` list of named tricks/quirks
// edits as add/remove name+description rows; anything unmodelled round-trips
// through a raw-JSON box. Faithful contract identical to Strike/Action/Feat:
// rest is JSON.stringified at toForm, re-parsed at fromForm, spread back first.
const FAMILIAR_STR = ['name', 'type', 'size', 'speed', 'communication', 'description'];
const FAMILIAR_NUM = ['ac', 'hp'];

export const familiarToForm = (s) => {
  const src = s && typeof s === 'object' ? s : {};
  const rest = { ...src };
  FAMILIAR_STR.forEach((k) => delete rest[k]);
  FAMILIAR_NUM.forEach((k) => delete rest[k]);
  ['traits', 'skills', 'abilities'].forEach((k) => delete rest[k]);
  const str = {};
  FAMILIAR_STR.forEach((k) => {
    str[k] = src[k] != null ? String(src[k]) : '';
  });
  const num = {};
  FAMILIAR_NUM.forEach((k) => {
    num[k] = src[k] != null ? String(src[k]) : '';
  });
  return {
    str,
    num,
    traits: Array.isArray(src.traits) ? src.traits.join(', ') : '',
    skills: Array.isArray(src.skills) ? src.skills.join(', ') : '',
    abilities: Array.isArray(src.abilities)
      ? src.abilities.map((a) => ({
          name: a && a.name != null ? String(a.name) : '',
          description: a && a.description != null ? String(a.description) : '',
          rest: a && typeof a === 'object'
            ? Object.fromEntries(Object.entries(a).filter(([k]) => k !== 'name' && k !== 'description'))
            : {},
        }))
      : [],
    image: src.image || '',
    imagePosition: src.imagePosition || { x: 50, y: 50 },
    restJson: JSON.stringify(rest, null, 2),
  };
};

export const familiarFromForm = (f) => {
  let rest;
  try {
    rest = f.restJson.trim() ? JSON.parse(f.restJson) : {};
  } catch {
    throw new Error('has invalid JSON in its nested fields.');
  }
  if (rest === null || typeof rest !== 'object' || Array.isArray(rest)) {
    throw new Error('nested fields must be a JSON object.');
  }
  const out = { ...rest };
  FAMILIAR_STR.forEach((k) => {
    const v = f.str[k].trim();
    if (v) out[k] = v;
  });
  FAMILIAR_NUM.forEach((k) => {
    if (f.num[k].trim() !== '') out[k] = toInt(f.num[k]);
  });
  const traits = toList(f.traits);
  if (traits.length) out.traits = traits;
  const skills = toList(f.skills);
  if (skills.length) out.skills = skills;
  const abilities = (f.abilities || [])
    .map((a) => {
      const n = a.name.trim();
      const d = a.description.trim();
      if (!n && !d) return null;
      return { ...(a.rest || {}), name: n, description: d };
    })
    .filter(Boolean);
  if (abilities.length) out.abilities = abilities;
  if (f.image) { out.image = f.image; out.imagePosition = f.imagePosition; }
  return out;
};

export const blankFamiliar = () => familiarToForm({});

export const FamiliarSubform = ({ value, onChange, idPrefix }) => {
  const setStr = (k, v) => onChange({ ...value, str: { ...value.str, [k]: v } });
  const setNum = (k, v) => onChange({ ...value, num: { ...value.num, [k]: v } });
  const setAbil = (i, patch) =>
    onChange({
      ...value,
      abilities: value.abilities.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    });
  const addAbil = () =>
    onChange({
      ...value,
      abilities: [...value.abilities, { name: '', description: '', rest: {} }],
    });
  const rmAbil = (i) =>
    onChange({ ...value, abilities: value.abilities.filter((_, idx) => idx !== i) });
  return (
    <div className="gm-card" data-testid={`${idPrefix}-familiar`}>
      <div className="gm-row">
        <div className="form-group">
          <label>name</label>
          <input
            aria-label={`${idPrefix}-name`}
            value={value.str.name}
            onChange={(e) => setStr('name', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>type</label>
          <input
            aria-label={`${idPrefix}-type`}
            value={value.str.type}
            onChange={(e) => setStr('type', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>size</label>
          <input
            aria-label={`${idPrefix}-size`}
            value={value.str.size}
            onChange={(e) => setStr('size', e.target.value)}
          />
        </div>
      </div>
      <div className="gm-row">
        <div className="form-group">
          <label>ac</label>
          <input
            aria-label={`${idPrefix}-ac`}
            type="number"
            value={value.num.ac}
            onChange={(e) => setNum('ac', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>hp</label>
          <input
            aria-label={`${idPrefix}-hp`}
            type="number"
            value={value.num.hp}
            onChange={(e) => setNum('hp', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>speed</label>
          <input
            aria-label={`${idPrefix}-speed`}
            value={value.str.speed}
            onChange={(e) => setStr('speed', e.target.value)}
          />
        </div>
      </div>
      <div className="form-group">
        <label>traits (comma-separated)</label>
        <input
          aria-label={`${idPrefix}-traits`}
          value={value.traits}
          onChange={(e) => onChange({ ...value, traits: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>skills (comma-separated)</label>
        <input
          aria-label={`${idPrefix}-skills`}
          value={value.skills}
          onChange={(e) => onChange({ ...value, skills: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>communication</label>
        <input
          aria-label={`${idPrefix}-communication`}
          value={value.str.communication}
          onChange={(e) => setStr('communication', e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>description</label>
        <textarea
          aria-label={`${idPrefix}-description`}
          rows={3}
          value={value.str.description}
          onChange={(e) => setStr('description', e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Image</label>
        <ImageField value={value.image} onChange={(v) => onChange({ ...value, image: v })} position={value.imagePosition} onPositionChange={(p) => onChange({ ...value, imagePosition: p })} ariaLabel={`${idPrefix}-image`} />
      </div>
      <div className="form-group">
        <label>abilities</label>
        {value.abilities.map((a, i) => (
          <div key={i} className="gm-card" data-testid={`${idPrefix}-ability-${i}`}>
            <div className="form-group">
              <label>name</label>
              <input
                aria-label={`${idPrefix}-ability-${i}-name`}
                value={a.name}
                onChange={(e) => setAbil(i, { name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>description</label>
              <textarea
                aria-label={`${idPrefix}-ability-${i}-description`}
                rows={2}
                value={a.description}
                onChange={(e) => setAbil(i, { description: e.target.value })}
              />
            </div>
            <button className="btn-small btn-danger" onClick={() => rmAbil(i)}>
              Remove ability
            </button>
          </div>
        ))}
        <button className="btn-small btn-secondary" onClick={addAbil}>
          Add ability
        </button>
      </div>
      <div className="form-group">
        <label>nested fields (raw JSON)</label>
        <textarea
          aria-label={`${idPrefix}-json`}
          className="gm-json"
          rows={3}
          value={value.restJson}
          onChange={(e) => onChange({ ...value, restJson: e.target.value })}
        />
      </div>
    </div>
  );
};

// ----- Animal Companion -----------------------------------------------------
// One real AC in the bundled data (Zevira). Managed envelope + ability-score
// and save objects (mirroring the character editor's ABILITIES/SAVES, but
// nested inside the companion). The remaining heterogeneous tail (strikes,
// support, anything else) goes through a raw-JSON box. Speed type is
// preserved: a numeric authored speed (e.g. 30) round-trips as a number; a
// string authored speed (e.g. "30 feet") round-trips as a string.
const AC_STR = ['name', 'type', 'size', 'senses', 'support'];
const AC_NUM = ['ac', 'hp'];
const AC_ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const AC_SAVES = ['fortitude', 'reflex', 'will'];

export const animalCompanionToForm = (s) => {
  const src = s && typeof s === 'object' ? s : {};
  const rest = { ...src };
  AC_STR.forEach((k) => delete rest[k]);
  AC_NUM.forEach((k) => delete rest[k]);
  ['traits', 'skills', 'speed', 'abilities', 'saves'].forEach((k) => delete rest[k]);
  const str = {};
  AC_STR.forEach((k) => {
    str[k] = src[k] != null ? String(src[k]) : '';
  });
  const num = {};
  AC_NUM.forEach((k) => {
    num[k] = src[k] != null ? String(src[k]) : '';
  });
  const abilities = {};
  AC_ABILITIES.forEach((k) => {
    abilities[k] = src.abilities && src.abilities[k] != null ? String(src.abilities[k]) : '';
  });
  const saves = {};
  AC_SAVES.forEach((k) => {
    saves[k] = src.saves && src.saves[k] != null ? String(src.saves[k]) : '';
  });
  return {
    str,
    num,
    speed: src.speed != null ? String(src.speed) : '',
    speedWasNumber: typeof src.speed === 'number',
    abilities,
    abilitiesPresent: !!(src.abilities && typeof src.abilities === 'object'),
    saves,
    savesPresent: !!(src.saves && typeof src.saves === 'object'),
    traits: Array.isArray(src.traits) ? src.traits.join(', ') : '',
    skills: Array.isArray(src.skills) ? src.skills.join(', ') : '',
    image: src.image || '',
    imagePosition: src.imagePosition || { x: 50, y: 50 },
    restJson: JSON.stringify(rest, null, 2),
  };
};

export const animalCompanionFromForm = (f) => {
  let rest;
  try {
    rest = f.restJson.trim() ? JSON.parse(f.restJson) : {};
  } catch {
    throw new Error('has invalid JSON in its nested fields.');
  }
  if (rest === null || typeof rest !== 'object' || Array.isArray(rest)) {
    throw new Error('nested fields must be a JSON object.');
  }
  const out = { ...rest };
  AC_STR.forEach((k) => {
    const v = f.str[k].trim();
    if (v) out[k] = v;
  });
  AC_NUM.forEach((k) => {
    if (f.num[k].trim() !== '') out[k] = toInt(f.num[k]);
  });
  if (f.speed.trim() !== '') {
    const trimmed = f.speed.trim();
    // Preserve a numeric authored speed; fall back to the literal string when
    // the GM has typed units ("30 feet") or the original wasn't numeric.
    if (f.speedWasNumber && /^-?\d+$/.test(trimmed)) out.speed = toInt(trimmed);
    else out.speed = trimmed;
  }
  const traits = toList(f.traits);
  if (traits.length) out.traits = traits;
  const skills = toList(f.skills);
  if (skills.length) out.skills = skills;
  // Only emit ability/save blocks if the source had them or the GM filled
  // any field — keeps a Spartan AC payload free of zero-valued noise.
  const anyAbility = AC_ABILITIES.some((k) => f.abilities[k].trim() !== '');
  if (f.abilitiesPresent || anyAbility) {
    out.abilities = {};
    AC_ABILITIES.forEach((k) => {
      out.abilities[k] = toInt(f.abilities[k]);
    });
  }
  const anySave = AC_SAVES.some((k) => f.saves[k].trim() !== '');
  if (f.savesPresent || anySave) {
    out.saves = {};
    AC_SAVES.forEach((k) => {
      out.saves[k] = toInt(f.saves[k]);
    });
  }
  if (f.image) { out.image = f.image; out.imagePosition = f.imagePosition; }
  return out;
};

export const blankAnimalCompanion = () => animalCompanionToForm({});

export const AnimalCompanionSubform = ({ value, onChange, idPrefix }) => {
  const setStr = (k, v) => onChange({ ...value, str: { ...value.str, [k]: v } });
  const setNum = (k, v) => onChange({ ...value, num: { ...value.num, [k]: v } });
  const setAbility = (k, v) =>
    onChange({
      ...value,
      abilitiesPresent: true,
      abilities: { ...value.abilities, [k]: v },
    });
  const setSave = (k, v) =>
    onChange({ ...value, savesPresent: true, saves: { ...value.saves, [k]: v } });
  return (
    <div className="gm-card" data-testid={`${idPrefix}-ac`}>
      <div className="gm-row">
        <div className="form-group">
          <label>name</label>
          <input
            aria-label={`${idPrefix}-name`}
            value={value.str.name}
            onChange={(e) => setStr('name', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>type</label>
          <input
            aria-label={`${idPrefix}-type`}
            value={value.str.type}
            onChange={(e) => setStr('type', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>size</label>
          <input
            aria-label={`${idPrefix}-size`}
            value={value.str.size}
            onChange={(e) => setStr('size', e.target.value)}
          />
        </div>
      </div>
      <div className="gm-row">
        <div className="form-group">
          <label>ac</label>
          <input
            aria-label={`${idPrefix}-ac`}
            type="number"
            value={value.num.ac}
            onChange={(e) => setNum('ac', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>hp</label>
          <input
            aria-label={`${idPrefix}-hp`}
            type="number"
            value={value.num.hp}
            onChange={(e) => setNum('hp', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>speed</label>
          <input
            aria-label={`${idPrefix}-speed`}
            value={value.speed}
            onChange={(e) => onChange({ ...value, speed: e.target.value })}
          />
        </div>
      </div>
      <div className="form-group">
        <label>senses</label>
        <input
          aria-label={`${idPrefix}-senses`}
          value={value.str.senses}
          onChange={(e) => setStr('senses', e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>traits (comma-separated)</label>
        <input
          aria-label={`${idPrefix}-traits`}
          value={value.traits}
          onChange={(e) => onChange({ ...value, traits: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>skills (comma-separated)</label>
        <input
          aria-label={`${idPrefix}-skills`}
          value={value.skills}
          onChange={(e) => onChange({ ...value, skills: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>abilities</label>
        <div className="gm-row">
          {AC_ABILITIES.map((k) => (
            <div className="form-group" key={k}>
              <label>{k}</label>
              <input
                aria-label={`${idPrefix}-${k}`}
                type="number"
                value={value.abilities[k]}
                onChange={(e) => setAbility(k, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label>saves</label>
        <div className="gm-row">
          {AC_SAVES.map((k) => (
            <div className="form-group" key={k}>
              <label>{k}</label>
              <input
                aria-label={`${idPrefix}-${k}`}
                type="number"
                value={value.saves[k]}
                onChange={(e) => setSave(k, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label>support</label>
        <textarea
          aria-label={`${idPrefix}-support`}
          rows={3}
          value={value.str.support}
          onChange={(e) => setStr('support', e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Image</label>
        <ImageField value={value.image} onChange={(v) => onChange({ ...value, image: v })} position={value.imagePosition} onPositionChange={(p) => onChange({ ...value, imagePosition: p })} ariaLabel={`${idPrefix}-image`} />
      </div>
      <div className="form-group">
        <label>nested fields — strikes, anything else (raw JSON)</label>
        <textarea
          aria-label={`${idPrefix}-json`}
          className="gm-json"
          rows={4}
          value={value.restJson}
          onChange={(e) => onChange({ ...value, restJson: e.target.value })}
        />
      </div>
    </div>
  );
};

export const FeatSubform = ({ value, onChange, idPrefix }) => {
  const setStr = (k, v) => onChange({ ...value, str: { ...value.str, [k]: v } });
  const setNum = (k, v) => onChange({ ...value, num: { ...value.num, [k]: v } });
  return (
    <div className="gm-card" data-testid={`${idPrefix}-feat`}>
      <div className="gm-row">
        <div className="form-group">
          <label>name</label>
          <input
            aria-label={`${idPrefix}-name`}
            value={value.str.name}
            onChange={(e) => setStr('name', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>level</label>
          <input
            aria-label={`${idPrefix}-level`}
            type="number"
            value={value.num.level}
            onChange={(e) => setNum('level', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>source</label>
          <input
            aria-label={`${idPrefix}-source`}
            value={value.str.source}
            onChange={(e) => setStr('source', e.target.value)}
          />
        </div>
      </div>
      <div className="form-group">
        <label>traits (comma-separated)</label>
        <input
          aria-label={`${idPrefix}-traits`}
          value={value.traits}
          onChange={(e) => onChange({ ...value, traits: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>description</label>
        <textarea
          aria-label={`${idPrefix}-description`}
          rows={4}
          value={value.str.description}
          onChange={(e) => setStr('description', e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>nested fields — actions / strikes / freeActions / innate (raw JSON)</label>
        <textarea
          aria-label={`${idPrefix}-json`}
          className="gm-json"
          rows={4}
          value={value.restJson}
          onChange={(e) => onChange({ ...value, restJson: e.target.value })}
        />
      </div>
    </div>
  );
};

export const StrikeSubform = ({ value, onChange, idPrefix }) => {
  const setStr = (k, v) => onChange({ ...value, str: { ...value.str, [k]: v } });
  return (
    <div className="gm-card" data-testid={`${idPrefix}-strike`}>
      <div className="gm-row">
        <div className="form-group">
          <label>name</label>
          <input
            aria-label={`${idPrefix}-name`}
            value={value.str.name}
            onChange={(e) => setStr('name', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>proficiency</label>
          <select
            aria-label={`${idPrefix}-proficiency`}
            value={value.str.proficiency}
            onChange={(e) => setStr('proficiency', e.target.value)}
          >
            {['', 'simple', 'martial', 'advanced', 'unarmed'].map((p) => (
              <option key={p} value={p}>
                {p || '—'}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>type</label>
          <select
            aria-label={`${idPrefix}-type`}
            value={value.str.type}
            onChange={(e) => setStr('type', e.target.value)}
          >
            {['', 'melee', 'ranged'].map((p) => (
              <option key={p} value={p}>
                {p || '—'}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="gm-row">
        <ActionCost
          cost={value.cost}
          idPrefix={idPrefix}
          onChange={(c) => onChange({ ...value, cost: c })}
        />
        <div className="form-group">
          <label>damage</label>
          <input
            aria-label={`${idPrefix}-damage`}
            value={value.str.damage}
            onChange={(e) => setStr('damage', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>range</label>
          <input
            aria-label={`${idPrefix}-range`}
            value={value.str.range}
            onChange={(e) => setStr('range', e.target.value)}
          />
        </div>
      </div>
      <div className="form-group">
        <label>traits (comma-separated)</label>
        <input
          aria-label={`${idPrefix}-traits`}
          value={value.traits}
          onChange={(e) => onChange({ ...value, traits: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>description</label>
        <textarea
          aria-label={`${idPrefix}-description`}
          rows={3}
          value={value.str.description}
          onChange={(e) => setStr('description', e.target.value)}
        />
      </div>
    </div>
  );
};
