import React, { useState, useMemo, useContext } from 'react';
import RollSheet from '../encounter/RollSheet';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSession } from '../../contexts/SessionContext';
import { CharacterContext } from '../../contexts/CharacterContext';
import { useContent } from '../../contexts/ContentContext';
import {
  explorationRollBonus,
  explorationDegreeOfSuccess as degreeOfSuccess,
  applyExplorationSuccessEffect,
} from '../../utils/explorationUtils';
import './RollActivityModal.css';
import { RELAY, APP, syncKey } from '../../sync/keys';

const SKILL_DISPLAY = {
  arcana: 'Arcana', nature: 'Nature', occultism: 'Occultism', religion: 'Religion',
  society: 'Society', crafting: 'Crafting', survival: 'Survival', stealth: 'Stealth',
  deception: 'Deception', diplomacy: 'Diplomacy', intimidation: 'Intimidation',
  medicine: 'Medicine', perception: 'Perception', thievery: 'Thievery',
  acrobatics: 'Acrobatics', athletics: 'Athletics', performance: 'Performance',
};

/**
 * Roll modal for exploration activities with a mechanics.roll config, on
 * RollSheet (#1690, Roll Resolution redesign — workstream H). Neither this
 * nor a skill action ever carries an authored DC, so the DC stays a
 * pre-commit player entry — it just moves into the shell's Edit panel,
 * clearly separated from the die, instead of living beside a d20 text input.
 * No degree is computed or shown until commit; RollSheet's result card is the
 * only place a degree appears.
 *
 * Handles:
 *  - type:'skill'           — fixed skill, optional circumstanceBonus
 *  - type:'skill-pick'      — player picks from available skills (trained only)
 *  - secret:true            — the shell's normal roll behavior, unchanged; the
 *                              GM-secretly-rolls case is a permanent-`waiting`
 *                              design question left open (handoff Q5, PR body)
 *  - target:'party-pc'      — shows party member picker; effect applied to picked target
 *  - onSuccessEffect        — applied automatically inside onCommit on success
 *                              (no separate manual Apply step — there is no slot
 *                              on RollSheet's result screen to host one; the
 *                              application itself is part of the one commit
 *                              moment, per the API freeze's own description of
 *                              this surface: "...or applies the effect")
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

  const [pickedSkill, setPickedSkill]   = useState(null);
  const [pickedTarget, setPickedTarget] = useState(null);
  const [dc, setDc]                     = useState('');

  const isPickType    = roll?.type === 'skill-pick';
  const isSecret       = !!roll?.secret;
  const hasTargetPick  = roll?.target === 'party-pc';
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

  // Follow the Expert: check if a +2 circumstance applies for the current skill
  const followExpert = getState(character?.id, APP.FOLLOWEXPERT);
  const followExpertBonus = (followExpert?.skillId && followExpert.skillId === skillId) ? 2 : 0;

  // Net bonus from conditions + effects + circumstance, via the shared
  // resolver (explorationUtils, #1812) so this and the dock's secret rolls
  // can never compute a different number for the same PC/skill.
  const { bonus: netBonus, circumstanceBonus, circumstanceLabel } = useMemo(
    () => explorationRollBonus(roll, skillId, character, {
      conditions: activeConditions || [],
      effects: effects || [],
      effectCatalog,
      followExpertBonus,
    }),
    [roll, skillId, character, activeConditions, effects, effectCatalog, followExpertBonus]
  );

  const dcVal = parseInt(dc, 10);
  const hasDc = dc !== '' && !isNaN(dcVal);

  // Which character the on-success effect targets
  const effectTargetId = hasTargetPick ? pickedTarget : character?.id;
  const effectTargetName = hasTargetPick
    ? (partyChars || []).find((c) => c.id === pickedTarget)?.name
    : character?.name;

  const handleDc = (e) => {
    const v = e.target.value;
    if (v === '' || /^\d+$/.test(v)) setDc(v);
  };

  const handleClose = () => {
    setDc('');
    setPickedSkill(null);
    setPickedTarget(null);
    onClose();
  };

  if (!isOpen || !activity || !roll) return null;

  const skillLabel = skillId ? (SKILL_DISPLAY[skillId] || skillId) : null;
  const bonusDisplay = netBonus != null
    ? (netBonus >= 0 ? `+${netBonus}` : `${netBonus}`)
    : null;

  // Hard blocks — everything a commit needs that isn't decided yet. Checked in
  // the order the player must resolve them: skill, then target, then DC.
  let blockLine = null;
  if (isPickType && !skillId) {
    blockLine = pickableSkills.length === 0
      ? 'No trained skills for this check — nothing to roll.'
      : 'Pick a skill in Edit before rolling.';
  } else if (hasTargetPick && !pickedTarget) {
    blockLine = (partyChars || []).length === 0
      ? 'No party members to pick — nothing to roll.'
      : 'Pick a target in Edit before rolling.';
  } else if (!hasDc) {
    blockLine = 'Enter a DC in Edit before rolling.';
  }

  // The bonus only reveals once every pre-roll pick is resolved — mirrors the
  // old gating (`skillId && (!hasTargetPick || pickedTarget)`) so a party
  // target check doesn't show a modifier for the wrong (or no) target.
  const readyForBonus = !hasTargetPick || !!pickedTarget;
  const summaryParts = [];
  if (hasTargetPick) summaryParts.push(effectTargetName || 'pick a target');
  if (skillLabel && readyForBonus) summaryParts.push(`${skillLabel} ${bonusDisplay ?? '—'}`);
  else if (isPickType && !skillLabel) summaryParts.push('pick a skill');
  const summaryLine = summaryParts.join(' · ');

  const editStatusLine = circumstanceBonus > 0
    ? `includes +${circumstanceBonus} ${circumstanceLabel} circumstance`
    : '';

  const dcLine = hasDc ? `nothing rolled yet · DC ${dcVal}` : 'nothing rolled yet · no DC set';

  const preCommitNote = isSecret
    ? 'The GM may roll this check secretly. Your modifier is shown for reference.'
    : undefined;

  const handleCommit = (face) => {
    const total = face + (netBonus ?? 0);
    const degree = degreeOfSuccess(total, dcVal);
    const succeeded = degree === 'success' || degree === 'criticalSuccess';

    let note;
    if (effectDef) {
      if (succeeded && effectTargetId) {
        applyExplorationSuccessEffect(onSuccessEffectId, effectTargetId, { getState, sendUpdate });
        note = `${effectDef.name} applied${effectTargetName ? ` to ${effectTargetName}` : ''}`;
      } else {
        note = `${effectDef.name} — success required`;
      }
    }

    return [{
      entryId: character?.id || 'self',
      name: character?.name || skillLabel || activity.name,
      dcLabel: `DC ${dcVal}`,
      degree,
      note,
    }];
  };

  const editPanel = (
    <>
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
                  type="button"
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
                  type="button"
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
    </>
  );

  return (
    <RollSheet
      isOpen={isOpen}
      onClose={handleClose}
      title={activity.name}
      themeColor={themeColor}
      maxWidth="400px"
      summaryLine={summaryLine}
      blockLine={blockLine}
      editPanel={editPanel}
      editStatusLine={editStatusLine}
      hasD20
      charId={character?.id}
      flavor={activity.name}
      bonus={readyForBonus ? netBonus : null}
      bonusLabel={readyForBonus ? (skillLabel || '') : ''}
      dcLine={dcLine}
      commitLabel={`Resolve ${activity.name}`}
      preCommitNote={preCommitNote}
      onCommit={handleCommit}
      damageParts={null}
    />
  );
};

export default RollActivityModal;
