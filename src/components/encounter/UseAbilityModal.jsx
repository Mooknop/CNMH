import React, { useRef, useState, useCallback } from 'react';
import Modal from '../shared/Modal';
import TargetPicker from './TargetPicker';
import TargetRollResolver, { DEGREE_LABELS_SAVE } from './TargetRollResolver';
import OpposedReactionResolver from './OpposedReactionResolver';
import MultiRayResolver from './MultiRayResolver';
import ChainedStrikeSection from './ChainedStrikeSection';
import ChainedSpellSection from './ChainedSpellSection';
import DamagePanel from './DamagePanel';
import HeightenedNotes from './HeightenedNotes';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useTargeting } from '../../hooks/useTargeting';
import { useFocusTarget } from '../../hooks/useFocusTarget';
import { useEffects } from '../../hooks/useEffects';
import { useCastingResources } from '../../hooks/useCastingResources';
import { useFrequency } from '../../hooks/useFrequency';
import { useExploitVulnerability } from '../../hooks/useExploitVulnerability';
import { useAura } from '../../hooks/useAura';
import { useOmen } from '../../hooks/useOmen';
import { useShield } from '../../hooks/useShield';
import { useEnemyEffects } from '../../hooks/useEnemyEffects';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState } from '../../hooks/useSyncedState';
import { applyAbility, applyAbilityImmunity, applyRiderChoice, abilityNeedsPicker } from '../../utils/applyAbility';
import { lingeringDurationOverride } from '../../utils/lingering';
import { isSustainedSpell, registerSustain } from '../../utils/sustain';
import { hasSpellCounter, registerSpellCounter } from '../../utils/spellCounter';
import { immunityConfigFor } from '../../utils/immunity';
import { expiryLabelSecs } from '../../utils/expiry';
import { DEFENSE_LABELS } from '../../utils/defense';
import { resolveActionRoll } from '../../utils/rollResolution';
import { SKILL_KEYS } from '../../utils/EffectUtils';
import { skillLabel } from '../../utils/victoryPoints';
import { buildDamageProfile, formatDamageBreakdown, serializeRidersForSave } from '../../utils/damage';
import { PERSISTENT_KEY, addPersistent, makeInstances, collectFromResults } from '../../utils/persistentDamage';
import { isAttackAbility, mapPenaltyFor, autoMapStep } from '../../utils/map';
import { activatesAura, requiresAura, isOverflow } from '../../utils/kineticAura';
import { HARROW_CAST_DC } from '../../utils/harrow';
import { bloodMagicTriggered, bloodMagicOption, BLOOD_MAGIC_OPTIONS } from '../../utils/bloodMagic';
import { applyHealing } from '../../utils/consumables';
import { getVariableActionRange, variantFor } from '../../utils/ActionsUtils';
import { toGameSeconds } from '../../utils/gameTime';
import { parseFrequency, freqKeyFor, lockMessage } from '../../utils/frequency';
import './UseAbilityModal.css';

// Parse "Two Actions", "One Action", "Free Action", "Reaction", "1", "2", "3"
const parseActionCost = (actionsText) => {
  if (!actionsText) return 1;
  const t = String(actionsText).toLowerCase();
  if (t.includes('free')) return 0;
  if (t.includes('reaction')) return 'reaction';
  if (t.includes('three') || t === '3') return 3;
  if (t.includes('two') || t === '2') return 2;
  if (t.includes('one') || t === '1') return 1;
  const n = parseInt(t);
  return Number.isNaN(n) ? 1 : n;
};

const costToDisplay = (ability, explicitCost) => {
  if (ability.actions) return ability.actions;
  if (explicitCost === 'reaction') return 'Reaction';
  if (explicitCost === 'free' || explicitCost === 0) return 'Free';
  if (typeof explicitCost === 'number') return String(explicitCost);
  return '?';
};

/**
 * Unified modal for using any encounter ability (action / reaction / spell).
 *
 * If the ability has structured effects[] or grants[], shows a shared TargetPicker
 * and applies them to the chosen targets on confirm. Otherwise just logs the use.
 *
 * @param {Object}        ability      - The action / spell object
 * @param {number|string} [cost]       - Explicit action cost (optional; parsed from ability.actions if omitted)
 * @param {string}        verb         - 'Cast' | 'Use' — shown in title and confirm button
 * @param {string}        [castSource] - Which list the cast started from ('slot'|'focus'|'staff'|'wand'|'scroll'|'innate')
 * @param {Object}        character    - The acting character
 * @param {string}        themeColor   - Theme colour
 */
const UseAbilityModal = ({
  isOpen,
  onClose,
  ability,
  cost: explicitCost,
  verb = 'Use',
  castSource,
  character,
  themeColor,
}) => {
  const { getState, sendUpdate } = useSession();
  const { characters, effects: effectCatalog } = useContent();
  const { gameDate, time } = useGameDate();
  const { encounter, appendLog, addSaveRequest } = useEncounter();
  const { turnState, spendActions, spendReaction, recordAttack } =
    useTurnState(character?.id || 'nobody');
  const { gateFor, record: recordFreqUse, clear: clearFreqLock } =
    useFrequency(character?.id || 'nobody');
  const { exploitFor } = useExploitVulnerability();

  const resolverRef = useRef(null);
  const chainRef    = useRef(null);
  const opposedRef  = useRef(null);

  // Opposed-reaction immunity (#226-C) — Disrupting Performance stamps a
  // self-expiring per-enemy immunity, keyed by encounter entryId.
  const { stampImmunity } = useEnemyEffects();

  // Tracks the spell-chain total cost so the confirm button label stays accurate.
  const [spellChainTotalCost, setSpellChainTotalCost] = useState(null);
  const onSpellChainCostChange = useCallback((cost) => setSpellChainTotalCost(cost), []);

  // The spell currently picked inside a chained cast (#227) — blood magic
  // triggers when it carries the bloodline flag.
  const [chainSpell, setChainSpell] = useState(null);
  const onChainSpellChange = useCallback((spell) => setChainSpell(spell), []);

  // Blood magic (#227) — Imperial: +1 status to AC or saves, caster's pick.
  const [bloodMagicChoice, setBloodMagicChoice] = useState('ac');

  // Multiple Attack Penalty — auto step from attacks already made this turn,
  // with a manual override for table corrections. null = follow the auto step.
  const [mapOverride, setMapOverride] = useState(null);

  // Variable action-cost abilities (#215): chosen action count. null = default
  // to the explicit cost picked upstream (UseActionChip) or the range minimum.
  // For per-action multi-ray spells (Blazing Bolt) this doubles as the ray count.
  const [actionCountOverride, setActionCountOverride] = useState(null);

  // Casting resources — which pool pays for the cast, and the empty-pool
  // override for table rulings. null index = default to first enabled option.
  const resources = useCastingResources(character);
  const [castOptionIdx, setCastOptionIdx] = useState(null);
  const [castOverride, setCastOverride] = useState(false);

  // Frequency gate (#218) — declarative cooldown override for table rulings.
  const [freqOverride, setFreqOverride] = useState(false);

  // Kinetic aura gate (#228) — impulses need the aura up; override for rulings.
  const aura = useAura(character?.id || 'nobody');
  const [auraOverride, setAuraOverride] = useState(false);

  // Raised-shield gate (#228) — Devoted Guardian requires the shield up.
  const charData = useCharacter(character);
  const { raised: shieldRaised } = useShield(character?.id || 'nobody', charData?.inventory || []);
  const [shieldOverride, setShieldOverride] = useState(false);

  // Harrow omen gate (#227) — omen-bound abilities (Avoid Dire Fate, Harrow
  // Casting) need an active omen; using a clearsOmen ability spends it.
  const omen = useOmen(character?.id || 'nobody');
  const [omenOverride, setOmenOverride] = useState(false);

  // Target-immunity gate (#218) — override when all picked targets are immune.
  const [immunityOverride, setImmunityOverride] = useState(false);

  // Rider choice (#225) — which either/or rider option is picked. null =
  // default to the first available option.
  const [riderChoiceId, setRiderChoiceId] = useState(null);

  // Save-based damage entry (#270): the caster's rolled total and rider
  // toggles, carried into the save request for GM-side per-degree resolution.
  const [saveDmgInput, setSaveDmgInput] = useState('');
  const [saveRiderState, setSaveRiderState] = useState({});

  // Persistent-damage tracking (#272) — confirm records per-target entries here.
  const [, setPersistentMap] = useSyncedState(PERSISTENT_KEY, {});

  // Read the actor's active conditions and effects (same sources StatsBlock uses).
  const [activeConditions] = useSyncedState(`cnmh_conditions_${character?.id || ''}`, []);
  const { effects: activeEffects } = useEffects(character?.id || '');

  const order = encounter?.order || [];

  // Pre-select the focused foe (#412) for offensive abilities so focus → resolve
  // is one tap. Gate on the ability's shape (targets a defense / Attack trait) so
  // self-buffs and no-target abilities don't auto-pick an enemy.
  const { focusEnemy } = useFocusTarget(character?.id || '');
  const offensiveShape = !!(ability && (ability.targetDefense != null || ability.traits?.includes('Attack')));
  const { targets, selectable, isTargeted, toggleTarget } =
    useTargeting(character?.id || '', order, {
      includeSelf: true,
      defaultTargetId: offensiveShape ? (focusEnemy?.entryId || null) : null,
    });

  if (!ability || !character) return null;

  const effects     = Array.isArray(ability.effects) ? ability.effects : [];
  const grants      = Array.isArray(ability.grants)  ? ability.grants  : [];
  const hasEffects  = effects.length > 0 || grants.length > 0;
  const needsPicker = abilityNeedsPicker(ability);

  const hasChainStrike = ability.chain?.into === 'strike';
  const hasChainSpell  = ability.chain?.into === 'spell';

  // Rider choice (#225): an either/or rider picked at use time (e.g. the
  // electric Eld powers' "become Charged" vs "Discharge"). Options that
  // require an active effect (requiresEffectId) are disabled until the
  // caster has it.
  const riderChoice =
    ability.riderChoice && Array.isArray(ability.riderChoice.options)
    && ability.riderChoice.options.length > 0
      ? ability.riderChoice
      : null;
  const riderAvailable = (opt) =>
    !opt.requiresEffectId
    || (activeEffects || []).some((e) => e.effectId === opt.requiresEffectId);
  const selectedRider = riderChoice
    ? (riderChoice.options.find((o) => o.id === riderChoiceId && riderAvailable(o))
        || riderChoice.options.find(riderAvailable)
        || null)
    : null;

  const effectiveCost = explicitCost !== undefined ? explicitCost : parseActionCost(ability.actions);
  const effectiveVerb = verb.toLowerCase();

  // Blood magic (#227): a bloodline-flagged spell — cast directly or as the
  // spell a Spellshape chains into — triggers the bloodline's rider.
  const bloodMagicActive = bloodMagicTriggered(
    character,
    effectiveVerb === 'cast' ? ability : null,
    hasChainSpell ? chainSpell : null
  );

  // Variable action-cost abilities (#215): the in-modal picker is authoritative
  // for the spend. Reactions/free actions and chained abilities (which own their
  // own total-cost arithmetic) opt out.
  const variableRange =
    (effectiveCost === 'reaction' || effectiveCost === 'free' || hasChainSpell || hasChainStrike)
      ? null
      : getVariableActionRange(ability);
  // An explicit numeric cost picked upstream (UseActionChip dropdown) seeds the
  // picker but stays changeable here.
  const seedCount = (variableRange
    && typeof explicitCost === 'number'
    && explicitCost >= variableRange.min
    && explicitCost <= variableRange.max)
    ? explicitCost
    : variableRange?.min;
  const chosenActions = variableRange
    ? Math.min(Math.max(actionCountOverride ?? seedCount, variableRange.min), variableRange.max)
    : null;
  // The declared consequence of the chosen count (scaling note, DC change).
  const variant = variableRange ? variantFor(ability, chosenActions) : null;

  // Multi-ray attack spells fire one attack roll per ray. `rolls: 'per-action'` makes
  // the ray count = chosen action count (variable, e.g. Blazing Bolt 1–3); `rollCount: N`
  // is a fixed multi-ray count. The count drives the number of resolver rows.
  const perActionRange = ability.rolls === 'per-action' ? variableRange : null;
  const fixedRayCount  = (typeof ability.rollCount === 'number' && ability.rollCount > 1) ? ability.rollCount : null;
  const isMultiRay     = perActionRange != null || fixedRayCount != null;
  const rayCount = perActionRange ? chosenActions : (fixedRayCount ?? 1);
  const castCost = variableRange ? chosenActions : effectiveCost;

  // Casting-cost options (slot rank / focus / staff charges / wand / scroll).
  // Only casts pay a resource; plain actions get an empty list and no section.
  const castOptions = effectiveVerb === 'cast' ? resources.optionsFor(ability, castSource) : [];
  const defaultCastIdx = Math.max(0, castOptions.findIndex((o) => o.enabled));
  const selectedCastIdx = castOptionIdx ?? defaultCastIdx;
  const selectedCastOption = castOptions[selectedCastIdx] || null;
  // Free options (cantrip/innate) need no picker UI — just a muted cost line.
  const castIsFree = castOptions.length === 1
    && (castOptions[0].type === 'cantrip' || castOptions[0].type === 'innate');
  // For spell chains the total cost = parent + chosen spell; use it in the button once known.
  const confirmCost   = (hasChainSpell && spellChainTotalCost != null) ? spellChainTotalCost : effectiveCost;
  // Variable-cost abilities show the chosen numeric count; spell-chain total is numeric
  // too (bypass costToDisplay, which would show ability.actions instead).
  const costDisplay   = variableRange != null
    ? String(chosenActions)
    : (hasChainSpell && typeof confirmCost === 'number')
      ? String(confirmCost)
      : costToDisplay(ability, confirmCost);

  const casterEntry    = order.find((e) => e.kind === 'pc' && e.charId === character.id);
  const casterEntryId  = casterEntry?.entryId || null;

  // Frequency gate — availability derived from the synced ledger vs the game
  // clock and the live encounter round/turn (#218). Advancing either clock
  // re-enables locked abilities; nothing is timer-driven.
  const nowSecs  = toGameSeconds({ ...gameDate, ...time });
  const freqRule = parseFrequency(ability);
  const freqCtx  = { nowSecs, encounter, casterEntryId };
  const freqGate = freqRule
    ? gateFor(ability, freqCtx)
    : { available: true };
  const freqGateOk = freqGate.available || freqOverride;

  const selectedEntries  = order.filter((e) => targets.includes(e.entryId));
  const targetCharIds    = selectedEntries.filter((e) => e.kind === 'pc' && e.charId).map((e) => e.charId);
  const enemyTargetNames = selectedEntries.filter((e) => e.kind === 'enemy').map((e) => e.name);

  // Target immunity (#218): for abilities that confer immunity (Guidance,
  // Battle Medicine, …), flag picked PC targets already immune. The use is
  // blocked only when every picked target is immune (override available).
  const immunityConfig = immunityConfigFor(ability);
  // `immunityKey` lets variants share one immunity pool (#228 — Murmured
  // Prayer's 1/day +2 Guidance is still "Guidance" for the 1-hour immunity).
  const immunityAbilityKey = ability.immunityKey || freqKeyFor(ability);
  const immuneTargets = immunityConfig
    ? targetCharIds
        .map((cid) => {
          const tEffects = getState(cid, 'effects') || [];
          const immune = tEffects.find(
            (e) => e.effectId === 'ability-immunity'
              && e.abilityKey === immunityAbilityKey
              && (immunityConfig.scope !== 'per-caster' || e.appliedBy === character.id)
              && !(typeof e.expireAtSecs === 'number' && e.expireAtSecs <= nowSecs)
          );
          return immune
            ? {
                charId: cid,
                name: characters.find((c) => c.id === cid)?.name || cid,
                expireAtSecs: immune.expireAtSecs,
              }
            : null;
        })
        .filter(Boolean)
    : [];
  const allTargetsImmune =
    !!immunityConfig && targetCharIds.length > 0 && immuneTargets.length === targetCharIds.length;
  const immunityGateOk = !allTargetsImmune || immunityOverride;

  // Enemy targets with defense data — used by both the regular resolver and the chain section.
  const enemyWithDefenses = selectedEntries.filter((e) => e.kind === 'enemy' && e.defenses);

  // Multiple Attack Penalty step: attacks already made this turn, or the override.
  // A reaction Strike fires off-turn (AoO, Retributive Strike) so its MAP starts
  // at 0 rather than the stale attacksMade from the player's last turn (#475).
  const isAttack = isAttackAbility(ability);
  const autoStep = autoMapStep({
    isReaction: explicitCost === 'reaction',
    attacksMade: turnState?.attacksMade ?? 0,
  });
  const mapStep  = mapOverride ?? autoStep;

  // Resolve roll profile — includes condition/effect netting for the actor.
  const rollProfile = resolveActionRoll(ability, character, {
    conditions: activeConditions || [],
    effects: activeEffects || [],
    effectCatalog,
    mapStep,
  });

  // Save DC with the chosen variant's adjustment applied (#215) — e.g. spending
  // 2 actions on Staunch Bleeding lowers the DC by 10.
  const saveDc = rollProfile.dc != null ? rollProfile.dc + (variant?.dcDelta ?? 0) : rollProfile.dc;

  // Opposed reaction (#226-C): a reaction-cost ability whose roll config carries
  // `opposed: true`. It resolves the actor's skill total (already in
  // rollProfile.bonus) against a GM-called DC the player relays, not a target's
  // defense — so it bypasses the defense-driven resolver entirely.
  const isOpposedReaction = ability.roll?.opposed === true;
  const enemyOptions = isOpposedReaction ? order.filter((e) => e.kind === 'enemy') : [];
  const opposedSkillLabel = rollProfile.skill ? skillLabel(rollProfile.skill) : null;

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
          { conditions: activeConditions || [], effects: activeEffects || [], effectCatalog, mapStep },
        );
        return { skill, label: skillLabel(skill), bonus: p.bonus };
      })
    : null;

  // Which defense to show on the resolver (actor-roll only).
  const effectiveDefense = rollProfile.mode === 'actor-roll'
    ? rollProfile.defense
    : (ability.targetDefense || (ability.traits?.includes('Attack') ? 'ac' : null));

  // Enemy targets that have defense data and a resolvable defense (actor-roll path only).
  const resolverTargets = (rollProfile.mode === 'actor-roll' && effectiveDefense)
    ? enemyWithDefenses
    : [];

  // The rank this cast happens at (#235): the chosen slot option's rank, or
  // the spell's native rank for free/focus casts. Non-spell actions: none.
  const directCastRank = selectedCastOption?.rank
    ?? (effectiveVerb === 'cast' && typeof ability.level === 'number' && ability.level > 0
      ? ability.level
      : undefined);

  // For target-save: enemy targets whose save mod we can read (used in the save request).
  const saveTargets = rollProfile.mode === 'target-save'
    ? selectedEntries.filter((e) => e.kind === 'enemy')
    : [];

  // Damage step (#222) — AC attacks resolved inline (single-roll and multi-ray;
  // chained strikes build their own per-strike profile) and basic-save abilities
  // (#270), where the caster enters the total here and the GM derives per-degree
  // damage in RequestedSaves. The profile carries the dice hint (heightened at
  // the cast rank) plus rider toggles, including the actor's active exploit
  // weakness. The chosen action-count variant or rider option may override the
  // dice (#268 — Blazing Bolt, Polarize's Discharge).
  const isSaveDamage = rollProfile.mode === 'target-save' && saveTargets.length > 0;
  const damageProfile = ((rollProfile.mode === 'actor-roll'
    && effectiveDefense === 'ac'
    && resolverTargets.length > 0) || isSaveDamage)
    ? buildDamageProfile(ability, character, {
        chosenActions: typeof castCost === 'number' ? castCost : null,
        castRank: directCastRank,
        exploit: exploitFor(character.id),
        enemyEntries: isSaveDamage ? saveTargets : resolverTargets,
        order,
        damageOverride: variant?.damage ?? selectedRider?.damage ?? null,
      })
    : null;

  // Block the cast while the chosen pool is empty, unless overridden.
  const castGateOk =
    castOptions.length === 0 || selectedCastOption?.enabled || castOverride;

  // Kinetic aura gate (#228): impulses are unusable while the aura is down.
  // Channel Elements itself activates (no Impulse trait), so it never blocks.
  const auraGateBlocked = requiresAura(ability) && !aura.active;
  const auraGateOk = !auraGateBlocked || auraOverride;

  // Raised-shield gate (#228): Devoted Guardian and kin need the shield up.
  const shieldGateBlocked = ability.requiresShieldRaised === true && !shieldRaised;
  const shieldGateOk = !shieldGateBlocked || shieldOverride;

  // Harrow omen gate (#227): omen-bound abilities need an active omen.
  const omenGateBlocked = ability.requiresOmen === true && !omen.suit;
  const omenGateOk = !omenGateBlocked || omenOverride;
  // Abilities that interact with the omen surface its current suit.
  const showsOmen = ability.requiresOmen === true || ability.clearsOmen === true;

  // Ally resistance note (#228 — Retributive Strike's "2 + your level").
  const allyResistance = ability.allyResistance
    ? (Number(ability.allyResistance.base) || 0)
      + (ability.allyResistance.addLevel ? (character.level || 0) : 0)
    : null;

  const confirmEnabled =
    (!needsPicker || targets.length > 0)
    && castGateOk && freqGateOk && immunityGateOk && auraGateOk && shieldGateOk && omenGateOk;

  const charName = (charId) => characters.find((c) => c.id === charId)?.name || charId;

  const handleConfirm = () => {
    // Foundry-authoritative buffs (#455): when the ability's foundryEffect is
    // flagged `authoritative` AND the Foundry bridge is connected (its roster is
    // present), let Foundry's aura engine own the effect — the app skips its own
    // structured-effect writes and instead mirrors the result via the
    // cnmh_foundryeffects read-back. With no bridge, the authored effects[] (e.g.
    // Inspire Courage's all-allies fallback) apply as before.
    const bridgePresent = (getState('global', 'roster') || []).length > 0;
    const foundryAuthoritative = !!ability.foundryEffect?.authoritative && bridgePresent;

    // Opposed reaction (#226-C) — its own resolution path. The actor's skill
    // roll is compared to the GM-called DC; the authored self effect and any
    // per-enemy immunity land only on a success. Returns early so none of the
    // target-defense / save-request / MAP machinery below ever runs for it.
    if (isOpposedReaction) {
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

      if (effectiveCost === 'reaction') {
        spendReaction(`${verb} ${ability.name}`);
      }
      onClose();
      return;
    }

    const rawResults   = resolverRef.current?.getResults() ?? null;
    const chainResults = chainRef.current?.getResults() ?? null;

    // Normalise resolver output into ray groups so single-roll and multi-ray casts
    // share one logging path. Single-roll returns a flat result array → one group
    // with rayIndex null (no "ray N" prefix). Multi-ray returns [{ rayIndex, results }].
    const isMultiRayResult = isMultiRay && rollProfile.mode === 'actor-roll';
    const rayGroups = !rawResults
      ? []
      : isMultiRayResult
        ? rawResults
        : (rawResults.length ? [{ rayIndex: null, results: rawResults }] : []);

    // Spend the casting resource (slot/focus/staff/wand/scroll). The empty-pool
    // override casts without decrementing — the manual pips stay the
    // remediation surface and pools never go negative.
    let sourceSuffix = '';
    if (selectedCastOption) {
      if (selectedCastOption.enabled) {
        const { label } = resources.spend(selectedCastOption);
        if (label) sourceSuffix = ` (${label})`;
      } else if (castOverride) {
        sourceSuffix = ' (override — no resource spent)';
      }
    }
    // Frequency: record the use either way — under an override the use still
    // happened, it just bypassed the lock (and the log says so).
    if (freqRule) {
      recordFreqUse(ability, freqCtx);
      if (!freqGate.available && freqOverride) {
        sourceSuffix += ' (override — frequency)';
      }
    }
    // Kinetic aura (#228): activating abilities switch it on; overflow
    // impulses burn it out on use.
    if (activatesAura(ability) && !aura.active) {
      aura.activate();
      appendLog({
        type:   'action',
        charId: character.id,
        text:   `${character.name}'s kinetic aura activates`,
      });
    } else if (isOverflow(ability) && aura.active) {
      aura.deactivate();
      appendLog({
        type:   'action',
        charId: character.id,
        text:   `${character.name}'s kinetic aura deactivates (overflow)`,
      });
    }
    if (auraGateBlocked && auraOverride) {
      sourceSuffix += ' (override — aura inactive)';
    }
    if (shieldGateBlocked && shieldOverride) {
      sourceSuffix += ' (override — shield not raised)';
    }
    if (omenGateBlocked && omenOverride) {
      sourceSuffix += ' (override — no active omen)';
    }
    // Harrow omen (#227): clearsOmen abilities spend the active omen.
    if (ability.clearsOmen === true && omen.suit) {
      appendLog({
        type:   'action',
        charId: character.id,
        text:   `${character.name}'s harrow omen (${omen.suit}) is spent (${ability.name})`,
      });
      omen.clear();
    }
    // Ally resistance (#228): the GM applies it to the triggering damage.
    if (allyResistance != null) {
      appendLog({
        type:   'action',
        charId: character.id,
        text:   `${character.name}'s ally gains resistance ${allyResistance} against the triggering damage (${ability.name})`,
      });
    }
    let suffixLogged = false;

    // Entry IDs of enemies whose result has a degree (they get a dedicated log line).
    const coveredByRoll = new Set(
      rayGroups.flatMap((g) => g.results.filter((r) => r.degree != null).map((r) => r.entryId))
    );

    // Stamp clock-expiring immunity on picked PC targets (Guidance, Tell
    // Fortune, …). Independent of effects[]; idempotent on already-immune.
    if (immunityConfig) {
      applyAbilityImmunity({
        ability,
        caster: character,
        targetCharIds,
        nowSecs,
        getState,
        sendUpdate,
      });
    }

    // Sustained spells (#220) — register on the caster's ledger so the turn
    // tracker can prompt "Sustain a Spell" each turn. Only in an active
    // encounter, where turn-start prompts exist.
    if (isSustainedSpell(ability) && encounter?.phase === 'in-progress' && casterEntryId) {
      registerSustain({
        ability,
        caster: character,
        round: encounter.round,
        castRank: directCastRank,
        // Foundry-authoritative aura (#455): carry the effect ref so each Sustain
        // re-clones it onto the caster and PF2e re-evaluates aura membership.
        foundryAura: (foundryAuthoritative && ability.foundryEffect?.ref)
          ? { ref: ability.foundryEffect.ref, casterEntryId }
          : undefined,
        getState,
        sendUpdate,
        appendLog,
      });
    }

    // Per-spell counters (#220) — Mirror Image images, Bless emanation radius.
    // Not turn-bound, so registered on any cast (the EffectsPanel surfaces them).
    if (hasSpellCounter(ability)) {
      registerSpellCounter({
        ability,
        caster: character,
        round: encounter?.round,
        getState,
        sendUpdate,
      });
    }

    // Rider choice (#225) — apply/remove the chosen rider's caster-scoped
    // effect (e.g. gain eld-charged, or Discharge to consume it).
    if (selectedRider) {
      applyRiderChoice({
        option: selectedRider,
        ability,
        caster: character,
        casterEntryId,
        encounter,
        nowSecs,
        getState,
        sendUpdate,
        appendLog,
      });
    }

    if (hasEffects) {
      // Lingering Composition (#226-B): a pending extension on the caster
      // lengthens this composition's effect, then is consumed.
      const lingering = getState(character.id, 'lingering');
      const effectDurationOverride = lingeringDurationOverride(ability, lingering) || undefined;

      applyAbility({
        ability,
        caster: character,
        casterEntryId,
        targetCharIds,
        enemyTargetNames,
        order,
        encounter,
        characters,
        getState,
        sendUpdate,
        appendLog,
        verb: effectiveVerb,
        // Only when heightened above native — native casts keep their log
        // text, and cantrips (auto-heightened, #271) never decorate it.
        rank: (typeof ability.level === 'number' && ability.level > 0
          && directCastRank > ability.level) ? directCastRank : undefined,
        nowSecs,
        effectDurationOverride,
        suppressStructuredEffects: foundryAuthoritative,
      });

      if (effectDurationOverride) {
        try { window.localStorage.setItem(`cnmh_lingering_${character.id}`, JSON.stringify(null)); } catch { /* noop */ }
        sendUpdate(character.id, 'lingering', null);
        appendLog({
          type: 'action',
          charId: character.id,
          text: `${character.name}'s ${ability.name} is extended to ${effectDurationOverride.rounds} rounds (Lingering Composition)`,
        });
      }
    } else {
      // Generic action log — omit enemies whose roll result will be logged below.
      const genericNames = [
        ...targetCharIds.map(charName),
        ...selectedEntries
          .filter((e) => e.kind === 'enemy' && !coveredByRoll.has(e.entryId))
          .map((e) => e.name),
      ].join(', ');
      if (genericNames || coveredByRoll.size === 0) {
        appendLog({
          type:   'action',
          charId: character.id,
          text:   (genericNames
            ? `${character.name} ${effectiveVerb} ${ability.name} on ${genericNames}`
            : `${character.name} ${effectiveVerb} ${ability.name}`) + sourceSuffix,
        });
        suffixLogged = !!sourceSuffix;
      }
    }

    if (rayGroups.length) {
      const defLabel = DEFENSE_LABELS[effectiveDefense] || effectiveDefense;
      const degreeMap = effectiveDefense === 'ac'
        ? { criticalSuccess: 'Critical Hit', success: 'Hit', failure: 'Miss', criticalFailure: 'Critical Miss' }
        : { criticalSuccess: 'Critical Success', success: 'Success', failure: 'Failure', criticalFailure: 'Critical Failure' };
      rayGroups.forEach((g) => {
        const rayPrefix = g.rayIndex != null ? ` — ray ${g.rayIndex + 1}` : '';
        g.results.forEach((r) => {
          if (!r.degree) return;
          const degreeLabel = degreeMap[r.degree] || r.degree;
          // Damage step result (#222): per-target total with the rider breakdown.
          const dmgSuffix = r.damage?.final != null
            ? ` · damage ${formatDamageBreakdown(r.damage)}`
            : '';
          appendLog({
            type:   'action',
            charId: character.id,
            text:   `${character.name} ${effectiveVerb} ${ability.name}${rayPrefix} vs ${r.name} (${defLabel} ${r.dc}): ${r.total} → ${degreeLabel}${dmgSuffix}`,
          });
        });
      });
    }

    // Log chained strike results (Inner Upheaval and similar). Results with a
    // resolved damage entry log the real per-target total (#222); the static
    // dice string stays as the fallback when no total was entered.
    if (chainResults && hasChainStrike) {
      const strikeLabel = chainResults.mode === 'flurry' ? 'Flurry of Blows' : chainResults.strikeName;
      chainResults.rolls.forEach((rollSet, rollIdx) => {
        if (!rollSet) return;
        const strikeNum = chainResults.mode === 'flurry' ? ` (${rollIdx + 1})` : '';
        rollSet.forEach((r) => {
          const degreeLabel = r.degree
            ? ({ criticalSuccess: 'Critical Hit', success: 'Hit', failure: 'Miss', criticalFailure: 'Critical Miss' }[r.degree] || r.degree)
            : null;
          const dmgText = r.damage?.final != null
            ? ` · damage ${formatDamageBreakdown(r.damage)}`
            : ` · dmg ${chainResults.damage}`;
          const resultText = degreeLabel
            ? `${character.name} ${effectiveVerb} ${ability.name} — ${strikeLabel}${strikeNum} vs ${r.name} (AC ${r.dc}): ${r.total} → ${degreeLabel}${dmgText}`
            : `${character.name} ${effectiveVerb} ${ability.name} — ${strikeLabel}${strikeNum}${dmgText}`;
          appendLog({ type: 'action', charId: character.id, text: resultText });
        });
        if (!rollSet.length) {
          appendLog({ type: 'action', charId: character.id, text: `${character.name} ${effectiveVerb} ${ability.name} — ${strikeLabel}${strikeNum} · dmg ${chainResults.damage}` });
        }
      });

      // Flurry of Blows combines its damage before resistances/weaknesses —
      // log the per-target sum when both strikes resolved damage on one target.
      if (chainResults.mode === 'flurry') {
        const sums = new Map();
        chainResults.rolls.forEach((rollSet) => {
          (rollSet || []).forEach((r) => {
            if (r.damage?.final == null) return;
            const cur = sums.get(r.entryId) || { name: r.name, total: 0, count: 0 };
            cur.total += r.damage.final;
            cur.count += 1;
            sums.set(r.entryId, cur);
          });
        });
        sums.forEach((s) => {
          if (s.count > 1) {
            appendLog({
              type:   'action',
              charId: character.id,
              text:   `Flurry of Blows combined vs ${s.name}: ${s.total} damage (apply resistance/weakness once)`,
            });
          }
        });
      }
    }

    // Persistent-damage tracking (#272): record each target's persistent
    // entries (already crit-doubled by computeTargetDamage) so the turn
    // tracker chips them and the watcher reminds at their turn end.
    const persistentHits = collectFromResults(rayGroups, hasChainStrike ? chainResults : null);
    if (persistentHits.length) {
      setPersistentMap((m) => persistentHits.reduce(
        (acc, h) => addPersistent(acc, h.entryId, makeInstances(h.persistent, ability.name)),
        m || {}
      ));
    }

    // Push a save request to the GM for target-save abilities. When a damage
    // profile exists (#270), the caster's entered total and rider snapshot
    // travel with it — RequestedSaves derives per-degree totals GM-side.
    if (rollProfile.mode === 'target-save' && saveTargets.length > 0 && rollProfile.dc != null) {
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
          };
        }
      }
      addSaveRequest({
        casterId: character.id,
        casterName: character.name,
        abilityName: ability.name,
        save: rollProfile.defense,
        dc: saveDc,
        basic: !!(ability.basic),
        rank: directCastRank,
        targets,
        ...(damage && { damage }),
      });
    }

    // Log chained spell results (Reach Spell, Harrow Casting, etc.).
    if (hasChainSpell && chainResults) {
      // Chained casts spend the option the section picked (#235) — signature
      // spells can heighten, cantrips stay free. Sections rendered without the
      // resources prop report no option; fall back to the native-rank spend.
      let chainSuffix = '';
      if (chainResults.castOption) {
        if (chainResults.castOption.enabled) {
          const { label } = resources.spend(chainResults.castOption);
          if (label) chainSuffix = ` (${label})`;
        } else {
          chainSuffix = ` (no rank-${chainResults.castRank} slots left — not spent)`;
        }
      } else if (chainResults.spellRank > 0) {
        if (resources.slots.remainingFor(chainResults.spellRank) > 0) {
          resources.slots.spend(chainResults.spellRank);
          chainSuffix = ` (rank ${chainResults.spellRank} slot)`;
        } else {
          chainSuffix = ` (no rank-${chainResults.spellRank} slots left — not spent)`;
        }
      }
      const label = (chainResults.modifier
        ? `${chainResults.spellName} [${chainResults.modifier}]`
        : chainResults.spellName) + chainSuffix;
      if (chainResults.rollResults) {
        // Attack-roll chains read as hits/misses; everything else keeps
        // success/failure wording.
        const chainDegreeMap = chainResults.rollProfile?.defense === 'ac'
          ? { criticalSuccess: 'Critical Hit', success: 'Hit', failure: 'Miss', criticalFailure: 'Critical Miss' }
          : { criticalSuccess: 'Critical Success', success: 'Success', failure: 'Failure', criticalFailure: 'Critical Failure' };
        chainResults.rollResults.forEach((r) => {
          const degreeLabel = r.degree ? (chainDegreeMap[r.degree] || r.degree) : null;
          // Split Shot (#227): the designated second target takes half damage.
          const splitSuffix = chainResults.splitShot?.secondaryEntryId === r.entryId
            ? ' · second target — half damage, no other effects'
            : '';
          appendLog({
            type: 'action', charId: character.id,
            text: degreeLabel
              ? `${character.name} ${effectiveVerb} ${ability.name} → ${label} vs ${r.name}: ${r.total} → ${degreeLabel}${splitSuffix}`
              : `${character.name} ${effectiveVerb} ${ability.name} → ${label}`,
          });
        });
      } else {
        appendLog({
          type: 'action', charId: character.id,
          text: `${character.name} ${effectiveVerb} ${ability.name} → ${label}`,
        });
      }
      // Push save request for the chained spell if it's target-save.
      if (chainResults.rollProfile?.mode === 'target-save'
          && chainResults.saveTargets?.length > 0
          && chainResults.rollProfile.dc != null) {
        addSaveRequest({
          casterId: character.id, casterName: character.name,
          abilityName: `${ability.name} → ${chainResults.spellName}`,
          save: chainResults.rollProfile.defense,
          dc: chainResults.rollProfile.dc,
          basic: false,
          rank: chainResults.castRank > 0 ? chainResults.castRank : undefined,
          targets: chainResults.saveTargets.map((e) => ({
            entryId: e.entryId, name: e.name,
            saveMod: e.defenses?.saves?.[chainResults.rollProfile.defense] ?? null,
          })),
        });
      }

      // Harrow Casting (#227): the drawn card, the flat check, and the suit's
      // mechanics. Key/Star effects are real catalog entries (until the start
      // of the caster's next turn); Shields/Stars healing is player-rolled;
      // Hammers stays a manual rider note until chained-spell damage (#281).
      const hc = chainResults.harrow;
      if (hc?.drawnSuit) {
        const flatText = hc.flatD20 != null
          ? ` — flat check DC ${HARROW_CAST_DC}: ${hc.flatD20} (${hc.flatPassed ? 'passed' : 'failed'})`
          : '';
        appendLog({
          type:   'action',
          charId: character.id,
          text:   `${character.name} draws ${hc.drawnSuit}${hc.match ? ' — omen match!' : ''}${flatText}`,
        });
        if (hc.flatPassed === false) {
          omen.flagPendingLoss();
          appendLog({
            type: 'system',
            text: `${character.name}'s harrow omen (${omen.suit || '—'}) will be lost at the end of their turn (failed Harrow Cast flat check)`,
          });
        }
        const heff = hc.effect;
        if (heff?.kind === 'self-effect') {
          applyAbility({
            ability: { name: `Harrow Casting — ${hc.drawnSuit}`, effects: [{ effectId: heff.effectId, applyTo: 'self', duration: { until: 'caster-turn-start' } }] },
            caster: character, casterEntryId, targetCharIds: [], enemyTargetNames: [],
            order, encounter, characters, getState, sendUpdate, appendLog,
            verb: 'gains', nowSecs,
          });
        } else if (heff?.kind === 'self-heal') {
          if (hc.healEntered != null) {
            applyHealing({
              target: character, amount: hc.healEntered, getState, sendUpdate, appendLog,
              logText: `${character.name} healed ${hc.healEntered} HP (Harrow Casting — ${hc.drawnSuit})`,
            });
          } else {
            appendLog({ type: 'system', text: `${character.name} — ${hc.drawnSuit}: ${heff.note}` });
          }
        } else if (heff?.kind === 'target-heal') {
          const healTargetId = targetCharIds[0] || null;
          const healTarget = healTargetId ? characters.find((c) => c.id === healTargetId) : null;
          if (hc.healEntered != null && healTarget) {
            applyHealing({
              target: healTarget, amount: hc.healEntered, getState, sendUpdate, appendLog,
              logText: `${healTarget.name} healed ${hc.healEntered} HP (Harrow Casting — ${hc.drawnSuit})`,
            });
          } else {
            appendLog({ type: 'system', text: `${character.name} — ${hc.drawnSuit}: ${heff.note}` });
          }
          if (heff.effectId && healTargetId) {
            applyAbility({
              ability: { name: `Harrow Casting — ${hc.drawnSuit}`, effects: [{ effectId: heff.effectId, applyTo: 'ally', duration: { until: 'caster-turn-start' } }] },
              caster: character, casterEntryId, targetCharIds: [healTargetId], enemyTargetNames: [],
              order, encounter, characters, getState, sendUpdate, appendLog,
              verb: 'grants', nowSecs,
            });
          }
        } else if (heff) {
          appendLog({ type: 'system', text: `${character.name} — ${hc.drawnSuit}: ${heff.note}` });
        }
      }
    }

    // Blood magic (#227): the bloodline rider lands on the caster as a catalog
    // effect until the start of their next turn. Re-derived from chainResults
    // (not the live chainSpell state) so confirm matches what was actually cast.
    const bloodMagicFires = bloodMagicTriggered(
      character,
      effectiveVerb === 'cast' ? ability : null,
      hasChainSpell && chainResults?.spellBloodline ? { bloodline: true } : null
    );
    if (bloodMagicFires) {
      const bmOption = bloodMagicOption(bloodMagicChoice);
      applyAbility({
        ability: {
          name: `Blood Magic (${character.spellcasting.bloodline.name || 'bloodline'})`,
          effects: [{ effectId: bmOption.effectId, applyTo: 'self', duration: { until: 'caster-turn-start' } }],
        },
        caster: character, casterEntryId, targetCharIds: [], enemyTargetNames: [],
        order, encounter, characters, getState, sendUpdate, appendLog,
        verb: 'gains', nowSecs,
      });
    }

    // Resource suffix not carried by a line above (effects/roll paths) gets a
    // dedicated entry so the log always shows what paid for the cast.
    if (sourceSuffix && !suffixLogged) {
      appendLog({
        type:   'action',
        charId: character.id,
        text:   `${character.name} ${effectiveVerb} ${ability.name}${sourceSuffix}`,
      });
    }

    const costToSpend = hasChainSpell && chainResults?.totalCost != null
      ? chainResults.totalCost
      : castCost;
    if (costToSpend === 'reaction') {
      spendReaction(`${verb} ${ability.name}`);
    } else if (costToSpend > 0) {
      spendActions(costToSpend, `${verb} ${ability.name}`);
    }

    // Count attacks for MAP. Multi-roll casts (flurry, multi-ray) increment once
    // per attack but only after the whole activity — i.e. here, on confirm. Each
    // Blazing Bolt ray is its own attack, so a 3-ray cast raises MAP by 3.
    if (hasChainStrike && chainResults) {
      recordAttack(chainResults.mode === 'flurry' ? 2 : 1);
    } else if (hasChainSpell && chainResults?.isAttackSpell) {
      recordAttack(1);
    } else if (isMultiRay && isAttack) {
      recordAttack(rayCount);
    } else if (isAttack) {
      recordAttack(1);
    }

    onClose();
  };

  const staticEffects = effects.filter(
    (e) => e.applyTo === 'self' || e.applyTo === 'all-allies'
  );

  // MAP toggle — shown for Attack-trait abilities with an inline resolver, and for
  // strike chains (the child section applies the step to both strikes).
  const showMapToggle =
    (isAttack && rollProfile.mode === 'actor-roll' && resolverTargets.length > 0) || hasChainStrike;
  const mapSection = showMapToggle ? (
    <div className="uam-map-row" role="group" aria-label="Multiple Attack Penalty">
      <span className="uam-map-label">MAP</span>
      {[0, 1, 2].map((step) => (
        <button
          key={step}
          type="button"
          className={`uam-map-btn${mapStep === step ? ' uam-map-btn--active' : ''}`}
          aria-pressed={mapStep === step}
          onClick={() => setMapOverride(step === autoStep ? null : step)}
        >
          {step === 0 ? '0' : `${mapPenaltyFor(ability, step)}`}
          {step === autoStep ? ' (auto)' : ''}
        </button>
      ))}
    </div>
  ) : null;

  // Action-count picker for variable-cost abilities (#215): Force Barrage 1–3,
  // Elemental Blast 1–2, per-action multi-ray spells (Blazing Bolt). Each button
  // carries its variant note as a tooltip; the chosen variant's note renders below.
  const actionsSelector = (variableRange && variableRange.max > variableRange.min) ? (
    <>
      <div className="uam-actions-row" role="radiogroup" aria-label="Number of actions">
        <span className="uam-actions-label">Actions</span>
        {Array.from(
          { length: variableRange.max - variableRange.min + 1 },
          (_, k) => variableRange.min + k
        ).map((n) => (
          <button
            key={n}
            type="button"
            className={`uam-actions-btn${chosenActions === n ? ' uam-actions-btn--active' : ''}`}
            aria-pressed={chosenActions === n}
            title={variantFor(ability, n)?.note || undefined}
            onClick={() => setActionCountOverride(n)}
          >
            {n}
          </button>
        ))}
      </div>
      {variant?.note && <div className="uam-variant-note">{variant.note}</div>}
    </>
  ) : null;

  // Opposed-reaction resolver (#226-C) — DC entry + optional enemy picker + the
  // actor's skill roll. Replaces the defense-driven roll section for these.
  const opposedSection = isOpposedReaction ? (
    <OpposedReactionResolver
      ref={opposedRef}
      rollBonus={rollProfile.bonus}
      enemyOptions={enemyOptions}
      skillLabel={opposedSkillLabel}
      skillOptions={opposedSkillOptions}
      defaultSkill={ability.roll?.skill || 'performance'}
      successNote={ability.roll?.successNote || null}
    />
  ) : null;

  // The roll resolution section: inline resolver (actor-roll) or save-request info (target-save).
  // Multi-ray attack spells render one resolver row per ray instead of a single roll.
  let rollSection = null;
  if (rollProfile.mode === 'actor-roll' && resolverTargets.length > 0) {
    rollSection = isMultiRay ? (
      <MultiRayResolver
        ref={resolverRef}
        rayCount={rayCount}
        enemyTargets={resolverTargets}
        targetDefense={effectiveDefense}
        rollBonus={rollProfile.bonus}
        damage={damageProfile}
        degrees={ability.degrees}
      />
    ) : (
      <TargetRollResolver
        ref={resolverRef}
        enemyTargets={resolverTargets}
        targetDefense={effectiveDefense}
        rollBonus={rollProfile.bonus}
        damage={damageProfile}
        degrees={ability.degrees}
      />
    );
  } else if (rollProfile.mode === 'target-save' && saveTargets.length > 0) {
    const saveLabel = DEFENSE_LABELS[rollProfile.defense] || rollProfile.defense;
    rollSection = (
      <>
        <div className="ct-save-request-preview" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          <strong>Save request → GM:</strong> {saveLabel} DC {saveDc}
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
            {saveTargets.map((e) => (
              <li key={e.entryId}>{e.name}</li>
            ))}
          </ul>
        </div>
        {damageProfile && (
          <DamagePanel
            mode="save"
            profile={damageProfile}
            entered={saveDmgInput}
            onEntered={setSaveDmgInput}
            riderState={saveRiderState}
            onToggleRider={(id, on) => setSaveRiderState((cur) => ({ ...cur, [id]: on }))}
          />
        )}
      </>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${verb}: ${ability.name}`}
      themeColor={themeColor}
      maxWidth="560px"
      placement="bottom"
      highZ
    >
      {/* Ability summary */}
      <section className="ct-section">
        <div style={{ marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          {ability.actions && <span>Actions: {ability.actions} · </span>}
          {ability.range   && <span>Range: {ability.range} · </span>}
          {ability.targets && <span>Targets: {ability.targets}</span>}
        </div>
        {ability.description && (
          <p style={{ fontSize: '0.85rem', margin: '0 0 0.25rem', color: 'var(--color-text-muted)' }}>
            {ability.description}
          </p>
        )}
        {allyResistance != null && (
          <p className="uam-ally-resistance" style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
            Ally gains resistance {allyResistance} against the triggering damage.
          </p>
        )}
        {showsOmen && (
          <p className="uam-omen-line" style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
            Active harrow omen: {omen.suit || 'none'}
            {ability.clearsOmen === true && omen.suit ? ' — spent on use' : ''}
          </p>
        )}
        {actionsSelector}
      </section>

      {/* Frequency lock — derived from the synced ledger; GM can override or clear */}
      {freqRule && !freqGate.available && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Frequency</h3>
            <div className="uam-cost-empty">{lockMessage(freqGate, freqRule, nowSecs)}</div>
            <label className="uam-cost-override">
              <input
                type="checkbox"
                checked={freqOverride}
                onChange={(e) => setFreqOverride(e.target.checked)}
              />
              Override (GM ruling) — use anyway
            </label>
            <button
              type="button"
              className="uam-freq-clear"
              onClick={() => clearFreqLock(freqKeyFor(ability))}
            >
              Clear lock (GM ruling)
            </button>
          </section>
        </>
      )}

      {/* Kinetic aura gate (#228) — impulses blocked while the aura is down */}
      {auraGateBlocked && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Kinetic Aura</h3>
            <div className="uam-cost-empty">
              Kinetic aura is not active — use Channel Elements first.
            </div>
            <label className="uam-cost-override">
              <input
                type="checkbox"
                checked={auraOverride}
                onChange={(e) => setAuraOverride(e.target.checked)}
              />
              Override (GM ruling) — use anyway
            </label>
          </section>
        </>
      )}

      {/* Harrow omen gate (#227) — omen-bound abilities need an active omen */}
      {omenGateBlocked && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Harrow Omen</h3>
            <div className="uam-cost-empty">
              No active harrow omen — draw an omen from your deck first.
            </div>
            <label className="uam-cost-override">
              <input
                type="checkbox"
                checked={omenOverride}
                onChange={(e) => setOmenOverride(e.target.checked)}
              />
              Override (GM ruling) — use anyway
            </label>
          </section>
        </>
      )}

      {/* Raised-shield gate (#228) — Devoted Guardian needs the shield up */}
      {shieldGateBlocked && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Shield</h3>
            <div className="uam-cost-empty">
              Your shield is not raised — Raise a Shield first.
            </div>
            <label className="uam-cost-override">
              <input
                type="checkbox"
                checked={shieldOverride}
                onChange={(e) => setShieldOverride(e.target.checked)}
              />
              Override (GM ruling) — use anyway
            </label>
          </section>
        </>
      )}

      {/* Target immunity — picked PC targets already immune to this ability */}
      {immuneTargets.length > 0 && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Immunity</h3>
            {immuneTargets.map((t) => (
              <div key={t.charId} className="uam-cost-empty">
                {t.name} is immune
                {typeof t.expireAtSecs === 'number'
                  ? ` — expires at ${expiryLabelSecs(t.expireAtSecs, nowSecs)}`
                  : ''}
              </div>
            ))}
            {allTargetsImmune && (
              <label className="uam-cost-override">
                <input
                  type="checkbox"
                  checked={immunityOverride}
                  onChange={(e) => setImmunityOverride(e.target.checked)}
                />
                Override (GM ruling) — use anyway
              </label>
            )}
          </section>
        </>
      )}

      {/* Casting cost — source/rank picker, empty-pool block + override */}
      {castOptions.length > 0 && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            {!castIsFree && <h3 className="ct-section-title">Casting Cost</h3>}
            {castOptions.length === 1 ? (
              <div className="uam-cost-single">{castOptions[0].label}</div>
            ) : (
              <div className="uam-cost-options" role="radiogroup" aria-label="Casting source">
                {castOptions.map((opt, idx) => (
                  <label
                    key={`${opt.type}-${opt.rank ?? opt.key ?? idx}`}
                    className={`uam-cost-option${!opt.enabled ? ' uam-cost-option--disabled' : ''}`}
                  >
                    <input
                      type="radio"
                      name="cast-source"
                      checked={selectedCastIdx === idx}
                      onChange={() => { setCastOptionIdx(idx); setCastOverride(false); }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            )}
            {(selectedCastOption?.type === 'slot' || selectedCastOption?.type === 'staff-slot') && (
              <HeightenedNotes spell={ability} castRank={selectedCastOption.rank} />
            )}
            {selectedCastOption && !selectedCastOption.enabled && (
              <>
                <div className="uam-cost-empty">
                  {selectedCastOption.reason || 'Resource exhausted'}
                </div>
                <label className="uam-cost-override">
                  <input
                    type="checkbox"
                    checked={castOverride}
                    onChange={(e) => setCastOverride(e.target.checked)}
                  />
                  Override (GM ruling) — cast without spending
                </label>
              </>
            )}
          </section>
        </>
      )}

      {/* Blood magic (#227) — bloodline spell cast: pick the rider */}
      {bloodMagicActive && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">
              Blood Magic{character.spellcasting?.bloodline?.name ? ` (${character.spellcasting.bloodline.name})` : ''}
            </h3>
            <div className="uam-variant-note">{character.spellcasting.bloodline.blood_magic}</div>
            <div className="uam-cost-options" role="radiogroup" aria-label="Blood magic choice">
              {BLOOD_MAGIC_OPTIONS.map((opt) => (
                <label key={opt.id} className="uam-cost-option">
                  <input
                    type="radio"
                    name="blood-magic-choice"
                    checked={bloodMagicChoice === opt.id}
                    onChange={() => setBloodMagicChoice(opt.id)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Rider choice (#225) — either/or rider picked at use time */}
      {riderChoice && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">{riderChoice.prompt || 'Rider'}</h3>
            <div className="uam-cost-options" role="radiogroup" aria-label="Rider choice">
              {riderChoice.options.map((opt) => {
                const available = riderAvailable(opt);
                return (
                  <label
                    key={opt.id}
                    className={`uam-cost-option${!available ? ' uam-cost-option--disabled' : ''}`}
                  >
                    <input
                      type="radio"
                      name="rider-choice"
                      disabled={!available}
                      checked={selectedRider?.id === opt.id}
                      onChange={() => setRiderChoiceId(opt.id)}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
            {selectedRider?.note && <div className="uam-variant-note">{selectedRider.note}</div>}
          </section>
        </>
      )}

      {hasEffects && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Apply Effects</h3>

            {staticEffects.map((eff, idx) => (
              <div key={idx} style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                <span>{eff.effectId}</span>
                {eff.applyTo === 'self' && (
                  <span style={{ marginLeft: '0.5rem' }}>→ {character.name}</span>
                )}
                {eff.applyTo === 'all-allies' && (
                  <span style={{ marginLeft: '0.5rem' }}>→ all allies</span>
                )}
                {eff.duration && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                    ({eff.duration.until === 'rounds' ? `${eff.duration.rounds} rounds` : eff.duration.until})
                  </span>
                )}
              </div>
            ))}

            {isOpposedReaction ? opposedSection : (
              <>
                {needsPicker && (
                  <TargetPicker
                    selectable={selectable}
                    isTargeted={isTargeted}
                    onToggle={toggleTarget}
                  />
                )}
                {mapSection}
                {rollSection}
              </>
            )}
          </section>
        </>
      )}

      {grants.length > 0 && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Grant Actions</h3>
            {grants.map((grant, idx) => (
              <div key={idx} style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                <span>{grant.action?.name || ability.name}</span>
                {grant.action?.description && (
                  <span style={{ display: 'block', fontStyle: 'italic', fontSize: '0.8rem' }}>
                    {grant.action.description}
                  </span>
                )}
                {grant.duration && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                    ({grant.duration.until === 'rounds' ? `${grant.duration.rounds} rounds` : grant.duration.until})
                  </span>
                )}
              </div>
            ))}
          </section>
        </>
      )}

      {!hasEffects && isOpposedReaction && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            {opposedSection}
          </section>
        </>
      )}

      {!hasEffects && !isOpposedReaction && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <TargetPicker
              selectable={selectable}
              isTargeted={isTargeted}
              onToggle={toggleTarget}
            />
            {hasChainStrike ? (
              <>
                <h3 className="ct-section-title" style={{ marginTop: '0.75rem' }}>
                  {ability.chain.heading
                    || (ability.chain.modes?.includes('flurry') ? 'Strike or Flurry of Blows' : 'Strike')}
                  <span style={{ marginLeft: '8px', fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--color-text-muted)' }}>
                    (included in {effectiveCost})
                  </span>
                </h3>
                {mapSection}
                <ChainedStrikeSection
                  ref={chainRef}
                  character={character}
                  chain={ability.chain}
                  enemyTargets={enemyWithDefenses}
                  conditions={activeConditions || []}
                  effects={activeEffects || []}
                  mapStep={mapStep}
                  exploit={exploitFor(character.id)}
                  order={order}
                />
              </>
            ) : hasChainSpell ? (
              <>
                <h3 className="ct-section-title" style={{ marginTop: '0.75rem' }}>
                  Cast a Spell
                </h3>
                <ChainedSpellSection
                  ref={chainRef}
                  character={character}
                  chain={ability.chain}
                  parentCost={effectiveCost}
                  enemyTargets={enemyWithDefenses}
                  conditions={activeConditions || []}
                  effects={activeEffects || []}
                  onTotalCostChange={onSpellChainCostChange}
                  onSpellChange={onChainSpellChange}
                  mapStep={mapStep}
                  resources={resources}
                />
              </>
            ) : (
              <>
                {mapSection}
                {rollSection}
              </>
            )}
          </section>
        </>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          onClick={handleConfirm}
          disabled={!confirmEnabled}
          aria-label="confirm-cast"
        >
          {verb} ({costDisplay})
        </button>
      </div>
    </Modal>
  );
};

export default UseAbilityModal;
