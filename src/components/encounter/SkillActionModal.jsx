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
import { resolveActionRoll } from '../../utils/rollResolution';
import { computeSaveDegree } from '../../utils/saveDegree';
import { defenseDC, DEFENSE_LABELS } from '../../utils/defense';
import { immunityConfigFor } from '../../utils/immunity';
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
 * Player-initiated skill action against an enemy (#260). Slice 1: Demoralize.
 *
 * Mirrors the existing roll resolvers — the player picks one enemy, sees their
 * skill modifier, enters a raw d20, and the degree is computed vs the target's
 * defense DC (prefilled from the enemy's defenses when known, GM-entered
 * otherwise). On confirm the action is spent, the degree's condition is applied
 * to the enemy, and the action's per-target immunity is stamped.
 *
 * @param {object} action - a skillActions.js entry
 */
const SkillActionModal = ({ isOpen, onClose, action, character, themeColor }) => {
  const characterModel = useCharacter(character);
  const { effects } = useEffects(character?.id || '');
  const { effects: effectCatalog } = useContent();
  const [activeConditions] = useSyncedState(`cnmh_conditions_${character?.id || 'none'}`, []);
  const { encounter, appendLog } = useEncounter();
  const { spendActions } = useTurnState(character?.id);
  const { applyCondition, stampImmunity, isImmune } = useEnemyEffects();
  const { gameDate, time } = useGameDate();

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

  // Net skill modifier via the shared resolver (conditions + effects applied).
  const rollProfile = useMemo(() => {
    if (!character || !characterModel || !action) return null;
    const synthetic = { roll: { type: 'skill', skill: action.skill } };
    return resolveActionRoll(synthetic, character, {
      conditions: activeConditions || [],
      effects: effects || [],
      effectCatalog,
    });
  }, [character, characterModel, action, activeConditions, effects, effectCatalog]);

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
  const conditionName = outcome ? (getCondition(outcome.condition)?.name || outcome.condition) : null;

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

    if (outcome) {
      applyCondition(pickedId, {
        id: outcome.condition,
        value: outcome.value,
        source: action.name,
      });
    }

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

    const resultStr = outcome
      ? `${conditionName} ${outcome.value}`
      : 'no effect';
    appendLog({
      type: 'action',
      charId: character?.id,
      text: `${character?.name} ${action.name} vs ${target.name} (${defenseLabel} ${dcVal}): ${total} → ${DEGREE_LABELS[degree]} — ${resultStr}`,
    });

    setResolved({ degree, total, conditionName, value: outcome?.value ?? null, targetName: target.name });
  };

  const handleClose = () => {
    setPickedId(null);
    setD20('');
    setDcInput('');
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
                {DEGREE_LABELS[degree]}
                {outcome ? ` — ${conditionName} ${outcome.value}` : ' — no effect'}
              </div>
            )}

            {/* Confirm / result */}
            {resolved ? (
              <div className="sam-result">
                ✓ {action.name} applied to {resolved.targetName}
                {resolved.conditionName ? ` — ${resolved.conditionName} ${resolved.value}` : ' — no effect'}
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
