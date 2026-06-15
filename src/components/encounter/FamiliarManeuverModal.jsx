import React, { useMemo, useRef, useState } from 'react';
import Modal from '../shared/Modal';
import TargetRollResolver from './TargetRollResolver';
import { useEncounter } from '../../hooks/useEncounter';
import { useTargeting } from '../../hooks/useTargeting';
import { familiarSkillBonus } from '../../utils/minionUtils';
import './FamiliarManeuverModal.css';

const DEGREE_LABELS = {
  criticalSuccess: 'Critical Success',
  success:         'Success',
  failure:         'Failure',
  criticalFailure: 'Critical Failure',
};

// Outcome phrasing per maneuver, logged for the GM. No enemy-state mutation —
// the result goes to the GM via the combat log, like the minion strike resolver.
const OUTCOMES = {
  trip: {
    criticalSuccess: 'knocked prone',
    success:         'knocked prone',
  },
  disarm: {
    criticalSuccess: 'item knocked to the ground',
    success:         'disarmed (−2 to attacks with that weapon until its turn ends)',
  },
};

/**
 * A Squox familiar's Disarm/Trip via Acrobatics (#223). Squox Tricks lets the
 * familiar use Acrobatics for these two maneuvers and grants a +2 circumstance
 * bonus against an off-guard target. The familiar is its own actor: the check
 * resolves against the target's Reflex DC and the result is logged for the GM —
 * no enemy-state mutation, mirroring MinionStrikeModal.
 *
 * @param {Object} maneuver     - { id: 'disarm'|'trip', name }
 * @param {Object} familiarData - character.familiar (name, skills)
 * @param {Object} character    - the owner PC (level, id)
 */
const FamiliarManeuverModal = ({ isOpen, onClose, maneuver, familiarData, character, themeColor }) => {
  const { encounter, appendLog } = useEncounter();
  const ownerId = character?.id;
  const order = useMemo(() => encounter?.order || [], [encounter]);
  const { selectable } = useTargeting(ownerId, order);
  const enemyTargets = useMemo(() => selectable.filter((e) => e.kind === 'enemy'), [selectable]);

  // Acrobatics is the Squox's check (not Athletics). Familiars carry no ability
  // scores, so seed from the sheet's familiar-skill convention and let the GM
  // override — the table's familiar ruling wins over any derived number.
  const baseAcro = familiarSkillBonus('acrobatics', familiarData, character?.level ?? 1);
  const [acroMod, setAcroMod] = useState(String(baseAcro));
  const [offGuard, setOffGuard] = useState(false);
  const [pickedId, setPickedId] = useState(null);
  const [resolved, setResolved] = useState(null);
  const resolverRef = useRef(null);

  const acroNum = /^-?\d+$/.test(acroMod) ? parseInt(acroMod, 10) : baseAcro;
  const netBonus = acroNum + (offGuard ? 2 : 0);

  const target = useMemo(
    () => enemyTargets.find((e) => e.entryId === pickedId) || null,
    [enemyTargets, pickedId]
  );
  const resolverTargets = useMemo(() => (target ? [target] : []), [target]);

  const handleConfirm = () => {
    const results = resolverRef.current?.getResults();
    if (!results || results.length === 0) return;

    results.forEach((r) => {
      const degreeLabel = r.degree ? DEGREE_LABELS[r.degree] : null;
      const outcome = (r.degree && OUTCOMES[maneuver?.id]?.[r.degree]) || null;
      const dcSuffix = r.dc != null ? ` (Reflex DC ${r.dc})` : '';
      const tail = degreeLabel
        ? `: ${r.total} → ${degreeLabel}${outcome ? ` — ${r.name} ${outcome}` : ''}`
        : `: ${r.total}`;
      appendLog({
        type: 'action',
        charId: ownerId,
        text: `${familiarData?.name || 'Familiar'} ${maneuver?.name} vs ${r.name}${dcSuffix}${tail}${offGuard ? ' [off-guard +2]' : ''}`,
      });
    });

    setResolved(true);
  };

  const handleClose = () => {
    setAcroMod(String(baseAcro));
    setOffGuard(false);
    setPickedId(null);
    setResolved(null);
    onClose();
  };

  if (!isOpen || !maneuver) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`${familiarData?.name || 'Familiar'} — ${maneuver.name}`}
      themeColor={themeColor}
      maxWidth="420px"
    >
      <div className="fmm-body">
        {/* Target picker */}
        <div className="fmm-field">
          <label className="fmm-label">Target</label>
          <div className="fmm-target-picks">
            {enemyTargets.length === 0 ? (
              <span className="fmm-empty">No enemies in the encounter.</span>
            ) : (
              enemyTargets.map((e) => (
                <button
                  key={e.entryId}
                  className={`fmm-target-btn${pickedId === e.entryId ? ' fmm-target-btn--active' : ''}`}
                  onClick={() => { setPickedId(e.entryId); setResolved(null); }}
                  disabled={!!resolved}
                >
                  {e.name}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Acrobatics modifier — Squox Tricks uses Acrobatics; GM-overridable */}
        <div className="fmm-field">
          <label className="fmm-label" htmlFor="fmm-acro">Acrobatics modifier</label>
          <input
            id="fmm-acro"
            className="fmm-input"
            type="number"
            value={acroMod}
            onChange={(e) => setAcroMod(e.target.value)}
            disabled={!!resolved}
          />
        </div>

        {/* Squox Tricks — +2 circumstance against an off-guard target */}
        <div className="fmm-field">
          <label className="fmm-label">Circumstance</label>
          <div className="fmm-target-picks">
            <button
              type="button"
              className={`fmm-target-btn${offGuard ? ' fmm-target-btn--active' : ''}`}
              onClick={() => setOffGuard((v) => !v)}
              disabled={!!resolved}
            >
              Target off-guard +2
            </button>
          </div>
        </div>

        {/* Roll vs the target's Reflex DC */}
        {target && (
          <TargetRollResolver
            ref={resolverRef}
            enemyTargets={resolverTargets}
            targetDefense="reflex"
            rollBonus={netBonus}
          />
        )}

        <div className="fmm-actions">
          <button
            type="button"
            className="btn-primary fmm-confirm"
            onClick={handleConfirm}
            disabled={!target || !!resolved}
          >
            {resolved ? 'Resolved' : `Log ${maneuver.name}`}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default FamiliarManeuverModal;
