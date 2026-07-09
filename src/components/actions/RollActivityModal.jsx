import React, { useState, useMemo, useContext } from 'react';
import Modal from '../shared/Modal';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSession } from '../../contexts/SessionContext';
import { CharacterContext } from '../../contexts/CharacterContext';
import { resolveActionRoll } from '../../utils/rollResolution';
import { useContent } from '../../contexts/ContentContext';
import { newEntryUid } from '../../utils/uid';
import './RollActivityModal.css';
import { RELAY, syncKey } from '../../sync/keys';

const EXPLORATION_EFFECT_SOURCE = 'exploration';

// Derive the degree of success from a d20 total vs DC, applying the PF2e
// critical threshold rule (beat/miss DC by 10+).
function degreeOfSuccess(total, dc) {
  if (total >= dc + 10) return 'criticalSuccess';
  if (total >= dc)      return 'success';
  if (total <= dc - 10) return 'criticalFailure';
  return 'failure';
}

const DEGREE_LABELS = {
  criticalSuccess: 'Critical Success',
  success:         'Success',
  failure:         'Failure',
  criticalFailure: 'Critical Failure',
};

const SKILL_DISPLAY = {
  arcana: 'Arcana', nature: 'Nature', occultism: 'Occultism', religion: 'Religion',
  society: 'Society', crafting: 'Crafting', survival: 'Survival', stealth: 'Stealth',
  deception: 'Deception', diplomacy: 'Diplomacy', intimidation: 'Intimidation',
  medicine: 'Medicine', perception: 'Perception', thievery: 'Thievery',
  acrobatics: 'Acrobatics', athletics: 'Athletics', performance: 'Performance',
};

/**
 * Roll modal for exploration activities with a mechanics.roll config.
 *
 * Handles:
 *  - type:'skill'           — fixed skill, optional circumstanceBonus
 *  - type:'skill-pick'      — player picks from available skills (trained only)
 *  - secret:true            — shows modifier but notes GM may roll secretly
 *  - target:'party-pc'      — shows party member picker; effect applied to picked target
 *  - onSuccessEffect        — shows Apply button on success; writes to cnmh_effects_<target>
 */
const RollActivityModal = ({ isOpen, onClose, activity, character, themeColor }) => {
  const roll = activity?.mechanics?.roll;

  const characterModel = useCharacter(character);
  const { effects } = useEffects(character?.id || '');
  const { effects: effectCatalog } = useContent();
  const [activeConditions] = useSyncedState(
    syncKey(RELAY.CONDITIONS, character?.id || 'none'), []
  );
  const { getState, sendUpdate } = useSession();
  const { characters: partyChars } = useContext(CharacterContext) || {};

  const [pickedSkill, setPickedSkill]     = useState(null);
  const [pickedTarget, setPickedTarget]   = useState(null);
  const [d20, setD20]                     = useState('');
  const [dc, setDc]                       = useState('');
  const [effectApplied, setEffectApplied] = useState(false);

  const isPickType   = roll?.type === 'skill-pick';
  const isSecret     = !!roll?.secret;
  const hasTargetPick = roll?.target === 'party-pc';
  const onSuccessEffectId = roll?.onSuccessEffect || null;
  const effectDef = onSuccessEffectId
    ? (effectCatalog || []).find((e) => e.id === onSuccessEffectId) || null
    : null;

  // The effective skill id for the current roll
  const skillId = isPickType ? pickedSkill : roll?.skill;

  // Skills available to pick from, filtered to trained
  const pickableSkills = useMemo(() => {
    if (!isPickType || !roll?.skills) return [];
    const profs = characterModel?.skillProficiencies || {};
    return roll.skills.filter((s) => (profs[s] || 0) >= 1);
  }, [isPickType, roll, characterModel]);

  // Resolve net bonus from conditions + effects using the existing pipeline
  const rollProfile = useMemo(() => {
    if (!skillId || !character || !characterModel) return null;
    const syntheticAbility = { roll: { type: 'skill', skill: skillId } };
    return resolveActionRoll(syntheticAbility, character, {
      conditions: activeConditions || [],
      effects: effects || [],
      effectCatalog,
    });
  }, [skillId, character, characterModel, activeConditions, effects, effectCatalog]);

  // Follow the Expert: check if a +2 circumstance applies for the current skill
  const followExpert = getState(character?.id, 'followexpert');
  const followExpertBonus = (followExpert?.skillId && followExpert.skillId === skillId) ? 2 : 0;
  const followExpertLabel = followExpertBonus ? 'Follow the Expert' : '';

  const baseCircumstanceBonus = roll?.circumstanceBonus || 0;
  const baseCircumstanceLabel = roll?.circumstanceLabel || '';
  const circumstanceBonus = baseCircumstanceBonus + followExpertBonus;
  const circumstanceLabel = [baseCircumstanceLabel, followExpertLabel].filter(Boolean).join(' + ');
  const netBonus = rollProfile ? rollProfile.bonus + circumstanceBonus : null;

  const d20Val = parseInt(d20, 10);
  const dcVal  = parseInt(dc, 10);
  const total  = !isNaN(d20Val) && netBonus != null ? d20Val + netBonus : null;
  const degree = total != null && !isNaN(dcVal) ? degreeOfSuccess(total, dcVal) : null;
  const isSuccess = degree === 'success' || degree === 'criticalSuccess';

  // Which character the on-success effect targets
  const effectTargetId = hasTargetPick ? pickedTarget : character?.id;
  const effectTargetName = hasTargetPick
    ? (partyChars || []).find((c) => c.id === pickedTarget)?.name
    : character?.name;
  const canApplyEffect = onSuccessEffectId && isSuccess && effectTargetId && !effectApplied;

  const handleApplyEffect = () => {
    if (!effectTargetId || !onSuccessEffectId) return;
    const current = getState(effectTargetId, 'effects') || [];
    const next = [
      ...current,
      { id: newEntryUid(), effectId: onSuccessEffectId, source: EXPLORATION_EFFECT_SOURCE, ts: Date.now() },
    ];
    try { window.localStorage.setItem(`cnmh_effects_${effectTargetId}`, JSON.stringify(next)); } catch { /* noop */ }
    sendUpdate(effectTargetId, 'effects', next);
    setEffectApplied(true);
  };

  const handleD20 = (e) => {
    const v = e.target.value;
    if (v === '' || (/^\d+$/.test(v) && parseInt(v) <= 30)) setD20(v);
  };

  const handleDc = (e) => {
    const v = e.target.value;
    if (v === '' || /^\d+$/.test(v)) setDc(v);
  };

  const handleClose = () => {
    setD20('');
    setDc('');
    setPickedSkill(null);
    setPickedTarget(null);
    setEffectApplied(false);
    onClose();
  };

  if (!isOpen || !activity || !roll) return null;

  const skillLabel = skillId ? (SKILL_DISPLAY[skillId] || skillId) : null;
  const bonusDisplay = netBonus != null
    ? (netBonus >= 0 ? `+${netBonus}` : `${netBonus}`)
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={activity.name}
      themeColor={themeColor}
      maxWidth="400px"
    >
      <div className="ram-body">

        {/* Secret notice */}
        {isSecret && (
          <div className="ram-secret-notice">
            <span className="ram-secret-icon">⚿</span>
            <span>The GM may roll this check secretly. Your modifier is shown for reference.</span>
          </div>
        )}

        {/* Party target picker */}
        {hasTargetPick && (
          <div className="ram-field">
            <label className="ram-label">Target</label>
            <div className="ram-skill-picks">
              {(partyChars || []).length === 0 ? (
                <span className="ram-empty">No party members found.</span>
              ) : (
                (partyChars || []).map((pc) => (
                  <button
                    key={pc.id}
                    className={`ram-skill-btn${pickedTarget === pc.id ? ' ram-skill-btn--active' : ''}`}
                    onClick={() => setPickedTarget(pc.id)}
                  >
                    {pc.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Skill picker */}
        {isPickType && (
          <div className="ram-field">
            <label className="ram-label">Skill</label>
            <div className="ram-skill-picks">
              {pickableSkills.length === 0 ? (
                <span className="ram-empty">No trained skills available for this check.</span>
              ) : (
                pickableSkills.map((s) => (
                  <button
                    key={s}
                    className={`ram-skill-btn${pickedSkill === s ? ' ram-skill-btn--active' : ''}`}
                    onClick={() => setPickedSkill(s)}
                  >
                    {SKILL_DISPLAY[s] || s}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Bonus display — shown once we have a skill (and target if required) */}
        {skillId && (!hasTargetPick || pickedTarget) && bonusDisplay != null && (
          <div className="ram-bonus-row">
            <span className="ram-bonus-label">{skillLabel}</span>
            <span className="ram-bonus-value">{bonusDisplay}</span>
            {circumstanceBonus > 0 && (
              <span className="ram-bonus-note">
                (includes +{circumstanceBonus} {circumstanceLabel} circumstance)
              </span>
            )}
          </div>
        )}

        {/* Roll inputs — shown when we have a skill (and target if required) */}
        {skillId && (!hasTargetPick || pickedTarget) && (
          <>
            <div className="ram-inputs">
              <div className="ram-field">
                <label className="ram-label" htmlFor="ram-d20">d20 roll</label>
                <input
                  id="ram-d20"
                  className="ram-input"
                  type="number"
                  min="1"
                  max="20"
                  placeholder="1–20"
                  value={d20}
                  onChange={handleD20}
                />
              </div>
              <div className="ram-field">
                <label className="ram-label" htmlFor="ram-dc">DC</label>
                <input
                  id="ram-dc"
                  className="ram-input"
                  type="number"
                  min="1"
                  placeholder="DC"
                  value={dc}
                  onChange={handleDc}
                />
              </div>
            </div>

            {/* Result */}
            {total != null && (
              <div className="ram-total-row">
                <span className="ram-total-label">Total</span>
                <span className="ram-total-value">{total}</span>
              </div>
            )}
            {degree && (
              <div className={`ram-degree ram-degree--${degree}`}>
                {DEGREE_LABELS[degree]}
              </div>
            )}

            {/* Apply effect on success */}
            {effectDef && degree && (
              <div className="ram-apply-row">
                {effectApplied ? (
                  <span className="ram-apply-done">
                    ✓ {effectDef.name} applied{effectTargetName ? ` to ${effectTargetName}` : ''}
                  </span>
                ) : (
                  <button
                    className="ram-apply-btn"
                    onClick={handleApplyEffect}
                    disabled={!canApplyEffect}
                  >
                    {isSuccess
                      ? `Apply ${effectDef.name}${effectTargetName ? ` → ${effectTargetName}` : ''}`
                      : `${effectDef.name} — success required`}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        <div className="ram-footer">
          <button className="btn-secondary" onClick={handleClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
};

export default RollActivityModal;
