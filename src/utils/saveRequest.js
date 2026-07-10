import { serializeRidersForSave } from './damage';
import { resolveApplyTargets } from './applyAbility';
import { isBasicDefense } from './rollResolution';

/**
 * Confirm-time save-request payload for a target-save ability (#270,
 * extracted #1317 D3). When a damage profile exists, the caster's entered
 * total and rider snapshot travel with the request — RequestedSaves derives
 * per-degree totals GM-side. A save-outcome-gated caster-side buff (#274 —
 * Shining Guidance's Limned bonus) resolves its ally targets now and rides
 * along; RequestedSaves applies the effect on the matching save degrees.
 *
 * Pure builder: returns the addSaveRequest payload, or null when the ability
 * isn't a resolvable target-save (wrong mode, no enemy targets, no DC).
 *
 * @param {Object} ctx - { rollProfile, saveTargets, damageProfile,
 *   saveDmgInput, saveRiderState, ability, character, casterEntryId, order,
 *   saveDc, directCastRank }
 */
export const buildTargetSaveRequest = ({
  rollProfile,
  saveTargets,
  damageProfile,
  saveDmgInput,
  saveRiderState,
  ability,
  character,
  casterEntryId,
  order,
  saveDc,
  directCastRank,
}) => {
  if (!(rollProfile.mode === 'target-save' && saveTargets.length > 0 && rollProfile.dc != null)) {
    return null;
  }
  const targets = saveTargets.map((e) => ({
    entryId: e.entryId,
    name: e.name,
    saveMod: e.defenses?.saves?.[rollProfile.defense] ?? null,
  }));
  let damage;
  if (damageProfile) {
    const enteredNum = parseInt(saveDmgInput, 10);
    const savedRiders = serializeRidersForSave(damageProfile.riders, saveRiderState);
    if (!Number.isNaN(enteredNum) || savedRiders.length > 0) {
      damage = {
        entered: Number.isNaN(enteredNum) ? null : enteredNum,
        expression: damageProfile.expression ?? null,
        typeLabel: damageProfile.typeLabel ?? null,
        riders: savedRiders,
        ...(damageProfile.degrees && { degrees: damageProfile.degrees }),
      };
    }
  }
  // Save-outcome-gated caster-side buff (#274 — Shining Guidance's Limned
  // bonus): resolve the ally targets now and ride them along; RequestedSaves
  // applies the effect on the matching save degrees.
  let casterEffect;
  if (ability.saveOutcomeEffect?.effectId) {
    const soe = ability.saveOutcomeEffect;
    const resolved = resolveApplyTargets(soe.applyTo || 'self', character, [], order);
    casterEffect = {
      def: { effectId: soe.effectId, duration: soe.duration || null, onDegrees: soe.onDegrees || [] },
      targets: resolved,
      casterId: character.id,
      casterName: character.name,
      casterEntryId,
    };
  }
  return {
    casterId: character.id,
    casterName: character.name,
    abilityName: ability.name,
    save: rollProfile.defense,
    dc: saveDc,
    basic: !!(ability.basic) || isBasicDefense(ability.defense),
    rank: directCastRank,
    targets,
    ...(damage && { damage }),
    ...(casterEffect && { casterEffect }),
  };
};
