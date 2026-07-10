import React, { useRef, useState, useCallback, useEffect } from 'react';
import Modal from '../shared/Modal';
import TargetPicker from './TargetPicker';
import TargetRollResolver from './TargetRollResolver';
import MultiRayResolver from './MultiRayResolver';
import DamagePanel from './DamagePanel';
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
import { abilityNeedsPicker } from '../../utils/applyAbility';
import { DEFENSE_LABELS } from '../../utils/defense';
import { resolveActionRoll } from '../../utils/rollResolution';
import { buildDamageProfile } from '../../utils/damage';
import { buildTargetSaveRequest } from '../../utils/saveRequest';
import { applyChainStrikeResults, applyChainSpellResults } from '../../utils/chainResultsAppliers';
import {
  buildRayGroups,
  applyCastRegistrations,
  applyEffectsOrLogGeneric,
  logRayGroupResults,
  applyPostRollEffects,
} from '../../utils/confirmAppliers';
import { buildAttackToggles } from '../../utils/attackToggles';
import { buildStrikeRangeGating } from '../../utils/strikeRangeGating';
import { PERSISTENT_KEY } from '../../utils/persistentDamage';
import { logThrownWeaponResolution } from '../../utils/thrownResolution';
import { isAttackAbility } from '../../utils/map';
import { toGameSeconds } from '../../utils/gameTime';
import { useRecallKnowledge } from '../../hooks/useRecallKnowledge';
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
  const { characters, effects: effectCatalog } = useContent();
  const { gameDate, time } = useGameDate();
  const { encounter, appendLog, addSaveRequest } = useEncounter();
  const { turnState, spendActions, spendReaction, recordAttack } =
    useTurnState(character?.id || 'nobody');
  const { exploitFor } = useExploitVulnerability();
  const { revealFiredIwr } = useIwrReveal();
  // Whetstone on-hit reveals (#1215 — Analysis Eye) write the creature's RK
  // record directly (one weakness/resistance, not damage-fired).
  const { recordFor, mergeRecord } = useRecallKnowledge();

  const resolverRef = useRef(null);
  const chainRef    = useRef(null);

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
  const flatCheckSection = useFlatCheckSection({ ability, activeConditions, isAttack, effectiveVerb });
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

  const handleConfirm = () => {
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

    // Shared applier context (#1317 D4) — every confirm-time applier
    // destructures the keys it needs from this bag plus call-specific extras;
    // unused keys are harmless.
    const ctx = {
      ability, character, caster: character, casterEntryId, order, encounter,
      characters, getState, sendUpdate, appendLog, effectiveVerb, nowSecs,
    };

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
      return;
    }

    const rawResults   = resolverRef.current?.getResults() ?? null;
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
      onClose();
      return;
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
    logRayGroupResults({ ...ctx, rayGroups, effectiveDefense });

    // Log chained strike results (Inner Upheaval and similar; extracted #1317
    // D3): per-target totals (#222) with the static dice string as fallback,
    // plus the Flurry of Blows combined-damage line.
    if (chainResults && hasChainStrike) {
      applyChainStrikeResults(chainResults, ctx);
    }

    // Post-roll effect riders (extracted #1317 D4): persistent-damage tracking
    // (#272), the typed damage relay + IWR reveal-on-trigger (#1016/#1014),
    // whetstone on-hit riders (#1215) and triggered whetstone saves (#1216).
    applyPostRollEffects({
      ...ctx, castCost, rayGroups, chainResults, hasChainStrike, damageProfile,
      setPersistentMap, addSaveRequest, applyEnemyCondition, revealFiredIwr,
      recordFor, mergeRecord,
    });

    // Push a save request to the GM for target-save abilities (builder
    // extracted #1317 D3). When a damage profile exists (#270), the caster's
    // entered total and rider snapshot travel with it — RequestedSaves derives
    // per-degree totals GM-side.
    const saveRequest = buildTargetSaveRequest({
      ...ctx, rollProfile, saveTargets, damageProfile, saveDmgInput,
      saveRiderState, saveDc, directCastRank,
    });
    if (saveRequest) addSaveRequest(saveRequest);

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

    onClose();
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
        toggles={attackToggles}
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
        {damageProfile && (
          <DamagePanel
            mode="save"
            profile={damageProfile}
            entered={saveDmgInput}
            onEntered={setSaveDmgInput}
            riderState={saveRiderState}
            onToggleRider={toggleSaveRider}
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
