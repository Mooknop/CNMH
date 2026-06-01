import React, { useState, useImperativeHandle, forwardRef } from 'react';
import { computeSaveDegree } from '../../utils/saveDegree';
import { defenseDC, DEFENSE_LABELS, DEFENSE_OPTIONS } from '../../utils/defense';
import './TargetRollResolver.css';

// Degree labels differ by context: AC uses attack terminology, saves use save terminology.
const DEGREE_LABELS_AC = {
  criticalSuccess: { label: 'Critical Hit',   cls: 'save-crit-success' },
  success:         { label: 'Hit',            cls: 'save-success' },
  failure:         { label: 'Miss',           cls: 'save-failure' },
  criticalFailure: { label: 'Critical Miss',  cls: 'save-crit-failure' },
};

const DEGREE_LABELS_SAVE = {
  criticalSuccess: { label: 'Critical Success', cls: 'save-crit-success' },
  success:         { label: 'Success',          cls: 'save-success' },
  failure:         { label: 'Failure',          cls: 'save-failure' },
  criticalFailure: { label: 'Critical Failure', cls: 'save-crit-failure' },
};

function degreeLabels(defense) {
  return defense === 'ac' ? DEGREE_LABELS_AC : DEGREE_LABELS_SAVE;
}

/**
 * Inline roll-resolver for the UseAbilityModal. Shows a single total input +
 * nat-20/nat-1 toggle; computes per-target degree of success live.
 *
 * Exposes `getResults()` via ref so the parent can read the latest results at
 * confirm time — avoids lifting state and the associated useEffect stale-closure
 * problems when enemyTargets change (target selection happens in the same modal).
 *
 * @param {Array}  enemyTargets  - encounter entries (kind:'enemy', with defenses)
 * @param {string} targetDefense - 'ac'|'fortitude'|'reflex'|'will'|'' ('' = show override)
 * @param {object} ref           - forwarded ref; exposes { getResults() }
 */
const TargetRollResolver = forwardRef(({ enemyTargets = [], targetDefense = '' }, ref) => {
  const [totalInput,      setTotalInput]      = useState('');
  const [isNat20,         setIsNat20]         = useState(false);
  const [isNat1,          setIsNat1]          = useState(false);
  const [defenseOverride, setDefenseOverride] = useState('ac');

  const effectiveDefense = targetDefense || defenseOverride;
  const total = parseInt(totalInput, 10);
  const hasTotal = !isNaN(total);

  // d20 face: only 20 or 1 shift the degree; any other value is neutral.
  const d20face = isNat20 ? 20 : isNat1 ? 1 : 10;

  const computeResults = () => {
    if (!hasTotal) return null;
    return enemyTargets.map((entry) => {
      const dc = defenseDC(entry.defenses, effectiveDefense);
      const degree = dc != null
        ? computeSaveDegree({ d20: d20face, total, dc })
        : null;
      return { entryId: entry.entryId, name: entry.name, dc, total, degree };
    });
  };

  const results = computeResults();

  useImperativeHandle(ref, () => ({
    getResults: computeResults,
  }));

  if (enemyTargets.length === 0) return null;

  const labels = degreeLabels(effectiveDefense);

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
          placeholder="total"
          aria-label="roll total"
          value={totalInput}
          onChange={(e) => setTotalInput(e.target.value)}
        />
        <div className="trr-nat-toggle">
          <label>
            <input
              type="checkbox"
              checked={isNat20}
              onChange={(e) => {
                setIsNat20(e.target.checked);
                if (e.target.checked) setIsNat1(false);
              }}
              aria-label="natural 20"
            />
            nat 20
          </label>
          <label>
            <input
              type="checkbox"
              checked={isNat1}
              onChange={(e) => {
                setIsNat1(e.target.checked);
                if (e.target.checked) setIsNat20(false);
              }}
              aria-label="natural 1"
            />
            nat 1
          </label>
        </div>
      </div>

      {results && (
        <div className="trr-results">
          {results.map((r) => {
            const info = r.degree ? labels[r.degree] : null;
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default TargetRollResolver;
