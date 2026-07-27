import React, { useRef, useState, useCallback, useEffect } from 'react';
import Modal from '../shared/Modal';
import TargetPicker from './TargetPicker';
import OutOfTurnNotice from './OutOfTurnNotice';
import TargetRollResolver from './TargetRollResolver';
import MultiRayResolver from './MultiRayResolver';
import DamagePanel from './DamagePanel';
import RollSheet from './RollSheet';
import {
  AbilitySummarySection,
  StaticEffectsList,
  ChainedActionsSwitch,
  GrantActionsSection,
} from './UseAbilitySections';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useTargeting } from '../../hooks/useTargeting';
import { useFocusTarget } from '../../hooks/useFocusTarget';
import { useHuntPrey } from '../../hooks/useHuntPrey';
import { useEffects } from '../../hooks/useEffects';
import { useExploitVulnerability } from '../../hooks/useExploitVulnerability';
import { useIwrReveal } from '../../hooks/useIwrReveal';
import { useFrequencyGate } from '../../hooks/useFrequencyGate';
import { useAuraGate } from '../../hooks/useAuraGate';
import { useShieldGate } from '../../hooks/useShieldGate';
import { useOmenGate } from '../../hooks/useOmenGate';
import { useImmunityGate } from '../../hooks/useImmunityGate';
import { useRiderChoiceSection } from '../../hooks/useRiderChoiceSection';
import { useCatalystSection } from '../../hooks/useCatalystSection';
import { useChamberFireSection } from '../../hooks/useChamberFireSection';
import { useBloodMagicSection } from '../../hooks/useBloodMagicSection';
import { useFlatCheckSection } from '../../hooks/useFlatCheckSection';
import { useSaveDamageInput } from '../../hooks/useSaveDamageInput';
import { useOpposedReactionResolution } from '../../hooks/useOpposedReactionResolution';
import { useAbilityCastPlan } from '../../hooks/useAbilityCastPlan';
import { useVeracious } from '../../hooks/useVeracious';
import { useEnemyEffects } from '../../hooks/useEnemyEffects';
import { useBladeByrnie } from '../../hooks/useBladeByrnie';
import { useLoadout } from '../../hooks/useLoadout';
import { useCharacter } from '../../hooks/useCharacter';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useAttackRollSheet } from '../../hooks/useAttackRollSheet';
import { useSaveRollSheet } from '../../hooks/useSaveRollSheet';
import { abilityNeedsPicker } from '../../utils/applyAbility';
import { DEFENSE_LABELS, defenseDC } from '../../utils/defense';
import { resolveActionRoll } from '../../utils/rollResolution';
import { buildDamageProfile, formatDamageBreakdown } from '../../utils/damage';
import { DEGREE_LABELS, degreeLabel } from '../../utils/degreeDisplay';
import { buildTargetSaveRequest } from '../../utils/saveRequest';
import { useSecondaryProfiles } from '../../hooks/useSecondaryProfiles';
import { useTemplatePlacementSection } from '../../hooks/useTemplatePlacementSection';
import { applyChainStrikeResults, applyChainSpellResults } from '../../utils/chainResultsAppliers';
import {
  buildRayGroups,
  applyCastRegistrations,
  applyEffectsOrLogGeneric,
  logRayGroupResults,
  applyPostRollEffects,
} from '../../utils/confirmAppliers';
import { buildAttackToggles } from '../../utils/attackToggles';
import { flourishFor } from '../../utils/flourishFor';
import { buildRollFx } from '../../utils/rollToast';
import { buildStrikeRangeGating } from '../../utils/strikeRangeGating';
import { PERSISTENT_KEY } from '../../utils/persistentDamage';
import { logThrownWeaponResolution } from '../../utils/thrownResolution';
import { isAttackAbility, mapPenaltyFor } from '../../utils/map';
import { toGameSeconds } from '../../utils/gameTime';
import { useRecallKnowledge } from '../../hooks/useRecallKnowledge';
import { useFxChannel } from '../../hooks/useFxChannel';
import './UseAbilityModal.css';
import { RELAY, APP, syncKey, globalKey } from '../../sync/keys';

/**
 * UseAbilityModal — orchestrator for using any encounter ability
 * (action / reaction / spell). Post-decomposition (#1317 D1–D4) it owns only:
 *
 *   - targeting: useTargeting + the focused-foe preselect, the caster entry,
 *     and the PC/enemy target splits every module consumes
 *   - the roll hub: rollProfile → effectiveDefense / resolverTargets /
 *     saveTargets, damageProfile and saveDc
 *   - the confirmEnabled fold: picker + every gate's gateOk + flat checks + range
 *   - handleConfirm sequencing: two early returns (opposed-reaction resolve,
 *     failed flat check), the log-suffix collector order (castPlan spend first,
 *     then the gates), the action/reaction spend and the MAP recordAttack
 *   - the render skeleton, mounting each module's `section` in its fixed slot
 *
 * Module inventory:
 *   - gates (D1): useFrequencyGate / useAuraGate / useShieldGate / useOmenGate /
 *     useImmunityGate — uniform { gateOk, section, applyOnConfirm } shape
 *   - sections (D2): useRiderChoiceSection / useCatalystSection /
 *     useChamberFireSection / useBloodMagicSection / useFlatCheckSection
 *   - casting arithmetic (D4): useAbilityCastPlan — MAP/action-count/resource
 *     cluster + its render pieces and the confirm-time resource spend
 *   - appliers (D3/D4): saveRequest, chainResultsAppliers, confirmAppliers —
 *     pure functions fed an explicit ctx bag, no modal state
 *
 * Adding a NEW mechanic:
 *   (a) gate → new useXxxGate hook (D1 shape); wire one gateOk into the fold,
 *       render one {gate.section}, call one gate.applyOnConfirm(ctx) in sequence
 *   (b) post-roll effect → pure applier util (ctx bag) called from the matching
 *       handleConfirm position
 *   (c) never add raw useState for a mechanic to this file — own it in a hook
 *
 * Props: ability, cost (explicit action cost), verb ('Cast'|'Use'), castSource
 * ('slot'|'focus'|'staff'|'wand'|'scroll'|'innate'), character, themeColor,
 * isOpen, onClose.
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
  const { characters, effects: effectCatalog, fxAnimations } = useContent();
  const { gameDate, time } = useGameDate();
  const { encounter, appendLog, addSaveRequest, addArmedPayload, clearSaveResolution } =
    useEncounter();
  const { turnState, spendActions, spendReaction, recordAttack } =
    useTurnState(character?.id || 'nobody');
  const { exploitFor } = useExploitVulnerability();
  const { revealFiredIwr } = useIwrReveal();
  // Whetstone on-hit reveals (#1215 — Analysis Eye) write the creature's RK
  // record directly (one weakness/resistance, not damage-fired).
  const { recordFor, mergeRecord } = useRecallKnowledge();
  // Juice broadcast (#1346) — remote devices bloom this character's card.
  const { emitFx } = useFxChannel();

  const resolverRef = useRef(null);
  const chainRef    = useRef(null);
  // RollSheet finish bookkeeping (#1687): `deferredRef` marks a commit that
  // parked its damage-dependent steps for the amount screen, `finishedRef`
  // makes running them exactly-once — including the abandon path below.
  const deferredRef = useRef(false);
  const finishedRef = useRef(false);
  // The id of the save request this confirm pushed (#1689) — the join key the
  // caster's sheet watches `encounter.saveResolutions` for.
  const saveReqIdRef = useRef(null);

  // Multi-ray sequential driver (#1691, workstream J): `raysReady` gates the
  // outer sheet's commit pill until every ray has been rolled (SequentialAttackSteps'
  // onProgress reports in); `rayResultsRef` snapshots the frozen [{rayIndex,
  // results}] the instant the pill fires, because MultiRayResolver unmounts
  // once RollSheet leaves phase 'roll' (dieSlot only renders there) — nothing
  // downstream (the settled receipt) can read the live ref after that.
  const [raysReady, setRaysReady] = useState(false);
  const rayResultsRef = useRef(null);

  // Opposed-reaction immunity (#226-C) — Disrupting Performance stamps a
  // self-expiring per-enemy immunity, keyed by encounter entryId. effectsFor
  // also feeds the off-guard attack toggle (#348).
  const { stampImmunity, effectsFor, applyCondition: applyEnemyCondition } = useEnemyEffects();

  // Blade Byrnie (#738 E4 pt.2): a Strike with the transient dagger returns it to
  // the armor. The dagger strike is tagged bladeByrnie:true (utils/bladeByrnie).
  const { returnToArmor: returnBlade } = useBladeByrnie(character?.id || 'nobody');
  // Thrown Strikes (#1230): the weapon leaves the wielder's hand on release —
  // the confirm marks it Dropped in the live loadout unless a returning rune
  // flies it back.
  const { drop: dropThrownWeapon } = useLoadout(character?.id || 'nobody');
  const [consumed, setConsumed] = useSyncedState(syncKey(APP.CONSUMED, character?.id || ''), {});

  // The spell currently picked inside a chained cast (#227) — blood magic
  // triggers when it carries the bloodline flag.
  const [chainSpell, setChainSpell] = useState(null);
  const onChainSpellChange = useCallback((spell) => setChainSpell(spell), []);

  // The character's derived data — feeds the shield gate's inventory and the
  // catalyst eligibility below.
  const charData = useCharacter(character);

  // Veracious Spell (#967 R7) — the armed power-ring bonus applies to the NEXT
  // spell attack, so a committed cast consumes it (cleared on confirm below).
  const { armed: veraciousArmed, disarm: disarmVeracious } =
    useVeracious(character?.id || 'nobody', charData?.inventory || []);

  // Save-based damage entry (#270, extracted #1317 D3): the caster's rolled
  // total and rider toggles, carried into the save request for GM-side
  // per-degree resolution (buildTargetSaveRequest snapshots it on confirm).
  const { saveDmgInput, setSaveDmgInput, saveRiderState, toggleRider: toggleSaveRider } =
    useSaveDamageInput();

  // Persistent-damage tracking (#272) — confirm records per-target entries here.
  const [, setPersistentMap] = useSyncedState(PERSISTENT_KEY, {});

  // Read the actor's active conditions and effects (same sources StatsBlock uses).
  const [activeConditions] = useSyncedState(syncKey(RELAY.CONDITIONS, character?.id || ''), []);
  const { effects: activeEffects } = useEffects(character?.id || '');

  // Combatant grid positions from the bridge (#527) — drives ranged range
  // increments. Request a fresh push when the modal opens so a stale snapshot
  // doesn't misjudge distance; degrades to no range gating when absent.
  const [positionsState] = useSyncedState(globalKey(RELAY.POSITIONS), null);
  const { prey } = useHuntPrey(character?.id || '');
  const isRangedStrike = ability?.type === 'ranged';
  useEffect(() => {
    if (isOpen && isRangedStrike) sendUpdate('global', RELAY.POSITIONSREQ, { ts: Date.now() });
  }, [isOpen, isRangedStrike, sendUpdate]);

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

  const casterEntry    = order.find((e) => e.kind === 'pc' && e.charId === character?.id);
  const casterEntryId  = casterEntry?.entryId || null;

  // Adopt a computed set of combatants into the target selection (#1573 B3 —
  // the creatures standing in a placed area). Additive by design: toggling only
  // the ones not already picked leaves a manual choice intact, and the player
  // can still uncheck anything the geometry got wrong.
  const adoptTargetIds = useCallback((entryIds) => {
    (entryIds || []).forEach((id) => { if (!isTargeted(id)) toggleTarget(id); });
  }, [isTargeted, toggleTarget]);

  const nowSecs = toGameSeconds({ ...gameDate, ...time });

  const selectedEntries  = order.filter((e) => targets.includes(e.entryId));
  const targetCharIds    = selectedEntries.filter((e) => e.kind === 'pc' && e.charId).map((e) => e.charId);
  const enemyTargetNames = selectedEntries.filter((e) => e.kind === 'enemy').map((e) => e.name);

  // Gate hooks (#1317 D1) — each owns its override state, gate derivation,
  // blocked-section JSX and confirm slice. The orchestrator folds each gateOk
  // into confirmEnabled, renders each section where its block always sat, and
  // calls each applyOnConfirm at the same handleConfirm sequence position.
  const frequencyGate = useFrequencyGate({
    charId: character?.id || 'nobody',
    ability,
    nowSecs,
    encounter,
    casterEntryId,
  });
  const auraGate = useAuraGate({ charId: character?.id || 'nobody', ability, character });
  const shieldGate = useShieldGate({
    charId: character?.id || 'nobody',
    ability,
    inventory: charData?.inventory || [],
  });
  const omenGate = useOmenGate({ charId: character?.id || 'nobody', ability, character });
  const immunityGate = useImmunityGate({
    ability,
    character,
    characters,
    targetCharIds,
    nowSecs,
    getState,
    sendUpdate,
  });
  // The live omen, re-exported by the gate hook — read by the omen summary
  // line and the Harrow-Casting narrative block below.
  const omen = omenGate.omen;

  const effectiveVerb = verb.toLowerCase();
  const isAttack = isAttackAbility(ability);

  // Mechanic section hooks (#1317 D2) — each owns its state, derivations,
  // section JSX and confirm slice, mirroring the D1 gate hooks. The
  // orchestrator folds their outputs into confirmEnabled / the cost spend,
  // renders each `section` where its block always sat, and calls each confirm
  // slice at the same handleConfirm sequence position.
  const riderChoiceSection = useRiderChoiceSection(ability, activeEffects);
  const { selectedRider } = riderChoiceSection;
  const catalystSection = useCatalystSection({
    effectiveVerb,
    charData,
    ability,
    character,
    consumed,
    setConsumed,
  });
  const { catalystActionBump } = catalystSection;
  const chamberFireSection = useChamberFireSection({
    ability,
    character,
    setConsumed,
    order,
    appendLog,
    addSaveRequest,
    sendUpdate,
    applyEnemyCondition,
  });
  const { isChamberedFire, fireExtra } = chamberFireSection;
  const bloodMagicSection = useBloodMagicSection({ character, ability, effectiveVerb, chainSpell });
  const flatCheckSection = useFlatCheckSection({ ability, activeConditions, isAttack, effectiveVerb, charId: character.id });
  const { flatChecks, allFlatChecksRolled, failedFlatCheck } = flatCheckSection;

  // Casting arithmetic (#1317 D4) — the MAP step (auto + override, #475), the
  // variable action count (#215), multi-ray count, casting-resource wiring
  // (#235) and the cost displays, plus the actions-selector / casting-cost /
  // MAP-row render pieces. Hoisted above the ability guard so the
  // opposed-reaction hook below can resolve its skill profile from the same
  // MAP inputs (#1317 D3).
  const castPlan = useAbilityCastPlan({
    ability,
    character,
    explicitCost,
    effectiveVerb,
    castSource,
    turnState,
    isChamberedFire,
    fireExtra,
  });
  const {
    resources, mapStep, effectiveCost, castCost, variant,
    hasChainStrike, hasChainSpell, isMultiRay, rayCount,
    directCastRank, castGateOk,
  } = castPlan;

  // Changing the ray count (the action-count picker, mid-edit) restarts the
  // sequential multi-ray driver — `key={rayCount}` on MultiRayResolver below
  // remounts it fresh, and `raysReady` must drop with it or the outer commit
  // pill would stay enabled from the PREVIOUS count until a ray is rolled
  // again. This resets IN RENDER (the "adjusting state on a prop change"
  // pattern), not in an effect: an effect here would race the remounted
  // MultiRayResolver's own mount-time `onProgress` call — child effects fire
  // before a same-commit parent effect, so an effect-based reset would
  // silently clobber the fresh ray count's own readiness right after it
  // reports in.
  const prevRayCountRef = useRef(rayCount);
  if (rayCount !== prevRayCountRef.current) {
    prevRayCountRef.current = rayCount;
    if (raysReady) setRaysReady(false);
  }

  // Opposed reaction (#226-C, extracted #1317 D3) — owns the resolver ref, the
  // opposedSection JSX (rendered in both effect branches below) and the entire
  // early-return confirm path (resolve).
  const opposedReaction = useOpposedReactionResolution({
    ability,
    character,
    order,
    activeConditions,
    activeEffects,
    effectCatalog,
    mapStep,
  });
  const { isOpposedReaction, section: opposedSection } = opposedReaction;

  // Secondary damage profiles (#987) — extra damage zones with their own target
  // set and save (Propagating Arc's splash). Each emits its own save request on
  // confirm; the GM resolver already handles a list. Hoisted above the ability
  // guard like castPlan; its saveDc arrives at buildRequests() time because
  // rollProfile is only derived below the guard.
  const secondaryProfiles = useSecondaryProfiles({
    ability,
    character,
    order,
    castRank: directCastRank,
    casterEntryId,
    fxAnimations,
  });

  // Area placement (#1573 B3) — tap the battlefield snapshot to say where a
  // burst lands, and adopt the creatures standing in it as the save targets.
  // Deliberately gate-free (see the hook): an area spell stays castable without
  // a bridge exactly as before. Hoisted above the ability guard like the others.
  const placement = useTemplatePlacementSection({
    ability,
    order,
    casterEntryId,
    positionsState,
    adoptTargets: adoptTargetIds,
  });

  // The attack path's RollSheet state (#1687) — situational toggles, damage
  // riders, crit doubling and the one frozen commit. Hoisted above the ability
  // guard like the hooks above it; the derivation itself needs the roll profile
  // and so runs below, through the returned `derive()`.
  const deriveAttackSheet = useAttackRollSheet();

  // The target-save path's RollSheet state (#1689) — the request this cast is
  // waiting on, the GM's degrees when they land, the post-degree damage leg and
  // the two escape hatches. Hoisted above the ability guard like the rest; it
  // watches both encounter rails, so it takes the encounter directly.
  const deriveSaveSheet = useSaveRollSheet({
    encounter,
    casterId: character?.id || null,
    clearSaveResolution,
  });

  if (!ability || !character) return null;

  const effects     = Array.isArray(ability.effects) ? ability.effects : [];
  const grants      = Array.isArray(ability.grants)  ? ability.grants  : [];
  const hasEffects  = effects.length > 0 || grants.length > 0;
  const needsPicker = abilityNeedsPicker(ability);

  // Enemy targets with defense data — used by both the regular resolver and the chain section.
  const enemyWithDefenses = selectedEntries.filter((e) => e.kind === 'enemy' && e.defenses);

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

  // The DC an ARMED payload (#987) fires at, months of table-time after the cast
  // that parked it (#1617). Normally that is the cast's own `saveDc` — it already
  // carries the chosen variant's dcDelta (#215) and the actor's condition/effect
  // netting, so nothing better exists. But a spell can arm a save payload while
  // calling for no save *itself*: Targeting Beacon has no cast-time `defense` at
  // all, and Cascading Caltrops' "Acrobatics or Reflex" is unparseable — both
  // resolve to mode 'none' with a null DC. Copying that null parked a payload
  // whose Fire button could never build a save request.
  //
  // A spell DC is a property of the caster and the rank, not of whether this
  // particular cast happened to call for a save, so derive it from the payload's
  // OWN defense through the same resolver rather than inheriting an absence.
  const payloadDcFor = (p) => {
    if (saveDc != null) return saveDc;
    if (!p?.defense) return null; // save-less persistent payload — nothing to roll against
    // A synthetic single-save spell, the same shape ArmedPayloads builds when it
    // fires: no traits and no roll config, so this always lands on the spell-save
    // inference branch rather than the caster's attack path.
    const derived = resolveActionRoll(
      { name: ability.name, level: ability.level, defense: p.defense },
      character,
      { conditions: activeConditions || [], effects: activeEffects || [], effectCatalog },
    );
    return derived.mode === 'target-save' ? derived.dc : null;
  };

  // Which defense to show on the resolver (actor-roll only).
  const effectiveDefense = rollProfile.mode === 'actor-roll'
    ? rollProfile.defense
    : (ability.targetDefense || (ability.traits?.includes('Attack') ? 'ac' : null));

  // Enemy targets that have defense data and a resolvable defense (actor-roll path only).
  const resolverTargets = (rollProfile.mode === 'actor-roll' && effectiveDefense)
    ? enemyWithDefenses
    : [];

  // Situational bonus toggles (#274, #348 off-guard, #1216 armed whetstone,
  // extracted #1317 D4): opt-in circumstance toggles on the rolled attack stat.
  const attackToggles = buildAttackToggles({
    ability,
    character,
    rollProfile,
    effectiveDefense,
    resolverTargets,
    effectsFor,
    activeEffects,
    effectCatalog,
  });

  // Ranged range increments (#530, extracted #1317 D4): per-target increment
  // penalties from the bridge positions; a target beyond 4× the increment is
  // out of range and hard-blocks the Strike.
  const { rangeByEntry, hasRangeData, anyTargetOutOfRange } = buildStrikeRangeGating({
    ability,
    isRangedStrike,
    positionsState,
    casterEntryId,
    resolverTargets,
    prey,
  });

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

  // Abilities that interact with the omen surface its current suit.
  const showsOmen = ability.requiresOmen === true || ability.clearsOmen === true;

  // Ally resistance note (#228 — Retributive Strike's "2 + your level").
  const allyResistance = ability.allyResistance
    ? (Number(ability.allyResistance.base) || 0)
      + (ability.allyResistance.addLevel ? (character.level || 0) : 0)
    : null;

  const confirmEnabled =
    (!needsPicker || targets.length > 0)
    && castGateOk && frequencyGate.gateOk && immunityGate.gateOk
    && auraGate.gateOk && shieldGate.gateOk && omenGate.gateOk
    && (flatChecks.length === 0 || allFlatChecksRolled)
    && !anyTargetOutOfRange;  // ranged Strike beyond 4× increment is out of range (#530)

  // The dice-tower chat label AND the roll toast's headline (#1490 S2/S3) —
  // reads like the action: "Strike: Longsword (MAP -5)".
  const rollFlavor =
    `${verb}: ${ability.name}${mapStep ? ` (MAP ${mapPenaltyFor(ability, mapStep)})` : ''}`;

  // ── The RollSheet attack path (#1687/#1691, Roll Resolution redesign E/J) ──
  // The single-roll actor-roll branch — a Strike or a spell attack — moved onto
  // the two-phase sheet first (E); direct multi-ray (Scorching Ray, Blazing
  // Bolt cast un-chained) moved onto it too (J, #1691) via the sequential
  // per-ray driver below (`!isMultiRay` is gone from this predicate).
  //
  // `hasChainStrike`/`hasChainSpell` STAY excluded, on purpose (J's scope
  // decision — stated in the #1691 PR body): a chain-parent ability (Reach
  // Spell, Inner Upheaval) authors no roll fields of its own, so real content
  // never resolves it to 'actor-roll'/'target-save' and this exclusion is
  // provably a no-op against the live game data — but it is NOT a no-op
  // against a test (or a future content shape) whose `resolveActionRoll` mock
  // doesn't honour that convention, so it stays as an explicit guard rather
  // than relying on the structural fact alone. The chained sections roll
  // sequentially too (#1691), just inline within their own classic-modal body
  // — see ChainedStrikeSection/ChainedSpellSection and SequentialAttackSteps.
  // The opposed reaction keeps its own resolver.
  const useRollSheet =
    rollProfile.mode === 'actor-roll'
    && !!effectiveDefense
    && resolverTargets.length > 0
    && !hasChainStrike
    && !hasChainSpell
    && !isOpposedReaction;

  const attackSheet = (useRollSheet && !isMultiRay)
    ? deriveAttackSheet({
        rollBonus: rollProfile.bonus,
        toggles: attackToggles,
        enemyTargets: resolverTargets,
        defense: effectiveDefense,
        rangeByEntry: hasRangeData ? rangeByEntry : null,
        damageProfile,
        degrees: ability.degrees,
      })
    : null;

  // ── The RollSheet save path (#1689, workstream G2) ─────────────────────────
  // The caster commits, the sheet parks on `waiting`, the GM's degrees come
  // back on encounter.saveResolutions and the damage is rolled after them.
  // Multi-ray never reaches target-save mode (a ray-rolling ability is always
  // an actor-roll), so that exclusion is gone here too (it was always a
  // no-op). `hasChainStrike`/`hasChainSpell` stay excluded — same rationale as
  // the attack branch above. Chained SAVE spells deliberately stay old-style
  // (#1691 J decision — see ChainedSpellSection's saveDamageProfile/DamagePanel
  // block, unchanged): the GM applies their damage exactly as before.
  const useSaveSheet =
    rollProfile.mode === 'target-save'
    && saveTargets.length > 0
    && rollProfile.dc != null
    && !hasChainStrike
    && !hasChainSpell
    && !isOpposedReaction;

  const saveSheet = useSaveSheet
    ? deriveSaveSheet({
        ability,
        character,
        order,
        damageProfile,
        riderState: saveRiderState,
        onToggleRider: toggleSaveRider,
        defense: rollProfile.defense,
        saveDc,
        appendLog,
        sendUpdate,
        setPersistentMap,
        revealFiredIwr,
      })
    : null;

  // Shared applier context (#1317 D4) — every confirm-time applier
  // destructures the keys it needs from this bag plus call-specific extras;
  // unused keys are harmless. Hoisted out of the confirm so the deferred
  // damage step (#1687) rebuilds nothing.
  const ctx = {
    ability, character, caster: character, casterEntryId, order, encounter,
    characters, getState, sendUpdate, appendLog, effectiveVerb, nowSecs,
    fxAnimations,
  };

  /**
   * The confirm sequence, unchanged in order and content. `face` / `results`
   * arrive from RollSheet's commit; the classic (non-sheet) paths still read
   * them off the resolver ref. `deferDamage` holds back the two steps that need
   * the entered totals — they run again from `runFinish` at the amount step.
   *
   * @returns {'done'|'opposed'|'lost'} which path it took — `opposed` already
   *   closed the modal itself, `lost` is the failed condition flat check (the
   *   action is spent but nothing resolves), `done` is the full sequence.
   */
  const runConfirm = ({ face = null, results = null, deferDamage = false } = {}) => {
    // Juice (#1346): every path through this handler is a committed use, so the
    // one emit here covers all of them — early returns, catalysts, action-folds.
    // Fire-and-forget: nothing downstream gates on it. Signature moments carry
    // a flourish hint (#1347); the conditional spread keeps a no-match emit
    // free of an undefined field on the wire.
    const flourish = flourishFor({
      ability, castSource, character, bloodMagicActive: bloodMagicSection.active,
    });
    // Roll toast (#1490 S3): a resolved actor-roll rides the same event as a
    // compact `roll` payload. getD20Face only exists on the single-roll
    // resolver, so multi-ray/chained casts emit the plain event (their toast
    // is a later slice); getResults is pure, so this pre-read is free.
    const rollFx = buildRollFx({
      d20: face ?? resolverRef.current?.getD20Face?.() ?? null,
      flavor: rollFlavor,
      results: results ?? resolverRef.current?.getResults?.() ?? null,
      attack: effectiveDefense === 'ac',
    });
    emitFx({
      kind: 'ability',
      charId: character.id,
      ...(flourish ? { flourish } : {}),
      ...(rollFx ? { roll: rollFx } : {}),
    });

    // Veracious Spell (#967 R7): every path through this handler is a committed
    // use, so any cast — even one that fizzles on a flat check downstream —
    // consumes the armed state. Re-arming stays a SpellsHeader action.
    if (effectiveVerb === 'cast' && veraciousArmed) disarmVeracious();

    // Foundry-authoritative buffs (#455): when the ability's foundryEffect is
    // flagged `authoritative` AND the Foundry bridge is connected (its roster is
    // present), let Foundry's aura engine own the effect — the app skips its own
    // structured-effect writes and instead mirrors the result via the
    // cnmh_foundryeffects read-back. With no bridge, the authored effects[] (e.g.
    // Inspire Courage's all-allies fallback) apply as before.
    const bridgePresent = (getState('global', RELAY.ROSTER) || []).length > 0;
    const foundryAuthoritative = !!ability.foundryEffect?.authoritative && bridgePresent;

    // Opposed reaction (#226-C, extracted #1317 D3) — its own resolution path
    // (useOpposedReactionResolution.resolve). The actor's skill roll is
    // compared to the GM-called DC; the authored self effect and any per-enemy
    // immunity land only on a success. Returns early so none of the
    // target-defense / save-request / MAP machinery below ever runs for it.
    if (isOpposedReaction) {
      opposedReaction.resolve({
        ...ctx,
        hasEffects,
        immunityConfig: immunityGate.immunityConfig,
        immunityAbilityKey: immunityGate.immunityAbilityKey,
        stampImmunity,
        effectiveCost,
        verb,
        spendReaction,
        onClose,
      });
      return 'opposed';
    }

    const rawResults   = results ?? resolverRef.current?.getResults() ?? null;
    const chainResults = chainRef.current?.getResults() ?? null;

    // Normalise resolver output into ray groups so single-roll and multi-ray
    // casts share one logging path (extracted #1317 D4).
    const rayGroups = buildRayGroups(rawResults, isMultiRay && rollProfile.mode === 'actor-roll');

    // Log-suffix collector (#1317 D1) — the casting-resource spend and each
    // gate's applyOnConfirm contribute in the same order the old sourceSuffix
    // string was built, so the joined suffix composes identically.
    const suffixes = [];
    const addSuffix = (s) => suffixes.push(s);
    // Spend the casting resource (slot/focus/staff/wand/scroll) — the cast
    // plan's confirm slice runs FIRST among the suffix contributors (#1317 D4).
    castPlan.applyOnConfirm({ addSuffix });
    frequencyGate.applyOnConfirm({ addSuffix, appendLog });
    auraGate.applyOnConfirm({ addSuffix, appendLog });
    shieldGate.applyOnConfirm({ addSuffix, appendLog });
    omenGate.applyOnConfirm({ addSuffix, appendLog });
    const sourceSuffix = suffixes.join('');
    // Ally resistance (#228): the GM applies it to the triggering damage.
    if (allyResistance != null) {
      appendLog({
        type:   'action',
        charId: character.id,
        text:   `${character.name}'s ally gains resistance ${allyResistance} against the triggering damage (${ability.name})`,
      });
    }

    // Condition flat check (#262): a failed stupefied / grabbed-manipulate check
    // loses the action. The casting resource, frequency and action cost are still
    // spent (handled above + below); resolution — effects, saves, damage, MAP —
    // is skipped, and the loss is logged.
    if (failedFlatCheck) {
      appendLog({
        type:   'action',
        charId: character.id,
        text:   `${character.name} ${effectiveVerb} ${ability.name}${sourceSuffix} — ${failedFlatCheck.label} flat check failed (DC ${failedFlatCheck.dc}: rolled ${failedFlatCheck.d20}); ${failedFlatCheck.fail}`,
      });
      if (castCost === 'reaction') {
        spendReaction(`${verb} ${ability.name}`);
      } else if (typeof castCost === 'number' && castCost > 0) {
        spendActions(castCost + fireExtra, `${verb} ${ability.name}`);
      }
      // The bolt is spent even on a lost flat check; no on-hit (the attack missed).
      chamberFireSection.commit([]);
      return 'lost';
    }

    // Catalysts (#1209): consume each added catalyst (by name, like potions) and
    // log its rider effect. The extra actions fold into the cast spend below.
    catalystSection.applyOnConfirm({ appendLog });

    // Stamp clock-expiring immunity on picked PC targets (Guidance, Tell
    // Fortune, …). Independent of effects[]; idempotent on already-immune.
    immunityGate.applyOnConfirm({ addSuffix, appendLog });

    // Cast registrations (extracted #1317 D4): the sustained-spell ledger
    // (#220), the 'while playing' composition mark (#935) and per-spell
    // counters (#220 — Mirror Image images, Bless emanation radius).
    applyCastRegistrations({ ...ctx, directCastRank, foundryAuthoritative });

    // Rider choice (#225) — apply/remove the chosen rider's caster-scoped
    // effect (e.g. gain eld-charged, or Discharge to consume it).
    riderChoiceSection.applyOnConfirm(ctx);

    // Structured effects (with the Lingering Composition extension, #226-B) or
    // the generic action line (extracted #1317 D4); true when the resource
    // suffix already landed on a log line.
    const suffixLogged = applyEffectsOrLogGeneric({
      ...ctx, hasEffects, targetCharIds, enemyTargetNames, selectedEntries,
      rayGroups, directCastRank, foundryAuthoritative, sourceSuffix,
    });

    // Per-target rolled results (#222, #274; extracted #1317 D4) — one log
    // line per resolved degree, with damage totals and toggle reasons.
    // Post-roll effect riders (extracted #1317 D4): persistent-damage tracking
    // (#272), the typed damage relay + IWR reveal-on-trigger (#1016/#1014),
    // whetstone on-hit riders (#1215) and triggered whetstone saves (#1216).
    //
    // Both read the ENTERED damage totals, which under RollSheet do not exist
    // until the amount step — so when an amount step is coming they are held
    // back and re-run verbatim from `runFinish` with the same frozen degrees
    // (handoff §Damage relay). A 0-hit or damage-free commit has no amount
    // step and runs them here, exactly as before.
    if (!deferDamage) {
      logRayGroupResults({ ...ctx, rayGroups, effectiveDefense });
    }

    // Log chained strike results (Inner Upheaval and similar; extracted #1317
    // D3): per-target totals (#222) with the static dice string as fallback,
    // plus the Flurry of Blows combined-damage line.
    if (chainResults && hasChainStrike) {
      applyChainStrikeResults(chainResults, ctx);
    }

    if (!deferDamage) {
      applyPostRollEffects({
        ...ctx, castCost, rayGroups, chainResults, hasChainStrike, damageProfile,
        setPersistentMap, addSaveRequest, applyEnemyCondition, revealFiredIwr,
        recordFor, mergeRecord,
      });
    }

    // Push a save request to the GM for target-save abilities (builder
    // extracted #1317 D3). The rider snapshot always travels with it; the
    // caster's entered total does too on the classic path, where RequestedSaves
    // derives per-degree totals GM-side.
    //
    // On the RollSheet save path (#1689) the total does NOT: `deferDamage`
    // ships `entered: null`, which is both the caster's promise to roll it
    // after the degrees and the flag that stops RequestedSaves applying damage
    // itself. `saveDmgInput` is not even collected there — the pre-commit total
    // input is gone from that flow.
    const saveRequest = buildTargetSaveRequest({
      ...ctx, rollProfile, saveTargets, damageProfile, saveDmgInput,
      saveRiderState, deferDamage: useSaveSheet, saveDc, directCastRank,
    });
    // The id is the join key the caster's sheet watches for its degrees.
    saveReqIdRef.current = saveRequest ? (addSaveRequest(saveRequest) ?? null) : null;

    // Secondary damage zones (#987) — one extra save request per zone that has
    // picked targets (Propagating Arc's splash). Independent of the primary
    // save, so a zone with no targets is simply a no-op.
    secondaryProfiles.buildRequests(saveDc).forEach(addSaveRequest);

    // Area placement (#1573 B3) — ping where the area landed so the table sees
    // it, and log the placement. Runs beside the save requests it informed.
    placement.applyOnConfirm();

    // Armed payloads (#987) — damage/save this cast stores for a LATER trigger
    // (Targeting Beacon's beacon exploding on the next attack that hits).
    // Resolving them now would fire them at the wrong moment, so they park on
    // the encounter and the GM fires them when the trigger actually happens.
    (Array.isArray(ability.armedPayloads) ? ability.armedPayloads : []).forEach((p) => {
      const { id: payloadId, ...authored } = p;
      addArmedPayload({
        // Carry the authored payload WHOLE (#1618). This was a fixed field list,
        // which silently dropped `severityFromSave` — Gruesome Marionettist's
        // half/full/double picker never rendered from a live cast, so its bleed
        // always landed at full — and would have dropped the next authored field
        // the same way. Spreading makes the content vocabulary the contract; the
        // cast-time context below is layered on top and always wins.
        ...authored,
        payloadId,
        note:        p.note ?? null,
        repeatable:  !!p.repeatable,
        dc:          payloadDcFor(p),
        rank:        directCastRank ?? null,
        // The spell's native rank — the baseline the payload heightens FROM
        // when it eventually fires (heightenedEntriesFor keys off it).
        spellLevel:  ability.level,
        abilityName: ability.name,
        casterId:    character.id,
        casterName:  character.name,
      });
      appendLog({
        type: 'system',
        text: `${ability.name}: ${p.label} is armed — ${p.trigger}`,
      });
    });

    // Consume chained spell results (Reach Spell, Harrow Casting, etc.;
    // extracted #1317 D3): resource spend via the section's castOption (#235),
    // per-ray logging (#581) with the Split Shot note (#227), the chained save
    // request, Harrow Casting's drawn-card mechanics (#227) and the spellshape
    // self-effect (#1001 S2).
    if (hasChainSpell && chainResults) {
      applyChainSpellResults(chainResults, {
        ...ctx, targetCharIds, addSaveRequest, resources, omen,
      });
    }

    // Blood magic (#227): the bloodline rider lands on the caster as a catalog
    // effect until the start of their next turn. Re-derived from chainResults
    // (not the live chainSpell state) so confirm matches what was actually cast.
    bloodMagicSection.applyOnConfirm({ ...ctx, chainResults });

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
      // Chambered fire adds the chosen ammo's Activate cost on top of the Strike (#676);
      // catalysts add their extra actions to the cast (#1209).
      spendActions(costToSpend + fireExtra + catalystActionBump, `${verb} ${ability.name}`);
    }

    // Chambered fire (#676): discharge the chosen chamber + apply on-hit effects to
    // the struck enemies (success / critical success on an AC attack).
    if (isChamberedFire) {
      const hitEntryIds = rayGroups.flatMap((g) =>
        g.results
          .filter((r) => r.degree === 'success' || r.degree === 'criticalSuccess')
          .map((r) => r.entryId)
      );
      chamberFireSection.commit(hitEntryIds);
    }

    // Count attacks for MAP. Multi-roll casts (flurry, multi-ray) increment once
    // per attack but only after the whole activity — i.e. here, on confirm. Each
    // Blazing Bolt ray is its own attack, so a 3-ray cast raises MAP by 3.
    if (hasChainStrike && chainResults) {
      recordAttack(chainResults.mode === 'flurry' ? 2 : 1);
    } else if (hasChainSpell && chainResults?.isAttackSpell) {
      // Each Blazing Bolt ray is its own attack (#581) — a chained multi-ray
      // cast raises MAP by the ray count; single-roll chained spells by 1.
      recordAttack(chainResults.multiRay ? (chainResults.chosenActions ?? 1) : 1);
    } else if (isMultiRay && isAttack) {
      recordAttack(rayCount);
    } else if (isAttack) {
      recordAttack(1);
    }

    // Blade Byrnie (#738): Striking with the transient dagger returns it to the
    // armor — clear the overlay so the injected strike disappears.
    if (ability?.bladeByrnie) returnBlade();

    // Thrown Strike (#1230): the weapon lands where it struck (hit or miss) —
    // mark it Dropped in the live loadout, unless a returning-effect rune flies
    // it back to hand. The Blade Byrnie dagger has its own return path above.
    logThrownWeaponResolution({ ability, character, dropThrownWeapon, appendLog });

    return 'done';
  };

  // The classic (non-RollSheet) confirm button: run the sequence, then close.
  // The opposed-reaction path closes itself from inside `resolve`.
  const handleConfirm = () => {
    if (runConfirm() !== 'opposed') onClose();
  };

  // RollSheet's finish transition (#1687): the SAME frozen face and degrees,
  // now carrying the entered totals. Only the two damage-dependent steps run
  // here — nothing else about the confirm sequence is repeated.
  const runFinish = (amounts) => {
    if (!attackSheet || finishedRef.current) return;
    finishedRef.current = true;
    const results = attackSheet.resolveWithAmounts(amounts);
    if (!results.length) return;
    const rayGroups = buildRayGroups(results, false);
    logRayGroupResults({ ...ctx, rayGroups, effectiveDefense });
    applyPostRollEffects({
      ...ctx, castCost, rayGroups, chainResults: null, hasChainStrike: false, damageProfile,
      setPersistentMap, addSaveRequest, applyEnemyCondition, revealFiredIwr,
      recordFor, mergeRecord,
    });
  };

  // MAP toggle — shown for Attack-trait abilities with an inline resolver, and for
  // strike chains (the child section applies the step to both strikes). The row
  // itself lives in useAbilityCastPlan; like rollSection it is a hoisted value
  // rendered in two branches below.
  const showMapToggle =
    (isAttack && rollProfile.mode === 'actor-roll' && resolverTargets.length > 0) || hasChainStrike;
  const mapSection = showMapToggle ? castPlan.mapRow : null;

  // The roll resolution section: inline resolver (actor-roll) or save-request info (target-save).
  // (The opposed-reaction resolver, #226-C, is `opposedSection` from
  // useOpposedReactionResolution above.)
  // Multi-ray attack spells render one resolver row per ray instead of a single roll.
  let rollSection = null;
  if (useRollSheet && !isMultiRay) {
    // The die entry, DC line, degrees and damage step all live on the sheet
    // itself now; what stays in this slot is the situational-toggle row, which
    // belongs to the edit panel beside the MAP row (handoff Screen 1, item 2).
    rollSection = attackSheet.togglesRow;
  } else if (useRollSheet && isMultiRay) {
    // Multi-ray's die entry (the sequential per-ray driver, #1691) lives in
    // the sheet's `dieSlot` instead of this editPanel slot — per-ray toggles
    // are owned by SequentialAttackSteps, one active set at a time.
    rollSection = null;
  } else if (rollProfile.mode === 'actor-roll' && resolverTargets.length > 0) {
    rollSection = isMultiRay ? (
      <MultiRayResolver
        ref={resolverRef}
        rayCount={rayCount}
        enemyTargets={resolverTargets}
        targetDefense={effectiveDefense}
        rollBonus={rollProfile.bonus}
        damage={damageProfile}
        degrees={ability.degrees}
        toggles={attackToggles}
        charId={character.id}
        rollFlavor={rollFlavor}
      />
    ) : (
      <TargetRollResolver
        ref={resolverRef}
        enemyTargets={resolverTargets}
        targetDefense={effectiveDefense}
        rollBonus={rollProfile.bonus}
        damage={damageProfile}
        degrees={ability.degrees}
        toggles={attackToggles}
        rangeByEntry={hasRangeData ? rangeByEntry : null}
        charId={character.id}
        rollFlavor={rollFlavor}
      />
    );
  } else if (rollProfile.mode === 'target-save' && saveTargets.length > 0) {
    const saveLabel = DEFENSE_LABELS[rollProfile.defense] || rollProfile.defense;
    rollSection = (
      <>
        <div className="ct-save-request-preview">
          <strong>Save request → GM:</strong> {saveLabel} DC {saveDc}
          <ul>
            {saveTargets.map((e) => (
              <li key={e.entryId}>{e.name}</li>
            ))}
          </ul>
        </div>
        {/* The rider checkboxes stay pre-commit on BOTH paths (they ride the
            request); only the sheet path loses the total input — its damage is
            rolled after the GM's degrees come back (#1689). */}
        {useSaveSheet ? saveSheet.ridersRow : (damageProfile && (
          <DamagePanel
            mode="save"
            profile={damageProfile}
            charId={character.id}
            flavor={rollFlavor}
            entered={saveDmgInput}
            onEntered={setSaveDmgInput}
            riderState={saveRiderState}
            onToggleRider={toggleSaveRider}
          />
        ))}
      </>
    );
  }

  // The render skeleton, unchanged (#1687): every gate section, every mechanic
  // section and the target picker keep their fixed slot and their owner. On the
  // attack path this whole block simply moves inside RollSheet's `editPanel`
  // disclosure instead of stacking above a footer button.
  const skeleton = (
    <>
      {/* Warn-not-hide (#1575 D1): the backstop for launch paths that bypass
          the deck's confirm sheet (prompts, stage bars, spell lists). The
          notice self-hides on-turn and for reaction-cost uses. */}
      <OutOfTurnNotice charId={character?.id} cost={explicitCost} />

      {/* Ability summary — meta, description, notes + the actions selector */}
      <AbilitySummarySection
        ability={ability}
        allyResistance={allyResistance}
        showsOmen={showsOmen}
        omen={omen}
        actionsSelector={castPlan.actionsSelector}
      />

      {/* Chamber selection (#676) — which loaded chamber to fire */}
      {chamberFireSection.section}

      {/* Frequency lock — derived from the synced ledger; GM can override or clear */}
      {frequencyGate.section}

      {/* Kinetic aura gate (#228) — impulses blocked while the aura is down */}
      {auraGate.section}

      {/* Harrow omen gate (#227) — omen-bound abilities need an active omen */}
      {omenGate.section}

      {/* Raised-shield gate (#228) — Devoted Guardian needs the shield up */}
      {shieldGate.section}

      {/* Target immunity — picked PC targets already immune to this ability */}
      {immunityGate.section}

      {/* Casting cost — source/rank picker, empty-pool block + override */}
      {castPlan.castSection}

      {/* Target concealment + condition flat checks (#262) */}
      {flatCheckSection.section}

      {/* Blood magic (#227) — bloodline spell cast: pick the rider */}
      {bloodMagicSection.section}

      {/* Rider choice (#225) — either/or rider picked at use time */}
      {riderChoiceSection.section}
      {/* Area placement (#1573 B3) — sits with the other target-set owners */}
      {placement.section}
      {secondaryProfiles.section}

      {/* Catalysts (#1209) — opt-in adds for this cast */}
      {catalystSection.section}

      {hasEffects && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Apply Effects</h3>

            <StaticEffectsList effects={effects} characterName={character.name} />

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

      <GrantActionsSection grants={grants} ability={ability} />

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
            <ChainedActionsSwitch
              ability={ability}
              character={character}
              chainRef={chainRef}
              hasChainStrike={hasChainStrike}
              hasChainSpell={hasChainSpell}
              effectiveCost={effectiveCost}
              enemyWithDefenses={enemyWithDefenses}
              activeConditions={activeConditions}
              activeEffects={activeEffects}
              mapStep={mapStep}
              mapSection={mapSection}
              rollSection={rollSection}
              exploit={exploitFor(character.id)}
              order={order}
              resources={resources}
              onTotalCostChange={castPlan.onSpellChainCostChange}
              onSpellChange={onChainSpellChange}
            />
          </section>
        </>
      )}
    </>
  );

  // Strip vocabulary shared by both sheet paths (#1687 / #1689). The strip and
  // the receipt read as prose (`1 action`); the commit pill keeps the footer
  // button's terse `(1)` so nothing about the cost display changes meaning.
  const costText = castPlan.costDisplayFinal;
  const costPhrase = /^\d+$/.test(String(costText))
    ? `${costText} action${costText === '1' ? '' : 's'}`
    : costText;

  // Hard blocks (handoff §Hard blocks): the confirmEnabled fold becomes ONE
  // tinted strip line that also freezes the die entry. The section that
  // explains each one still renders, unchanged, inside the edit panel. The
  // gate half is shared; the attack path prepends its own range clause.
  let gateBlockLine = null;
  if (!castGateOk) gateBlockLine = 'That casting pool is empty — open Edit to override.';
  else if (!frequencyGate.gateOk) gateBlockLine = 'Frequency limit reached — open Edit to override.';
  else if (!immunityGate.gateOk) gateBlockLine = 'A target is already immune — open Edit to override.';
  else if (!auraGate.gateOk) gateBlockLine = 'Your kinetic aura is down — open Edit.';
  else if (!shieldGate.gateOk) gateBlockLine = 'Your shield is not raised — open Edit.';
  else if (!omenGate.gateOk) gateBlockLine = 'No active harrow omen — open Edit.';
  else if (flatChecks.length > 0 && !allFlatChecksRolled) {
    gateBlockLine = 'Roll the flat check first — open Edit.';
  }

  // ── The multi-ray attack path: sequential per-ray driver (#1691) ──────────
  // LOCKED design: Phase 1 (roll) repeats once per ray inside `dieSlot`
  // (SequentialAttackSteps, via MultiRayResolver); its own grouped DamageEntry
  // rows ARE "the amount step, once, after the last ray" — resolved inline,
  // before the outer commit, so unlike the single-roll path there is no
  // deferred damage / separate RollSheet amount phase here. The commit pill
  // stays blocked until every ray reports in.
  if (useRollSheet && isMultiRay) {
    const targetNames = resolverTargets.map((e) => e.name).join(' + ');
    const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
    const summaryLine = [
      targetNames,
      costPhrase,
      rollProfile.bonus != null ? `attack ${signed(rollProfile.bonus)}` : null,
      mapStep ? `MAP ${mapPenaltyFor(ability, mapStep)}` : null,
      rayCount > 1 ? `${raysReady ? rayCount : 0}/${rayCount} rays rolled` : null,
    ].filter(Boolean).join(' · ');

    let blockLine = null;
    if (needsPicker && targets.length === 0) blockLine = 'Pick a target first.';
    else if (!raysReady) blockLine = gateBlockLine || `Roll every ray first (${rayCount} total).`;
    else blockLine = gateBlockLine;

    // Cosmetic-only row shape for RollSheet's OWN result/settled screens — the
    // real ray-grouped results (real entryIds) that feed runConfirm live in
    // `rayResultsRef`, snapshotted at commit time. A target hit by more than
    // one ray needs a unique React key, so the row's `entryId` is composite —
    // never read by the appliers, which consume `rayResultsRef` instead.
    const toRow = (r, rayIndex) => {
      const note = [
        rayCount > 1 ? `Ray ${rayIndex + 1}` : null,
        r.degree == null ? 'no DC available' : null,
        (r.degree && (ability.degrees?.[DEGREE_LABELS[r.degree]] || null)),
      ].filter(Boolean).join(' · ');
      return {
        entryId: `ray${rayIndex}-${r.entryId}`,
        name: r.name,
        dcLabel: r.dc != null ? `${DEFENSE_LABELS[effectiveDefense] || effectiveDefense} ${r.dc}` : '',
        degree: r.degree,
        ...(note ? { note } : {}),
      };
    };

    return (
      <RollSheet
        isOpen={isOpen}
        onClose={onClose}
        title={`${verb}: ${ability.name}`}
        themeColor={themeColor}
        summaryLine={summaryLine}
        blockLine={blockLine}
        editPanel={skeleton}
        charId={character.id}
        flavor={rollFlavor}
        // No single die on this sheet — SequentialAttackSteps owns every ray's
        // own d20 (and, once every ray reports in, the grouped damage entry).
        hasD20={false}
        dieSlot={
          <MultiRayResolver
            key={rayCount}
            ref={resolverRef}
            rayCount={rayCount}
            enemyTargets={resolverTargets}
            targetDefense={effectiveDefense}
            rollBonus={rollProfile.bonus}
            damage={damageProfile}
            degrees={ability.degrees}
            toggles={attackToggles}
            charId={character.id}
            rollFlavor={rollFlavor}
            onProgress={(done, total) => setRaysReady(done === total && total > 0)}
          />
        }
        commitLabel={`${verb} ${ability.name} (${costText})`}
        attack={effectiveDefense === 'ac'}
        // Commit is ONE moment, exactly like the single-roll path — the whole
        // confirm sequence fires here. Damage is already known (resolved
        // inline by SequentialAttackSteps), so deferDamage is always false.
        onCommit={() => {
          const grouped = resolverRef.current?.getResults() ?? [];
          rayResultsRef.current = grouped;
          const outcome = runConfirm({ results: grouped, deferDamage: false });
          if (outcome !== 'done') return [];
          return grouped.flatMap((g) => g.results.map((r) => toRow(r, g.rayIndex)));
        }}
        damageParts={null}
        receiptFor={() => (rayResultsRef.current || []).flatMap((g) => g.results.map((r) => {
          const dmgSuffix = r.damage?.final != null ? ` · damage ${formatDamageBreakdown(r.damage)}` : '';
          const rayPrefix = rayCount > 1 ? `Ray ${g.rayIndex + 1} — ` : '';
          return `${rayPrefix}${r.name} — ${degreeLabel(r.degree, { attack: effectiveDefense === 'ac' })}${dmgSuffix}`;
        }))}
        costLabel={costPhrase}
      />
    );
  }

  // ── The attack path: one two-phase sheet (#1687) ──────────────────────────
  if (useRollSheet && !isMultiRay) {
    const targetNames = resolverTargets.map((e) => e.name).join(' + ');
    const bonusLabel = effectiveDefense === 'ac' ? 'attack' : (rollProfile.skill || 'check');
    const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
    const summaryLine = [
      targetNames,
      costPhrase,
      attackSheet.bonus != null ? `${bonusLabel} ${signed(attackSheet.bonus)}` : null,
      mapStep ? `MAP ${mapPenaltyFor(ability, mapStep)}` : null,
    ].filter(Boolean).join(' · ');

    const outOfRangeName = resolverTargets
      .find((e) => rangeByEntry?.[e.entryId]?.beyondMaxRange)?.name;
    let blockLine = null;
    if (needsPicker && targets.length === 0) blockLine = 'Pick a target first.';
    else if (anyTargetOutOfRange) {
      blockLine = `${outOfRangeName || 'A target'} is out of range — open Edit to re-pick.`;
    } else blockLine = gateBlockLine;

    const dcLine = ['nothing rolled yet', ...resolverTargets.map((e) => {
      const dc = defenseDC(e.defenses, effectiveDefense);
      return dc != null ? `${e.name} ${DEFENSE_LABELS[effectiveDefense] || effectiveDefense} ${dc}` : null;
    }).filter(Boolean)].join(' · ');

    return (
      <RollSheet
        isOpen={isOpen}
        // Modal chrome (overlay / × / Escape) can leave a committed sheet at the
        // amount screen. The commit already spent the action, so swallowing the
        // roll line too would lose it outright — flush the deferred steps with
        // no totals instead. `runFinish` is ref-guarded, so a normal finish
        // followed by the settled Close never runs them twice.
        onClose={() => { if (deferredRef.current) runFinish({}); onClose(); }}
        title={`${verb}: ${ability.name}`}
        themeColor={themeColor}
        summaryLine={summaryLine}
        blockLine={blockLine}
        editPanel={skeleton}
        charId={character.id}
        flavor={rollFlavor}
        bonus={attackSheet.bonus}
        bonusLabel={bonusLabel}
        dcLine={dcLine}
        commitLabel={`${verb} ${ability.name} (${costText})`}
        attack={effectiveDefense === 'ac'}
        // Commit is ONE moment: the whole confirm sequence fires here, and the
        // rows it hands back are frozen for the rest of the sheet's life.
        onCommit={(face) => {
          const results = attackSheet.commit(face);
          const hits = results.some((r) => r.degree === 'success' || r.degree === 'criticalSuccess');
          const willAskAmount = !!attackSheet.damageParts && hits;
          const outcome = runConfirm({ face, results, deferDamage: willAskAmount });
          deferredRef.current = willAskAmount && outcome === 'done';
          return outcome === 'done' ? attackSheet.rowsFor(results) : [];
        }}
        damageParts={attackSheet.damageParts}
        amountExtras={attackSheet.amountExtras}
        breakdownFor={attackSheet.breakdownFor}
        onFinish={runFinish}
        costLabel={costPhrase}
      />
    );
  }

  // ── The save path: the full round trip (#1689) ────────────────────────────
  // Same shell, same skeleton, no die: the caster rolls nothing here. The
  // commit pushes the save request and parks on `waiting`; the GM's degrees
  // arrive on the encounter rail and become the result card; the damage step
  // follows THEM.
  if (useSaveSheet) {
    const saveLabel = DEFENSE_LABELS[rollProfile.defense] || rollProfile.defense;
    const summaryLine = [
      saveTargets.map((e) => e.name).join(' + '),
      costPhrase,
      // DEFENSE_LABELS already ends in "DC" (#1610).
      `${saveLabel} ${saveDc}`,
    ].filter(Boolean).join(' · ');
    const blockLine = (needsPicker && targets.length === 0)
      ? 'Pick a target first.'
      : gateBlockLine;

    return (
      <RollSheet
        isOpen={isOpen}
        // Leaving with an obligation outstanding is confirmed by closeGuard
        // below; `abandon` only records what the table lost, so a caster who
        // walks away never strands the targets silently.
        onClose={() => { saveSheet.abandon(); onClose(); }}
        title={`${verb}: ${ability.name}`}
        themeColor={themeColor}
        summaryLine={summaryLine}
        blockLine={blockLine}
        editPanel={skeleton}
        charId={character.id}
        flavor={rollFlavor}
        // No caster die on a save spell — the targets roll.
        hasD20={false}
        commitLabel={`${verb} ${ability.name} (${costText})`}
        saveMode
        // Commit is ONE moment here too: the whole confirm sequence (fx, log,
        // resource + action spends, the save request itself) fires exactly once
        // and hands back NO rows — the degrees are the GM's to send.
        onCommit={() => {
          const outcome = runConfirm({ face: null, results: null, deferDamage: false });
          if (outcome === 'done') {
            saveSheet.noteRequest(saveReqIdRef.current, ability.name);
          } else {
            // A failed condition flat check (#262) spends the action and
            // resolves nothing — there is no request to wait on.
            saveSheet.noteFizzle();
          }
          return null;
        }}
        resolvedResults={saveSheet.resolvedResults}
        headlineMath={saveSheet.headlineMath}
        damageParts={saveSheet.damageParts}
        amountDegrees={saveSheet.amountDegrees}
        amountHeading={saveSheet.amountHeading}
        breakdownFor={saveSheet.breakdownFor}
        ctaLabel="Roll damage"
        finishLabel="Send damage to GM"
        onFinish={saveSheet.onFinish}
        receiptFor={saveSheet.receiptFor}
        closeGuard={saveSheet.closeGuard}
        costLabel={costPhrase}
      />
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
      {skeleton}
      <div className="uam-footer">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          onClick={handleConfirm}
          disabled={!confirmEnabled}
          aria-label="confirm-cast"
        >
          {verb} ({castPlan.costDisplayFinal})
        </button>
      </div>
    </Modal>
  );
};

export default UseAbilityModal;
