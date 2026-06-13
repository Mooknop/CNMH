import React, { useState, useMemo } from 'react';
import Modal from '../shared/Modal';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useTargeting } from '../../hooks/useTargeting';
import { useEnemyEffects } from '../../hooks/useEnemyEffects';
import { useGameDate } from '../../contexts/GameDateContext';
import { useContent } from '../../contexts/ContentContext';
import { useSession } from '../../contexts/SessionContext';
import { resolveActionRoll } from '../../utils/rollResolution';
import { computeSaveDegree } from '../../utils/saveDegree';
import { defenseDC, DEFENSE_LABELS } from '../../utils/defense';
import { immunityConfigFor } from '../../utils/immunity';
import { isAttackAbility, mapStepFor, mapPenaltyFor } from '../../utils/map';
import { getCondition } from '../../data/pf2eConditions';
import { toGameSeconds } from '../../utils/gameTime';
import './SkillActionModal.css';

const DEGREE_LABELS = {
  criticalSuccess: 'Critical Success',
  success:         'Success',
  failure:         'Failure',
  criticalFailure: 'Critical Failure',
};

const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);

/**
 * Player-initiated skill action against an enemy (#260). Demoralize and the
 * Athletics maneuvers (Trip / Grapple / Shove / Disarm).
 *
 * Mirrors the existing roll resolvers — the player picks one enemy, sees their
 * skill modifier, enters a raw d20, and the degree is computed vs the target's
 * defense DC (prefilled from the enemy's defenses when known, GM-entered
 * otherwise). On confirm the action is spent and the degree's outcome is applied:
 * an enemy condition, a note for GM-resolved effects, and/or a self-condition on
 * a maneuver crit-fail. Attack-trait maneuvers read and advance the Multiple
 * Attack Penalty; Demoralize stamps its per-target immunity.
 *
 * @param {object} action - a skillActions.js entry
 */
const SkillActionModal = ({ isOpen, onClose, action, character, themeColor }) => {
  const characterModel = useCharacter(character);
  const { effects } = useEffects(character?.id || '');
  const { effects: effectCatalog } = useContent();
  const [activeConditions] = useSyncedState(`cnmh_conditions_${character?.id || 'none'}`, []);
  const { encounter, appendLog } = useEncounter();
  const { spendActions, recordAttack, turnState } = useTurnState(character?.id);
  const { applyCondition, stampImmunity, isImmune } = useEnemyEffects();
  const { getState, sendUpdate } = useSession();
  const { gameDate, time } = useGameDate();

  // Attack-trait maneuvers participate in the Multiple Attack Penalty.
  const isAttack = isAttackAbility(action);
  const autoStep = mapStepFor(turnState?.attacksMade ?? 0);
  const [mapOverride, setMapOverride] = useState(null);
  const mapStep = isAttack ? (mapOverride ?? autoStep) : 0;

  const order = useMemo(() => encounter?.order || [], [encounter]);
  const { selectable } = useTargeting(character?.id, order);
  const enemyTargets = useMemo(
    () => selectable.filter((e) => e.kind === 'enemy'),
    [selectable]
  );

  const [pickedId, setPickedId] = useState(null);
  const [d20, setD20] = useState('');
  const [dcInput, setDcInput] = useState('');
  const [resolved, setResolved] = useState(null); // locks the UI after confirm

  const target = useMemo(
    () => order.find((e) => e.entryId === pickedId) || null,
    [order, pickedId]
  );

  // Net skill modifier via the shared resolver (conditions + effects + MAP).
  // The synthetic ability carries the action's traits so the resolver's post-hoc
  // MAP block applies to Attack-trait maneuvers exactly like a strike.
  const rollProfile = useMemo(() => {
    if (!character || !characterModel || !action) return null;
    const synthetic = { traits: action.traits, roll: { type: 'skill', skill: action.skill } };
    return resolveActionRoll(synthetic, character, {
      conditions: activeConditions || [],
      effects: effects || [],
      effectCatalog,
      mapStep,
    });
  }, [character, characterModel, action, activeConditions, effects, effectCatalog, mapStep]);

  const netMod = rollProfile?.bonus ?? null;

  // DC: prefill from the enemy's defense when present; always GM-overridable.
  const prefilledDC = target?.defenses ? defenseDC(target.defenses, action?.defense) : null;
  const dcVal = dcInput !== '' ? parseInt(dcInput, 10) : prefilledDC;

  const d20Val = parseInt(d20, 10);
  const total = !isNaN(d20Val) && netMod != null ? d20Val + netMod : null;
  const degree = total != null && dcVal != null && !isNaN(dcVal)
    ? computeSaveDegree({ d20: d20Val, total, dc: dcVal })
    : null;

  const nowSecs = toGameSeconds({ ...gameDate, ...time });
  const immuneConfig = immunityConfigFor(action);
  const targetImmune = pickedId && immuneConfig
    ? isImmune(pickedId, {
        abilityKey: action.id,
        casterId: character?.id,
        scope: immuneConfig.scope,
        nowSecs,
      })
    : false;

  const outcome = degree ? action?.outcomes?.[degree] || null : null;

  // A condition catalog entry is "valued" (frightened 2) vs flat (prone).
  const condLabel = (id, value) => {
    if (!id) return null;
    const def = getCondition(id);
    const name = def?.name || id;
    return def?.valued && value != null ? `${name} ${value}` : name;
  };

  // Human-readable summary of an outcome: enemy condition, GM note, and/or the
  // self-condition a maneuver crit-fail leaves on the acting PC.
  const describeOutcome = (o) => {
    if (!o) return 'no effect';
    const parts = [];
    if (o.condition) parts.push(condLabel(o.condition, o.value));
    if (o.note) parts.push(o.note);
    if (o.selfCondition) parts.push(`you are ${condLabel(o.selfCondition)}`);
    return parts.length ? parts.join('; ') : 'no effect';
  };

  const defenseLabel = DEFENSE_LABELS[action?.defense] || 'DC';

  const canConfirm =
    !resolved && !!target && !targetImmune && total != null && degree != null;

  const handleD20 = (e) => {
    const v = e.target.value;
    if (v === '' || (/^\d+$/.test(v) && parseInt(v, 10) <= 20)) setD20(v);
  };

  const handleDc = (e) => {
    const v = e.target.value;
    if (v === '' || /^\d+$/.test(v)) setDcInput(v);
  };

  const handleConfirm = () => {
    if (!canConfirm) return;

    spendActions(action.actionCost, action.name);

    // Enemy condition (frightened / prone / grabbed / restrained).
    if (outcome?.condition) {
      applyCondition(pickedId, {
        id: outcome.condition,
        value: outcome.value ?? null,
        source: action.name,
      });
    }

    // Self-condition on a maneuver crit-fail (you fall prone). Mirrors the
    // off-guard write in useExploitVulnerability — de-dupe, then sync.
    if (outcome?.selfCondition && character?.id) {
      const cur = getState(character.id, 'conditions') || [];
      if (!cur.some((c) => c.id === outcome.selfCondition)) {
        sendUpdate(character.id, 'conditions', [...cur, { id: outcome.selfCondition, value: null }]);
      }
    }

    // Attack-trait maneuvers advance the Multiple Attack Penalty.
    if (isAttack) recordAttack(1);

    // Per RAW the target is temporarily immune after any (non-errored) attempt.
    if (immuneConfig) {
      stampImmunity(pickedId, {
        abilityKey: action.id,
        abilityName: action.name,
        casterId: character?.id,
        nowSecs,
        durationSecs: immuneConfig.durationSecs,
      });
    }

    const resultStr = describeOutcome(outcome);
    appendLog({
      type: 'action',
      charId: character?.id,
      text: `${character?.name} ${action.name} vs ${target.name} (${defenseLabel} ${dcVal}): ${total} → ${DEGREE_LABELS[degree]} — ${resultStr}`,
    });

    setResolved({ degree, total, resultStr, targetName: target.name });
  };

  const handleClose = () => {
    setPickedId(null);
    setD20('');
    setDcInput('');
    setMapOverride(null);
    setResolved(null);
    onClose();
  };

  if (!isOpen || !action) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={action.name}
      themeColor={themeColor}
      maxWidth="400px"
    >
      <div className="sam-body">
        {/* Target picker */}
        <div className="sam-field">
          <label className="sam-label">Target</label>
          <div className="sam-target-picks">
            {enemyTargets.length === 0 ? (
              <span className="sam-empty">No enemies in the encounter.</span>
            ) : (
              enemyTargets.map((e) => (
                <button
                  key={e.entryId}
                  className={`sam-target-btn${pickedId === e.entryId ? ' sam-target-btn--active' : ''}`}
                  onClick={() => { setPickedId(e.entryId); setDcInput(''); setResolved(null); }}
                  disabled={!!resolved}
                >
                  {e.name}
                </button>
              ))
            )}
          </div>
        </div>

        {target && (
          <>
            {/* Immunity notice */}
            {targetImmune && (
              <div className="sam-immune" role="status">
                {target.name} is immune to {action.name} right now.
              </div>
            )}

            {/* Net modifier */}
            {netMod != null && (
              <div className="sam-bonus-row">
                <span className="sam-bonus-label">{action.name}</span>
                <span className="sam-bonus-value">{fmtMod(netMod)}</span>
              </div>
            )}

            {/* Multiple Attack Penalty — Attack-trait maneuvers only */}
            {isAttack && (
              <div className="sam-field">
                <label className="sam-label">Multiple attack penalty</label>
                <div className="sam-target-picks">
                  {[0, 1, 2].map((step) => {
                    const pen = mapPenaltyFor(action, step);
                    const active = mapStep === step;
                    return (
                      <button
                        key={step}
                        className={`sam-target-btn${active ? ' sam-target-btn--active' : ''}`}
                        onClick={() => setMapOverride(step)}
                        disabled={!!resolved}
                      >
                        {pen === 0 ? 'No MAP' : pen}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* d20 + DC */}
            <div className="sam-inputs">
              <div className="sam-field">
                <label className="sam-label" htmlFor="sam-d20">d20 roll</label>
                <input
                  id="sam-d20"
                  className="sam-input"
                  type="number"
                  min="1"
                  max="20"
                  placeholder="1–20"
                  value={d20}
                  onChange={handleD20}
                  disabled={!!resolved}
                />
              </div>
              <div className="sam-field">
                <label className="sam-label" htmlFor="sam-dc">{defenseLabel}</label>
                <input
                  id="sam-dc"
                  className="sam-input"
                  type="number"
                  min="1"
                  placeholder={prefilledDC != null ? String(prefilledDC) : 'DC'}
                  value={dcInput}
                  onChange={handleDc}
                  disabled={!!resolved}
                />
              </div>
            </div>

            {/* Running total + degree */}
            {total != null && (
              <div className="sam-total-row">
                <span className="sam-total-label">Total</span>
                <span className="sam-total-value">{total}</span>
              </div>
            )}
            {degree && (
              <div className={`sam-degree sam-degree--${degree}`}>
                {DEGREE_LABELS[degree]} — {describeOutcome(outcome)}
              </div>
            )}

            {/* Confirm / result */}
            {resolved ? (
              <div className="sam-result">
                ✓ {action.name} vs {resolved.targetName} — {resolved.resultStr}
              </div>
            ) : (
              <button
                className="sam-confirm-btn"
                onClick={handleConfirm}
                disabled={!canConfirm}
              >
                {targetImmune
                  ? 'Target is immune'
                  : `Use ${action.name} (${action.actionCost} act)`}
              </button>
            )}
          </>
        )}

        <div className="sam-footer">
          <button className="btn-secondary" onClick={handleClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
};

export default SkillActionModal;
