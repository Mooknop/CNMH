import React, { useState, useImperativeHandle, forwardRef } from 'react';
import DamagePanel from './DamagePanel';
import { computeSaveDegree } from '../../utils/saveDegree';
import { defenseDC, DEFENSE_LABELS, DEFENSE_OPTIONS } from '../../utils/defense';
import { formatModifier } from '../../utils/CharacterUtils';
import { computeTargetDamage } from '../../utils/damage';
import './TargetRollResolver.css';

// Degree labels differ by context: AC uses attack terminology, saves use save terminology.
const DEGREE_LABELS_AC = {
  criticalSuccess: { label: 'Critical Hit',   cls: 'save-crit-success' },
  success:         { label: 'Hit',            cls: 'save-success' },
  failure:         { label: 'Miss',           cls: 'save-failure' },
  criticalFailure: { label: 'Critical Miss',  cls: 'save-crit-failure' },
};

export const DEGREE_LABELS_SAVE = {
  criticalSuccess: { label: 'Critical Success', cls: 'save-crit-success' },
  success:         { label: 'Success',          cls: 'save-success' },
  failure:         { label: 'Failure',          cls: 'save-failure' },
  criticalFailure: { label: 'Critical Failure', cls: 'save-crit-failure' },
};

function degreeLabels(defense) {
  return defense === 'ac' ? DEGREE_LABELS_AC : DEGREE_LABELS_SAVE;
}

// Authored degree-text maps (ability.degrees) key on the rulebook headings.
const DEGREE_TEXT_KEYS = {
  criticalSuccess: 'Critical Success',
  success:         'Success',
  failure:         'Failure',
  criticalFailure: 'Critical Failure',
};

/**
 * Inline roll-resolver for the UseAbilityModal. The player enters a RAW d20 face;
 * the component adds `rollBonus` to compute the total and auto-detects nat 20 / nat 1
 * from the entered face. When `rollBonus` is null the input behaves as a manual total
 * (backward-compatible with actions that have no derivable bonus).
 *
 * Exposes `getResults()` via ref so the parent can read the latest results at
 * confirm time — avoids lifting state and the associated useEffect stale-closure
 * problems when enemyTargets change (target selection happens in the same modal).
 *
 * @param {Array}       enemyTargets  - encounter entries (kind:'enemy', with defenses)
 * @param {string}      targetDefense - 'ac'|'fortitude'|'reflex'|'will'|'' ('' = show override)
 * @param {number|null} rollBonus     - actor's net bonus to add to the raw d20; null = manual-total mode
 * @param {Object}      [damage]      - damage profile (buildDamageProfile, #222); shows the
 *                                      damage entry panel after a hit/crit when present
 * @param {Object}      [degrees]     - authored degree-of-success text map (ability.degrees)
 * @param {object}      ref           - forwarded ref; exposes { getResults() }
 */
const TargetRollResolver = forwardRef(({
  enemyTargets = [],
  targetDefense = '',
  rollBonus = null,
  damage = null,
  degrees = null,
}, ref) => {
  const [d20Input,       setD20Input]       = useState('');
  const [defenseOverride, setDefenseOverride] = useState('ac');

  // Damage step state (#222) — only meaningful when a damage profile is passed.
  const [dmgInput,   setDmgInput]   = useState('');
  const [riderState, setRiderState] = useState({});
  const [critDouble, setCritDouble] = useState(true);

  const effectiveDefense = targetDefense || defenseOverride;

  const d20 = parseInt(d20Input, 10);
  const hasD20 = !isNaN(d20);

  // When rollBonus is provided, derive total from d20 + bonus (and nat 20/1 from face).
  // When rollBonus is null (no derivable bonus), treat the input as the raw total instead —
  // nat 20 / nat 1 are detected from the value directly.
  const total   = hasD20 ? (rollBonus !== null ? d20 + rollBonus : d20) : NaN;
  const d20face = hasD20 ? d20 : 10; // 10 is the neutral face (no degree shift)

  const enteredDamage = parseInt(dmgInput, 10);

  const computeResults = () => {
    if (!hasD20) return null;
    return enemyTargets.map((entry) => {
      const dc = defenseDC(entry.defenses, effectiveDefense);
      const degree = dc != null
        ? computeSaveDegree({ d20: d20face, total, dc })
        : null;
      const dmg = damage
        ? computeTargetDamage({
            entered: isNaN(enteredDamage) ? null : enteredDamage,
            degree,
            riders: damage.riders,
            riderState,
            entryId: entry.entryId,
            critDouble,
          })
        : null;
      return { entryId: entry.entryId, name: entry.name, dc, total, degree, damage: dmg };
    });
  };

  const results = computeResults();

  useImperativeHandle(ref, () => ({
    getResults: computeResults,
  }));

  if (enemyTargets.length === 0) return null;

  const labels = degreeLabels(effectiveDefense);

  const bonusDisplay = rollBonus !== null ? formatModifier(rollBonus) : null;
  const totalDisplay = hasD20 && rollBonus !== null ? total : null;

  return (
    <div className="trr-section">
      <div className="trr-dc-row">
        {!targetDefense && (
          <select
            className="trr-defense-select"
            aria-label="defense type"
            value={defenseOverride}
            onChange={(e) => { setDefenseOverride(e.target.value); }}
          >
            {DEFENSE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
        {targetDefense && (
          <span className="trr-defense-label">{DEFENSE_LABELS[targetDefense]}</span>
        )}
        {enemyTargets.map((entry) => {
          const dc = defenseDC(entry.defenses, effectiveDefense);
          return dc != null ? (
            <span key={entry.entryId} className="trr-dc-badge">
              {entry.name}: {dc}
            </span>
          ) : null;
        })}
      </div>

      <div className="trr-entry-row">
        <input
          type="number"
          className="trr-roll-input"
          placeholder={rollBonus !== null ? 'd20' : 'total'}
          aria-label="raw d20"
          value={d20Input}
          onChange={(e) => setD20Input(e.target.value)}
        />
        {bonusDisplay && (
          <span className="trr-bonus-badge" aria-label="roll bonus">
            {bonusDisplay}
          </span>
        )}
        {totalDisplay !== null && (
          <span className="trr-total-badge" aria-label="computed total">
            = {totalDisplay}
          </span>
        )}
      </div>

      {results && (
        <div className="trr-results">
          {results.map((r) => {
            const info = r.degree ? labels[r.degree] : null;
            const degreeText = r.degree ? degrees?.[DEGREE_TEXT_KEYS[r.degree]] : null;
            return (
              <div
                key={r.entryId}
                className={`trr-result-chip ${info ? info.cls : ''}`}
              >
                <span className="trr-result-name">{r.name}</span>
                {r.dc != null && (
                  <span className="trr-result-dc">{DEFENSE_LABELS[effectiveDefense]} {r.dc}</span>
                )}
                {info ? (
                  <span className="trr-result-degree">{info.label}</span>
                ) : (
                  <span className="trr-no-dc">no DC available</span>
                )}
                {degreeText && (
                  <span className="trr-degree-text">{degreeText}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {damage && results && (
        <DamagePanel
          profile={damage}
          hitResults={results.filter(
            (r) => r.degree === 'success' || r.degree === 'criticalSuccess'
          )}
          entered={dmgInput}
          onEntered={setDmgInput}
          riderState={riderState}
          onToggleRider={(id, on) => setRiderState((cur) => ({ ...cur, [id]: on }))}
          critDouble={critDouble}
          onCritDouble={setCritDouble}
        />
      )}
    </div>
  );
});

export default TargetRollResolver;
