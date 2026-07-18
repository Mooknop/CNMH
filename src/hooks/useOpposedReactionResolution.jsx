import { useRef } from 'react';
import OpposedReactionResolver from '../components/encounter/OpposedReactionResolver';
import { DEGREE_LABELS_SAVE } from '../components/encounter/TargetRollResolver';
import { applyAbility } from '../utils/applyAbility';
import { markPlayingOnCast } from '../utils/playing';
import { resolveActionRoll } from '../utils/rollResolution';
import { SKILL_KEYS } from '../utils/EffectUtils';
import { skillLabel } from '../utils/victoryPoints';

/**
 * Opposed reaction (#226-C, extracted #1317 D3): a reaction-cost ability whose
 * roll config carries `opposed: true`. It resolves the actor's skill total
 * against a GM-called DC the player relays, not a target's defense — so it
 * bypasses the defense-driven resolver entirely.
 *
 * The hook owns the resolver ref, the opposedSection JSX (rendered in BOTH the
 * hasEffects and effect-less branches) and `resolve(ctx)` — the entire
 * early-return confirm path. The orchestrator calls resolve and returns; none
 * of the target-defense / save-request / MAP machinery runs for these.
 *
 * The skill profile is re-derived with the same resolveActionRoll call (and
 * inputs) the orchestrator makes for its own roll profile — the function is
 * pure, so the values are identical.
 */
export const useOpposedReactionResolution = ({
  ability,
  character,
  order,
  activeConditions,
  activeEffects,
  effectCatalog,
  mapStep,
}) => {
  const opposedRef = useRef(null);

  const isOpposedReaction = ability?.roll?.opposed === true;
  const enemyOptions = isOpposedReaction ? (order || []).filter((e) => e.kind === 'enemy') : [];

  const rollOpts = {
    conditions: activeConditions || [],
    effects: activeEffects || [],
    effectCatalog,
    mapStep,
  };
  // The actor's skill total lives in rollProfile.bonus; skill drives the label.
  const rollProfile = isOpposedReaction ? resolveActionRoll(ability, character, rollOpts) : null;
  const opposedSkillLabel = rollProfile?.skill ? skillLabel(rollProfile.skill) : null;

  // Skill picker (#445 — Upstage): when the ability authors `roll.skillChoice`,
  // the player may roll any of the 16 skills (the one the enemy used), not just
  // the authored default. Precompute each skill's net bonus with the same
  // condition/effect netting as the live roll by reusing resolveActionRoll with
  // a skill-overridden ability — no duplicated netting logic. `null` for plain
  // opposed reactions (Disrupting Performance) so the resolver shows no picker.
  const hasSkillChoice = isOpposedReaction && ability.roll?.skillChoice === true;
  const opposedSkillOptions = hasSkillChoice
    ? SKILL_KEYS.map((skill) => {
        const p = resolveActionRoll(
          { ...ability, roll: { ...ability.roll, skill } },
          character,
          rollOpts,
        );
        return { skill, label: skillLabel(skill), bonus: p.bonus };
      })
    : null;

  // Opposed-reaction resolver (#226-C) — DC entry + optional enemy picker + the
  // actor's skill roll. Replaces the defense-driven roll section for these.
  const section = isOpposedReaction ? (
    <OpposedReactionResolver
      ref={opposedRef}
      rollBonus={rollProfile.bonus}
      enemyOptions={enemyOptions}
      skillLabel={opposedSkillLabel}
      skillOptions={opposedSkillOptions}
      defaultSkill={ability.roll?.skill || 'performance'}
      successNote={ability.roll?.successNote || null}
      charId={character?.id}
      rollFlavor={ability.name}
    />
  ) : null;

  // The entire opposed confirm path. The actor's skill roll is compared to the
  // GM-called DC; the authored self effect and any per-enemy immunity land only
  // on a success. Returns true so the orchestrator can early-return.
  const resolve = ({
    hasEffects,
    casterEntryId,
    encounter,
    characters,
    getState,
    sendUpdate,
    appendLog,
    effectiveVerb,
    nowSecs,
    immunityConfig,
    immunityAbilityKey,
    stampImmunity,
    effectiveCost,
    verb,
    spendReaction,
    onClose,
  }) => {
    const res = opposedRef.current?.getResults() ?? null;
    const succeeded = res?.degree === 'success' || res?.degree === 'criticalSuccess';

    // Authored self effect (Upstage's +1 status buff). Crit and plain success
    // both apply at the engine level; the "only if the enemy failed" caveat is
    // the rendered success note, not auto-enforced.
    if (succeeded && hasEffects) {
      applyAbility({
        ability,
        caster: character,
        casterEntryId,
        targetCharIds: [],
        enemyTargetNames: [],
        order,
        encounter,
        characters,
        getState,
        sendUpdate,
        appendLog,
        verb: effectiveVerb,
        nowSecs,
      });
    }

    // Per-enemy immunity (Disrupting Performance's 1-minute lockout) — only
    // when the check succeeded and a triggering enemy was picked.
    if (succeeded && immunityConfig && res?.enemyEntryId) {
      stampImmunity(res.enemyEntryId, {
        abilityKey:   immunityAbilityKey,
        abilityName:  ability.name,
        casterId:     character.id,
        nowSecs,
        durationSecs: immunityConfig.durationSecs,
      });
    }

    const degreeLabel = res?.degree ? (DEGREE_LABELS_SAVE[res.degree]?.label || res.degree) : null;
    appendLog({
      type:   'action',
      charId: character.id,
      text:   (res?.degree != null && res?.dc != null)
        ? `${character.name}'s ${ability.name}${res.skill ? ` (${res.skill})` : ''} vs DC ${res.dc}: ${res.total} → ${degreeLabel}`
          + (res.enemyName ? ` (${res.enemyName})` : '')
        : `${character.name} ${effectiveVerb} ${ability.name}`,
    });

    // A Composition reaction (Counter Performance) is still a cast — it
    // marks the caster playing (#935) whatever the opposed check said.
    markPlayingOnCast({ ability, caster: character, casterEntryId, encounter, sendUpdate, appendLog });

    if (effectiveCost === 'reaction') {
      spendReaction(`${verb} ${ability.name}`);
    }
    onClose();
    return true;
  };

  return { isOpposedReaction, section, resolve };
};

export default useOpposedReactionResolution;
