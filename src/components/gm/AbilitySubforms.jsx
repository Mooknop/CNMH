// Shared GM-editor sub-forms for the recurring shapes that used to live in
// raw-JSON boxes (Strike now; Action/Reaction and Feat in later slices).
// Same faithful contract as GmItems' SpellSubform: managed scalars + a `rest`
// blob that carries every unmodelled key verbatim and is spread back first on
// `fromForm`, so nothing is ever lost.
import React from 'react';
import ImageField from './ImageField';
import EffectsSubform, { effectsToForm, effectsFromForm } from './EffectsSubform';
import { SKILL_ABILITY_MAP } from '../../utils/CharacterUtils';
import { TRIGGER_TYPES } from '../../utils/reactionTriggers';

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

// ----- Roll source -----------------------------------------------------------
// Codec for the optional ability.roll config object.
// Types: '' (infer) | 'strike' | 'spell-attack' | 'skill' | 'spell-dc' | 'flat'
//
// Round-trip contract: delete from `rest` on toForm so it is not double-written;
// only emit if type is set, so existing actions without roll config are unaffected.

const ROLL_SKILL_IDS = Object.keys(SKILL_ABILITY_MAP).sort();

export const rollToForm = (r) => ({
  type:  r?.type  || '',
  skill: r?.skill || '',
  bonus: r?.bonus != null ? String(r.bonus) : '',
});

export const rollFromForm = (f) => {
  if (!f || !f.type) return null;
  const out = { type: f.type };
  if (f.type === 'skill' && f.skill) out.skill = f.skill;
  if (f.bonus !== '') {
    const n = parseFloat(f.bonus);
    if (!isNaN(n)) out.bonus = n;
  }
  return out;
};

// Codec for the optional ability.frequencyRule object ({ per, uses }) — the
// structured cooldown the frequency engine enforces (#218). Kept separate from
// the free-text `frequency` string, which stays display-only. Same round-trip
// contract as roll: delete from `rest` on toForm, emit only when `per` is set.

export const FREQUENCY_PER_OPTIONS = ['turn', 'round', 'hour', 'day', 'week'];

export const frequencyRuleToForm = (r) => ({
  per:  FREQUENCY_PER_OPTIONS.includes(r?.per) ? r.per : '',
  uses: r?.uses != null ? String(r.uses) : '1',
});

export const frequencyRuleFromForm = (f) => {
  if (!f || !f.per) return null;
  const out = { per: f.per, uses: 1 };
  const n = parseInt(f.uses, 10);
  if (!isNaN(n) && n >= 1) out.uses = n;
  return out;
};

// Codec for the optional ability.immunity object — a target immunity timer
// ({ duration: { value, unit }, scope }). Same round-trip contract as roll:
// delete from `rest` on toForm, emit only when value + unit are set.

export const IMMUNITY_UNIT_OPTIONS = ['minute', 'hour', 'day', 'week'];

export const immunityToForm = (imm) => ({
  value: imm?.duration?.value != null ? String(imm.duration.value) : '',
  unit:  IMMUNITY_UNIT_OPTIONS.includes(imm?.duration?.unit) ? imm.duration.unit : '',
  scope: imm?.scope === 'per-caster' ? 'per-caster' : 'any',
});

export const immunityFromForm = (f) => {
  if (!f || !f.unit || f.value === '') return null;
  const n = parseFloat(f.value);
  if (isNaN(n) || n <= 0) return null;
  const out = { duration: { value: n, unit: f.unit } };
  if (f.scope === 'per-caster') out.scope = 'per-caster';
  return out;
};

export const RollSourceControl = ({ value, onChange, idPrefix }) => {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="form-group">
      <label>roll source</label>
      <select
        aria-label={`${idPrefix}-roll-type`}
        value={value.type}
        onChange={(e) => set({ type: e.target.value, skill: '', bonus: '' })}
      >
        <option value="">— (infer automatically)</option>
        <option value="strike">Strike attack</option>
        <option value="spell-attack">Spell attack</option>
        <option value="skill">Skill</option>
        <option value="spell-dc">Spell DC (save)</option>
        <option value="flat">Flat bonus</option>
      </select>
      {value.type === 'skill' && (
        <select
          aria-label={`${idPrefix}-roll-skill`}
          value={value.skill}
          onChange={(e) => set({ skill: e.target.value })}
          style={{ marginTop: '4px' }}
        >
          <option value="">— pick skill</option>
          {ROLL_SKILL_IDS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}
      {value.type === 'flat' && (
        <input
          type="number"
          aria-label={`${idPrefix}-roll-bonus`}
          placeholder="bonus"
          value={value.bonus}
          onChange={(e) => set({ bonus: e.target.value })}
          style={{ marginTop: '4px', width: '80px' }}
        />
      )}
    </div>
  );
};

// ----- Foundry effect link ---------------------------------------------------
// Codec for the optional ability.foundryEffect config object.
// ref: Foundry compendium UUID (paste from right-click → Copy UUID in Foundry).
// applyTo: mirrors applyAbility's resolveApplyTargets values.
//
// Round-trip contract: delete from `rest` on toForm; only emit if ref is set.

export const foundryEffectToForm = (fe) => ({
  ref:     fe?.ref     || '',
  applyTo: fe?.applyTo || '',
});

export const foundryEffectFromForm = (f) => {
  if (!f || !f.ref.trim()) return null;
  return {
    ref:     f.ref.trim(),
    applyTo: f.applyTo || 'self',
  };
};

export const FoundryEffectControl = ({ value, onChange, idPrefix }) => {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="form-group">
      <label>Foundry effect UUID</label>
      <input
        aria-label={`${idPrefix}-foundry-effect-ref`}
        placeholder="Compendium.pf2e.spell-effects.Item.…"
        value={value.ref}
        onChange={(e) => set({ ref: e.target.value })}
        style={{ width: '100%' }}
      />
      {value.ref.trim() && (
        <select
          aria-label={`${idPrefix}-foundry-effect-apply-to`}
          value={value.applyTo}
          onChange={(e) => set({ applyTo: e.target.value })}
          style={{ marginTop: '4px' }}
        >
          <option value="">— apply to (default: self)</option>
          <option value="self">self</option>
          <option value="ally">ally (picked target)</option>
          <option value="all-allies">all allies</option>
          <option value="target">target (picked)</option>
        </select>
      )}
    </div>
  );
};

// ----- Chain config ----------------------------------------------------------
// Codec for the optional ability.chain config object.
// Marks an ability as chaining into a base sub-action and augmenting it.
//   into: 'strike' — chains into a Strike or Flurry (cost typically 'included')
//   into: 'spell'  — chains into Cast a Spell (cost typically 'added')
//
// Round-trip contract: delete from `rest` on toForm; only emit if into is set.

export const chainToForm = (c) => ({
  into:         c?.into         || '',
  cost:         c?.cost         || 'included',
  // strike kind
  modeStrike:   !!(c?.modes?.includes('strike')),
  modeFlurry:   !!(c?.modes?.includes('flurry')),
  strikeTrait:  c?.strikeTrait  || '',
  attackBonus:  c?.attackBonus  != null ? String(c.attackBonus) : '',
  damageBonus:  c?.damageBonus  || '',
  // spell kind
  spellFilter:  c?.spellFilter  || 'any',
  modifier:     c?.modifier     || '',
});

export const chainFromForm = (f) => {
  if (!f || !f.into) return null;
  const out = { into: f.into, cost: f.cost || 'included' };
  if (f.into === 'strike') {
    const modes = [];
    if (f.modeStrike) modes.push('strike');
    if (f.modeFlurry) modes.push('flurry');
    if (modes.length) out.modes = modes;
    if (f.strikeTrait?.trim()) out.strikeTrait = f.strikeTrait.trim();
    if (f.attackBonus !== '') {
      const n = parseFloat(f.attackBonus);
      if (!isNaN(n)) out.attackBonus = n;
    }
    if (f.damageBonus?.trim()) out.damageBonus = f.damageBonus.trim();
  }
  if (f.into === 'spell') {
    if (f.spellFilter && f.spellFilter !== 'any') out.spellFilter = f.spellFilter;
    if (f.modifier?.trim()) out.modifier = f.modifier.trim();
  }
  return out;
};

export const ChainControl = ({ value, onChange, idPrefix }) => {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="form-group">
      <label>chains into sub-action</label>
      <select
        aria-label={`${idPrefix}-chain-into`}
        value={value.into}
        onChange={(e) => set({ into: e.target.value })}
      >
        <option value="">— (no chain)</option>
        <option value="strike">Strike / Flurry of Blows</option>
        <option value="spell">Cast a Spell (Spellshape)</option>
      </select>

      {value.into && (
        <select
          aria-label={`${idPrefix}-chain-cost`}
          value={value.cost}
          onChange={(e) => set({ cost: e.target.value })}
          style={{ marginTop: '4px' }}
        >
          <option value="included">included in parent cost</option>
          <option value="added">added on top of sub-action cost</option>
        </select>
      )}

      {value.into === 'strike' && (
        <>
          <div className="gm-row" style={{ marginTop: '4px' }}>
            <label>
              <input
                type="checkbox"
                aria-label={`${idPrefix}-chain-mode-strike`}
                checked={!!value.modeStrike}
                onChange={(e) => set({ modeStrike: e.target.checked })}
              />{' '}
              Strike
            </label>
            <label style={{ marginLeft: '12px' }}>
              <input
                type="checkbox"
                aria-label={`${idPrefix}-chain-mode-flurry`}
                checked={!!value.modeFlurry}
                onChange={(e) => set({ modeFlurry: e.target.checked })}
              />{' '}
              Flurry of Blows
            </label>
          </div>
          <input
            aria-label={`${idPrefix}-chain-strike-trait`}
            placeholder="strike trait filter (e.g. Unarmed — blank = any)"
            value={value.strikeTrait}
            onChange={(e) => set({ strikeTrait: e.target.value })}
            style={{ marginTop: '4px', width: '100%' }}
          />
          <input
            type="number"
            aria-label={`${idPrefix}-chain-attack-bonus`}
            placeholder="attack bonus (e.g. 1)"
            value={value.attackBonus}
            onChange={(e) => set({ attackBonus: e.target.value })}
            style={{ marginTop: '4px', width: '80px' }}
          />
          <input
            aria-label={`${idPrefix}-chain-damage-bonus`}
            placeholder="damage bonus (e.g. 1d6)"
            value={value.damageBonus}
            onChange={(e) => set({ damageBonus: e.target.value })}
            style={{ marginTop: '4px', marginLeft: '8px', width: '80px' }}
          />
        </>
      )}

      {value.into === 'spell' && (
        <>
          <select
            aria-label={`${idPrefix}-chain-spell-filter`}
            value={value.spellFilter}
            onChange={(e) => set({ spellFilter: e.target.value })}
            style={{ marginTop: '4px' }}
          >
            <option value="any">any spell</option>
            <option value="has-range">spells with a range (not touch/self)</option>
          </select>
          <input
            aria-label={`${idPrefix}-chain-modifier`}
            placeholder="modifier note (e.g. Range increased by 30 feet)"
            value={value.modifier}
            onChange={(e) => set({ modifier: e.target.value })}
            style={{ marginTop: '4px', width: '100%' }}
          />
        </>
      )}
    </div>
  );
};

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
  // Pull effects, targetDefense, roll, foundryEffect, and chain into managed form
  // state so they are not double-written via rest.
  delete rest.effects;
  delete rest.targetDefense;
  delete rest.roll;
  delete rest.foundryEffect;
  delete rest.chain;
  delete rest.frequencyRule;
  delete rest.immunity;
  delete rest.triggerType;
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
    effects: effectsToForm(src.effects),
    targetDefense: src.targetDefense || '',
    roll: rollToForm(src.roll),
    foundryEffect: foundryEffectToForm(src.foundryEffect),
    chain: chainToForm(src.chain),
    frequencyRule: frequencyRuleToForm(src.frequencyRule),
    immunity: immunityToForm(src.immunity),
    triggerType: src.triggerType || '',
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
  const effects = effectsFromForm(f.effects);
  if (effects.length) out.effects = effects;
  if (f.targetDefense) out.targetDefense = f.targetDefense;
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
  if (f.triggerType) out.triggerType = f.triggerType;
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
      <div className="form-group">
        <label>targets defense</label>
        <select
          aria-label={`${idPrefix}-target-defense`}
          value={value.targetDefense}
          onChange={(e) => onChange({ ...value, targetDefense: e.target.value })}
        >
          <option value="">— (none)</option>
          <option value="ac">AC</option>
          <option value="fortitude">Fortitude DC</option>
          <option value="reflex">Reflex DC</option>
          <option value="will">Will DC</option>
        </select>
      </div>
      <RollSourceControl
        value={value.roll || rollToForm(null)}
        idPrefix={idPrefix}
        onChange={(r) => onChange({ ...value, roll: r })}
      />
      <FoundryEffectControl
        value={value.foundryEffect || foundryEffectToForm(null)}
        idPrefix={idPrefix}
        onChange={(fe) => onChange({ ...value, foundryEffect: fe })}
      />
      <ChainControl
        value={value.chain || chainToForm(null)}
        idPrefix={idPrefix}
        onChange={(c) => onChange({ ...value, chain: c })}
      />
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
          <label>trigger type (engine)</label>
          <select
            aria-label={`${idPrefix}-trigger-type`}
            value={value.triggerType || ''}
            onChange={(e) => onChange({ ...value, triggerType: e.target.value })}
          >
            <option value="">— (no prompt)</option>
            {TRIGGER_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
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
      <div className="gm-row">
        <div className="form-group">
          <label>frequency rule (enforced)</label>
          <select
            aria-label={`${idPrefix}-frequency-per`}
            value={(value.frequencyRule || frequencyRuleToForm(null)).per}
            onChange={(e) =>
              onChange({
                ...value,
                frequencyRule: {
                  ...(value.frequencyRule || frequencyRuleToForm(null)),
                  per: e.target.value,
                },
              })
            }
          >
            <option value="">— (untracked)</option>
            {FREQUENCY_PER_OPTIONS.map((per) => (
              <option key={per} value={per}>per {per}</option>
            ))}
          </select>
        </div>
        {(value.frequencyRule || frequencyRuleToForm(null)).per && (
          <div className="form-group">
            <label>uses</label>
            <input
              type="number"
              min="1"
              aria-label={`${idPrefix}-frequency-uses`}
              value={(value.frequencyRule || frequencyRuleToForm(null)).uses}
              onChange={(e) =>
                onChange({
                  ...value,
                  frequencyRule: {
                    ...(value.frequencyRule || frequencyRuleToForm(null)),
                    uses: e.target.value,
                  },
                })
              }
            />
          </div>
        )}
      </div>
      <div className="gm-row">
        <div className="form-group">
          <label>target immunity</label>
          <select
            aria-label={`${idPrefix}-immunity-unit`}
            value={(value.immunity || immunityToForm(null)).unit}
            onChange={(e) =>
              onChange({
                ...value,
                immunity: { ...(value.immunity || immunityToForm(null)), unit: e.target.value },
              })
            }
          >
            <option value="">— (none)</option>
            {IMMUNITY_UNIT_OPTIONS.map((unit) => (
              <option key={unit} value={unit}>per {unit}</option>
            ))}
          </select>
        </div>
        {(value.immunity || immunityToForm(null)).unit && (
          <>
            <div className="form-group">
              <label>duration</label>
              <input
                type="number"
                min="1"
                aria-label={`${idPrefix}-immunity-value`}
                value={(value.immunity || immunityToForm(null)).value}
                onChange={(e) =>
                  onChange({
                    ...value,
                    immunity: { ...(value.immunity || immunityToForm(null)), value: e.target.value },
                  })
                }
              />
            </div>
            <div className="form-group">
              <label>scope</label>
              <select
                aria-label={`${idPrefix}-immunity-scope`}
                value={(value.immunity || immunityToForm(null)).scope}
                onChange={(e) =>
                  onChange({
                    ...value,
                    immunity: { ...(value.immunity || immunityToForm(null)), scope: e.target.value },
                  })
                }
              >
                <option value="any">any caster</option>
                <option value="per-caster">per caster</option>
              </select>
            </div>
          </>
        )}
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
      <EffectsSubform
        value={value.effects || []}
        onChange={(next) => onChange({ ...value, effects: next })}
        idPrefix={`${idPrefix}-`}
      />
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
