import React from 'react';
import { riderEnabled, damageHintParts, damageRollFormulas } from '../../utils/damage';
import DamageEntry from '../shared/DamageEntry';
import './DamagePanel.css';

/**
 * Pre-commit save-damage entry (#270) — the caster's rolled total + rider
 * snapshot for a target-save ability, captured BEFORE any degree exists; they
 * travel with the save request and the GM derives per-target damage.
 *
 * This is the panel's surviving shape after the Roll Resolution redesign
 * (#1680 successor arc): the attack mode — per-hit results, multi-instance
 * entry (#1019), the crit ×2 toggle — died with TargetRollResolver; RollSheet's
 * amount phase + DamageEntry (+ useAttackRollSheet's amountExtras) own that
 * flow now. The three consumers are all save-shaped by design:
 *   - UseAbilityModal's classic save fallback (chain contexts / no derivable DC
 *     — shapes the save SHEET's gate refuses)
 *   - ChainedSpellSection's chained saves (deliberately old-style GM-applied,
 *     the #1691 workstream-J decision)
 *   - useSecondaryProfiles' extra zones (each request carries its own total)
 *
 * @param {Object}   profile     - { expression, typeLabel, riders } from buildDamageProfile
 * @param {string}   entered     - raw rolled-total input value
 * @param {Function} onEntered
 * @param {Object}   riderState  - { [riderId]: bool } overrides of each rider's defaultOn
 * @param {Function} onToggleRider
 * @param {string}   [charId]    - dice-tower rail (#1490 S5): with a rail-capable
 *                                 bridge the row grows a "Roll in Foundry" pill that
 *                                 delegates the folded formula (damageRollFormulas)
 *                                 and fills the row with the rolled TOTAL
 * @param {string}   [flavor]    - chat-label prefix for delegated damage rolls
 */
const DamagePanel = ({
  profile,
  entered,
  onEntered,
  riderState,
  onToggleRider,
  charId = null,
  flavor = '',
}) => {
  if (!profile) return null;

  const hintParts = damageHintParts(profile, riderState);
  const rollFormulas = damageRollFormulas(profile, riderState);

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
          enter your rolled total — each target halves/doubles by its save
        </span>
      </div>

      {profile.expression && (
        <div className="dmg-entry-row">
          <DamageEntry
            part={{ key: 'base', dice: profile.expression, type: profile.typeLabel, formula: rollFormulas.base ?? '' }}
            value={entered}
            onChange={onEntered}
            charId={charId}
            flavor={`${flavor ? `${flavor} — ` : ''}damage`}
          />
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
    </div>
  );
};

export default DamagePanel;
