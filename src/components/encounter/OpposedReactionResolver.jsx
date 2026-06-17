import React, { useState, useImperativeHandle, forwardRef } from 'react';
import { computeSaveDegree } from '../../utils/saveDegree';
import { formatModifier } from '../../utils/CharacterUtils';
import { DEGREE_LABELS_SAVE } from './TargetRollResolver';
import './TargetRollResolver.css';

/**
 * Inline resolver for opposed reactions (#226-C) — reaction-cost abilities that
 * resolve the actor's own skill roll against a GM-called DC rather than a
 * target's defense (Upstage, Disrupting Performance). Unlike TargetRollResolver
 * there is no per-target defense: the player relays the single opposed DC the GM
 * calls out and (optionally) picks the triggering enemy from the encounter order.
 *
 * The actor's skill total is derived upstream by resolveActionRoll and passed in
 * as `rollBonus`; the player enters the raw d20 and the component computes the
 * degree (with nat 1/20 shift) the same way the save resolver does.
 *
 * Exposes getResults() via ref so the modal reads the latest values at confirm.
 *
 * @param {number|null} rollBonus    - actor's net skill bonus added to the d20 face
 * @param {Array}       enemyOptions - encounter entries (kind:'enemy') for the picker
 * @param {string|null} skillLabel   - skill name shown beside the d20 entry (display only)
 * @param {string|null} successNote  - caveat shown on a successful degree (e.g. the
 *                                      "applies only if the enemy failed their check" note)
 * @param {object}      ref          - forwarded ref; exposes { getResults() }
 */
const OpposedReactionResolver = forwardRef(({
  rollBonus = null,
  enemyOptions = [],
  skillLabel = null,
  successNote = null,
}, ref) => {
  const [dcInput,      setDcInput]      = useState('');
  const [d20Input,     setD20Input]     = useState('');
  const [enemyEntryId, setEnemyEntryId] = useState('');

  const dc     = parseInt(dcInput, 10);
  const hasDc  = !isNaN(dc);
  const d20    = parseInt(d20Input, 10);
  const hasD20 = !isNaN(d20);

  // d20 + bonus when a derivable bonus exists; otherwise the input is the raw total.
  const total   = hasD20 ? (rollBonus !== null ? d20 + rollBonus : d20) : NaN;
  const d20face = hasD20 ? d20 : 10; // neutral face → no nat-1/20 shift

  const degree = (hasD20 && hasDc)
    ? computeSaveDegree({ d20: d20face, total, dc })
    : null;

  const enemyName = enemyOptions.find((e) => e.entryId === enemyEntryId)?.name || null;

  useImperativeHandle(ref, () => ({
    getResults: () => ({
      d20:          hasD20 ? d20 : null,
      total:        hasD20 ? total : null,
      dc:           hasDc ? dc : null,
      degree,
      enemyEntryId: enemyEntryId || null,
      enemyName,
    }),
  }));

  const bonusDisplay = rollBonus !== null ? formatModifier(rollBonus) : null;
  const totalDisplay = hasD20 && rollBonus !== null ? total : null;
  const info         = degree ? DEGREE_LABELS_SAVE[degree] : null;
  const succeeded    = degree === 'success' || degree === 'criticalSuccess';

  return (
    <div className="trr-section">
      <div className="trr-dc-row">
        <span className="trr-defense-label">Opposed DC</span>
        <input
          type="number"
          className="trr-roll-input"
          placeholder="DC"
          aria-label="opposed dc"
          value={dcInput}
          onChange={(e) => setDcInput(e.target.value)}
        />
        {enemyOptions.length > 0 && (
          <select
            className="trr-defense-select"
            aria-label="triggering enemy"
            value={enemyEntryId}
            onChange={(e) => setEnemyEntryId(e.target.value)}
          >
            <option value="">No enemy</option>
            {enemyOptions.map((e) => (
              <option key={e.entryId} value={e.entryId}>{e.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="trr-entry-row">
        {skillLabel && <span className="trr-defense-label">{skillLabel}</span>}
        <input
          type="number"
          className="trr-roll-input"
          placeholder={rollBonus !== null ? 'd20' : 'total'}
          aria-label="raw d20"
          value={d20Input}
          onChange={(e) => setD20Input(e.target.value)}
        />
        {bonusDisplay && (
          <span className="trr-bonus-badge" aria-label="roll bonus">{bonusDisplay}</span>
        )}
        {totalDisplay !== null && (
          <span className="trr-total-badge" aria-label="computed total">= {totalDisplay}</span>
        )}
      </div>

      {info && (
        <div className="trr-results">
          <div className={`trr-result-chip ${info.cls}`}>
            <span className="trr-result-name">vs DC {dc}</span>
            <span className="trr-result-degree">{info.label}</span>
            {succeeded && successNote && (
              <span className="trr-degree-text">{successNote}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default OpposedReactionResolver;
