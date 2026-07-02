import React from 'react';
import { riderEnabled, formatDamageBreakdown, damageHintParts, damageEntryParts } from '../../utils/damage';
import './DamagePanel.css';

/**
 * Damage entry step (#222) — shown by TargetRollResolver after a hit/crit.
 * Presentational: the resolver owns all state and the per-target math
 * (computeTargetDamage), so getResults() stays synchronous.
 *
 * Save mode (#270, `mode="save"`): rendered in UseAbilityModal before the
 * degrees exist — no hitResults, no crit toggle; the entered total and rider
 * snapshot travel with the save request and the GM derives per-target damage.
 *
 * Multi-instance entry (#1019, attack mode only): when damageEntryParts finds
 * more than one typed part (a piercing sword with a flaming rune's fire dice),
 * the single total is replaced by one input per part — the resolver keys its
 * per-part state by part key and feeds computeTargetDamage `instances`.
 *
 * @param {string}   mode        - 'attack' (default) | 'save'
 * @param {Object}   profile     - { expression, typeLabel, riders } from buildDamageProfile
 * @param {Array}    hitResults  - resolver results with degree success/criticalSuccess,
 *                                 each already carrying its computed `damage` (or null)
 * @param {string}   entered     - raw rolled-total input value (single-part entry)
 * @param {Function} onEntered
 * @param {Object}   enteredParts  - { [partKey]: string } per-part input values (#1019)
 * @param {Function} onEnteredPart - (partKey, value) — presence enables multi-part entry
 * @param {Object}   riderState  - { [riderId]: bool } overrides of each rider's defaultOn
 * @param {Function} onToggleRider
 * @param {boolean}  critDouble  - the built-in "crit ×2" toggle (off when the table
 *                                 rolls doubled dice and enters the doubled total)
 * @param {Function} onCritDouble
 */
const DamagePanel = ({
  mode = 'attack',
  profile,
  hitResults = [],
  entered,
  onEntered,
  enteredParts,
  onEnteredPart,
  riderState,
  onToggleRider,
  critDouble,
  onCritDouble,
}) => {
  const isSave = mode === 'save';
  if (!profile || (!isSave && hitResults.length === 0)) return null;

  const anyCrit = hitResults.some((r) => r.degree === 'criticalSuccess');
  const hintParts = damageHintParts(profile, riderState);
  const entryParts = damageEntryParts(profile, riderState);
  const multiPart = !isSave && !!onEnteredPart && entryParts.length > 1;

  const critToggle = anyCrit && (
    <label className="dmg-rider-toggle">
      <input
        type="checkbox"
        checked={critDouble}
        onChange={(e) => onCritDouble(e.target.checked)}
      />
      <span>Crit ×2</span>
    </label>
  );

  return (
    <div className="dmg-panel">
      <div className="dmg-hint-row">
        <span className="dmg-hint-label">Damage</span>
        {hintParts.length > 0 && (
          <span className="dmg-expression">
            {hintParts
              .map((p) => `${p.dice}${p.typeLabel ? ` ${p.typeLabel}` : ''}`)
              .join(' + ')}
          </span>
        )}
        <span className="dmg-hint-note">
          {isSave
            ? 'enter your rolled total — each target halves/doubles by its save'
            : multiPart
              ? 'enter each rolled total (un-doubled) by damage type'
              : 'enter your rolled total (un-doubled)'}
        </span>
      </div>

      {multiPart ? (
        <div className="dmg-entry-row">
          {entryParts.map((p) => (
            <label key={p.key} className="dmg-part-entry">
              <span className="dmg-part-label">{p.dice}{p.type ? ` ${p.type}` : ''}</span>
              <input
                type="number"
                className="dmg-total-input"
                placeholder="total"
                aria-label={`rolled ${p.type || 'damage'} total`}
                value={enteredParts?.[p.key] ?? ''}
                onChange={(e) => onEnteredPart(p.key, e.target.value)}
              />
            </label>
          ))}
          {critToggle}
        </div>
      ) : (!isSave || profile.expression) && (
        <div className="dmg-entry-row">
          <input
            type="number"
            className="dmg-total-input"
            placeholder="total"
            aria-label="rolled damage total"
            value={entered}
            onChange={(e) => onEntered(e.target.value)}
          />
          {critToggle}
        </div>
      )}

      {profile.riders.length > 0 && (
        <div className="dmg-riders" role="group" aria-label="damage riders">
          {profile.riders.map((rider) => (
            <label key={rider.id} className="dmg-rider-toggle">
              <input
                type="checkbox"
                checked={riderEnabled(rider, riderState)}
                onChange={(e) => onToggleRider(rider.id, e.target.checked)}
              />
              <span>
                {rider.label}
                {rider.dice && (
                  <span className="dmg-rider-persistent">
                    {' '}{rider.dice} {rider.type || ''}
                  </span>
                )}
                {rider.persistent?.dice && (
                  <span className="dmg-rider-persistent">
                    {' '}{rider.persistent.dice} persistent {rider.persistent.type || ''}
                  </span>
                )}
              </span>
              {rider.note && <span className="dmg-rider-note">{rider.note}</span>}
            </label>
          ))}
        </div>
      )}

      {hitResults.some((r) => r.damage) && (
        <div className="dmg-results">
          {hitResults.map((r) => r.damage && (
            <div key={r.entryId} className="dmg-result-line">
              <span className="dmg-result-name">{r.name}</span>
              <span className="dmg-result-total">{formatDamageBreakdown(r.damage)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DamagePanel;
