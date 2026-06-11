// Shared structured-effects sub-form: reused by GmSpells (spell effects) and
// AbilitySubforms (action / reaction effects). Each row lets the GM pick an
// effect from the catalog, set the applyTo rule, and configure the duration.
import React from 'react';
import PF2E_EFFECTS from '../../data/pf2eEffects';

export const APPLY_TO_OPTIONS = ['self', 'ally', 'target', 'all-allies'];
export const DURATION_UNTIL_OPTIONS = [
  'caster-turn-end',
  'caster-turn-start',
  'target-turn-end',
  'target-turn-start',
  'round-end',
  'rounds',
  'daily-prep',
  'manual',
];

export const blankEffect = () => ({
  effectId: '',
  applyTo:  'self',
  duration: { until: 'caster-turn-end', rounds: '1' },
});

// Convert a persisted effects array to editable form state (all values as strings).
export const effectsToForm = (effects) =>
  Array.isArray(effects)
    ? effects.map((e) => ({
        effectId: String(e.effectId || ''),
        applyTo:  String(e.applyTo  || 'self'),
        duration: {
          until:  String(e.duration?.until  || 'caster-turn-end'),
          rounds: String(e.duration?.rounds ?? '1'),
        },
      }))
    : [];

// Convert form state back to the persisted effects array.
export const effectsFromForm = (formEffects) => {
  const effects = (formEffects || [])
    .filter((e) => e.effectId.trim())
    .map((e) => {
      const dur = { until: e.duration.until };
      if (e.duration.until === 'rounds') {
        const n = parseInt(e.duration.rounds, 10);
        dur.rounds = Number.isNaN(n) ? 1 : n || 1;
      }
      return { effectId: e.effectId.trim(), applyTo: e.applyTo, duration: dur };
    });
  return effects;
};

/**
 * Renders an add/remove list of structured effect rows.
 *
 * @param {Array}    value      - Form effects array from effectsToForm()
 * @param {Function} onChange   - Called with the new array on any change
 * @param {string}   idPrefix   - Prefix for aria-labels to keep them unique
 */
const EffectsSubform = ({ value = [], onChange, idPrefix = '' }) => {
  const setEff = (i, patch) =>
    onChange(value.map((ef, idx) => (idx === i ? { ...ef, ...patch } : ef)));
  const setEffDur = (i, patch) =>
    onChange(
      value.map((ef, idx) =>
        idx === i ? { ...ef, duration: { ...ef.duration, ...patch } } : ef
      )
    );
  const addEff = () => onChange([...value, blankEffect()]);
  const rmEff  = (i) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="form-group">
      <label>Structured Effects (auto-apply on Use / Cast in encounter mode)</label>
      {value.map((eff, i) => (
        <div
          key={i}
          className="gm-row gm-rank-row"
          style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}
        >
          <select
            aria-label={`${idPrefix}effect-id-${i}`}
            value={eff.effectId}
            onChange={(ev) => setEff(i, { effectId: ev.target.value })}
          >
            <option value="">— choose effect —</option>
            {PF2E_EFFECTS.map((ef) => (
              <option key={ef.id} value={ef.id}>{ef.name}</option>
            ))}
          </select>
          <select
            aria-label={`${idPrefix}effect-applyto-${i}`}
            value={eff.applyTo}
            onChange={(ev) => setEff(i, { applyTo: ev.target.value })}
          >
            {APPLY_TO_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select
            aria-label={`${idPrefix}effect-until-${i}`}
            value={eff.duration.until}
            onChange={(ev) => setEffDur(i, { until: ev.target.value })}
          >
            {DURATION_UNTIL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {eff.duration.until === 'rounds' && (
            <input
              aria-label={`${idPrefix}effect-rounds-${i}`}
              type="number"
              min="1"
              value={eff.duration.rounds}
              onChange={(ev) => setEffDur(i, { rounds: ev.target.value })}
              style={{ width: '60px' }}
            />
          )}
          <button className="btn-small btn-danger" onClick={() => rmEff(i)}>Remove</button>
        </div>
      ))}
      <button className="btn-small btn-secondary" onClick={addEff}>Add effect</button>
    </div>
  );
};

export default EffectsSubform;
