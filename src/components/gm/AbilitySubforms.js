// Shared GM-editor sub-forms for the recurring shapes that used to live in
// raw-JSON boxes (Strike now; Action/Reaction and Feat in later slices).
// Same faithful contract as GmItems' SpellSubform: managed scalars + a `rest`
// blob that carries every unmodelled key verbatim and is spread back first on
// `fromForm`, so nothing is ever lost.
import React from 'react';

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
