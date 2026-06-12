import React from 'react';
import { riderEnabled, formatDamageBreakdown } from '../../utils/damage';
import './DamagePanel.css';

/**
 * Damage entry step (#222) — shown by TargetRollResolver after a hit/crit.
 * Presentational: the resolver owns all state and the per-target math
 * (computeTargetDamage), so getResults() stays synchronous.
 *
 * @param {Object}   profile     - { expression, typeLabel, riders } from buildDamageProfile
 * @param {Array}    hitResults  - resolver results with degree success/criticalSuccess,
 *                                 each already carrying its computed `damage` (or null)
 * @param {string}   entered     - raw rolled-total input value
 * @param {Function} onEntered
 * @param {Object}   riderState  - { [riderId]: bool } overrides of each rider's defaultOn
 * @param {Function} onToggleRider
 * @param {boolean}  critDouble  - the built-in "crit ×2" toggle (off when the table
 *                                 rolls doubled dice and enters the doubled total)
 * @param {Function} onCritDouble
 */
const DamagePanel = ({
  profile,
  hitResults = [],
  entered,
  onEntered,
  riderState,
  onToggleRider,
  critDouble,
  onCritDouble,
}) => {
  if (!profile || hitResults.length === 0) return null;

  const anyCrit = hitResults.some((r) => r.degree === 'criticalSuccess');

  return (
    <div className="dmg-panel">
      <div className="dmg-hint-row">
        <span className="dmg-hint-label">Damage</span>
        {profile.expression && (
          <span className="dmg-expression">
            {profile.expression}
            {profile.typeLabel ? ` ${profile.typeLabel}` : ''}
          </span>
        )}
        <span className="dmg-hint-note">enter your rolled total (un-doubled)</span>
      </div>

      <div className="dmg-entry-row">
        <input
          type="number"
          className="dmg-total-input"
          placeholder="total"
          aria-label="rolled damage total"
          value={entered}
          onChange={(e) => onEntered(e.target.value)}
        />
        {anyCrit && (
          <label className="dmg-rider-toggle">
            <input
              type="checkbox"
              checked={critDouble}
              onChange={(e) => onCritDouble(e.target.checked)}
            />
            <span>Crit ×2</span>
          </label>
        )}
      </div>

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
