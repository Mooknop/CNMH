import { conditionalTogglesFor } from './EffectUtils';
import { offGuardAppliesTo } from '../hooks/useEnemyEffects';

/**
 * Situational-bonus toggles for the roll resolver (extracted #1317 D4).
 *
 * Conditional ('vs X') effect modifiers on the rolled attack stat become
 * opt-in toggles (#274). The stat depends on whether this is a spell attack
 * or a weapon strike.
 *
 * Off-guard (#348): an AC-attack target that is off-guard to this attacker
 * (scoped via Feint) or off-guard generally (flanking/prone) takes a −2
 * circumstance penalty to AC — surfaced as an opt-in +2 toggle, the same
 * situational-bonus pattern as #274's conditional effect modifiers. Like those
 * toggles it adjusts the roll uniformly, so it's exact for the common
 * single-target attack; the player flips it only on the off-guard target.
 * attackStat is non-null only for AC attacks (the only defense off-guard lowers).
 *
 * Armed whetstone bonus (#1216 — Chivalric Emblem): once armed against an
 * enemy, the +1 circumstance to attacks with the bound weapon surfaces as
 * an opt-in toggle (flip it when attacking that enemy); the damage side
 * rides as a per-target rider on the strike.
 */
export const buildAttackToggles = ({
  ability,
  character,
  rollProfile,
  effectiveDefense,
  resolverTargets,
  effectsFor,
  activeEffects,
  effectCatalog,
}) => {
  const attackStat = (rollProfile.mode === 'actor-roll' && effectiveDefense === 'ac')
    ? (/spell-attack/.test(rollProfile.source) ? 'spellAttack'
      : ability.type === 'ranged' ? 'rangedAttack' : 'meleeAttack')
    : null;
  const offGuardToggle = attackStat
    && offGuardAppliesTo(resolverTargets.map((t) => effectsFor(t.entryId)), character.id)
    ? [{ id: 'target-off-guard', label: 'Off-guard target', bonus: 2 }]
    : [];
  return [
    ...(attackStat ? conditionalTogglesFor(activeEffects || [], attackStat, effectCatalog) : []),
    ...offGuardToggle,
    ...(attackStat && ability.whetstoneArmedVs
      ? [{
          id: 'whetstone-armed',
          label: `${ability.whetstoneArmedVs.itemName} (vs ${ability.whetstoneArmedVs.name})`,
          bonus: ability.whetstoneArmedVs.bonus ?? 1,
        }]
      : []),
  ];
};
