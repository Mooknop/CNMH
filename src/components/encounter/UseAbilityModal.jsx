import React, { useRef, useState, useCallback } from 'react';
import Modal from '../shared/Modal';
import TargetPicker from './TargetPicker';
import TargetRollResolver from './TargetRollResolver';
import MultiRayResolver from './MultiRayResolver';
import ChainedStrikeSection from './ChainedStrikeSection';
import ChainedSpellSection from './ChainedSpellSection';
import HeightenedNotes from './HeightenedNotes';
import { useSession } from '../../contexts/SessionContext';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useTargeting } from '../../hooks/useTargeting';
import { useEffects } from '../../hooks/useEffects';
import { useCastingResources } from '../../hooks/useCastingResources';
import { useFrequency } from '../../hooks/useFrequency';
import { useExploitVulnerability } from '../../hooks/useExploitVulnerability';
import { useSyncedState } from '../../hooks/useSyncedState';
import { applyAbility, applyAbilityImmunity, applyRiderChoice, abilityNeedsPicker } from '../../utils/applyAbility';
import { immunityConfigFor } from '../../utils/immunity';
import { expiryLabelSecs } from '../../utils/expiry';
import { DEFENSE_LABELS } from '../../utils/defense';
import { resolveActionRoll } from '../../utils/rollResolution';
import { buildDamageProfile, formatDamageBreakdown } from '../../utils/damage';
import { isAttackAbility, mapStepFor, mapPenaltyFor } from '../../utils/map';
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
  const { characters } = useContent();
  const { gameDate, time } = useGameDate();
  const { encounter, appendLog, addSaveRequest } = useEncounter();
  const { turnState, spendActions, spendReaction, recordAttack } =
    useTurnState(character?.id || 'nobody');
  const { gateFor, record: recordFreqUse, clear: clearFreqLock } =
    useFrequency(character?.id || 'nobody');
  const { exploitFor } = useExploitVulnerability();

  const resolverRef = useRef(null);
  const chainRef    = useRef(null);

  // Tracks the spell-chain total cost so the confirm button label stays accurate.
  const [spellChainTotalCost, setSpellChainTotalCost] = useState(null);
  const onSpellChainCostChange = useCallback((cost) => setSpellChainTotalCost(cost), []);

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

  // Target-immunity gate (#218) — override when all picked targets are immune.
  const [immunityOverride, setImmunityOverride] = useState(false);

  // Rider choice (#225) — which either/or rider option is picked. null =
  // default to the first available option.
  const [riderChoiceId, setRiderChoiceId] = useState(null);

  // Read the actor's active conditions and effects (same sources StatsBlock uses).
  const [activeConditions] = useSyncedState(`cnmh_conditions_${character?.id || ''}`, []);
  const { effects: activeEffects } = useEffects(character?.id || '');

  const order = encounter?.order || [];

  const { targets, selectable, isTargeted, toggleTarget } =
    useTargeting(character?.id || '', order, { includeSelf: true });

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
  const immuneTargets = immunityConfig
    ? targetCharIds
        .map((cid) => {
          const tEffects = getState(cid, 'effects') || [];
          const immune = tEffects.find(
            (e) => e.effectId === 'ability-immunity'
              && e.abilityKey === freqKeyFor(ability)
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
  const isAttack = isAttackAbility(ability);
  const autoStep = mapStepFor(turnState?.attacksMade ?? 0);
  const mapStep  = mapOverride ?? autoStep;

  // Resolve roll profile — includes condition/effect netting for the actor.
  const rollProfile = resolveActionRoll(ability, character, {
    conditions: activeConditions || [],
    effects: activeEffects || [],
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

  // The rank this cast happens at (#235): the chosen slot option's rank, or
  // the spell's native rank for free/focus casts. Non-spell actions: none.
  const directCastRank = selectedCastOption?.rank
    ?? (effectiveVerb === 'cast' && typeof ability.level === 'number' && ability.level > 0
      ? ability.level
      : undefined);

  // Damage step (#222) — AC attacks resolved inline (single-roll and multi-ray;
  // chained strikes build their own per-strike profile). The profile carries the
  // dice hint (heightened at the cast rank) plus rider toggles, including the
  // actor's active exploit weakness.
  const damageProfile = (rollProfile.mode === 'actor-roll'
    && effectiveDefense === 'ac'
    && resolverTargets.length > 0)
    ? buildDamageProfile(ability, character, {
        chosenActions: typeof castCost === 'number' ? castCost : null,
        castRank: directCastRank,
        exploit: exploitFor(character.id),
        enemyEntries: resolverTargets,
        order,
      })
    : null;

  // For target-save: enemy targets whose save mod we can read (used in the save request).
  const saveTargets = rollProfile.mode === 'target-save'
    ? selectedEntries.filter((e) => e.kind === 'enemy')
    : [];

  // Block the cast while the chosen pool is empty, unless overridden.
  const castGateOk =
    castOptions.length === 0 || selectedCastOption?.enabled || castOverride;

  const confirmEnabled =
    (!needsPicker || targets.length > 0) && castGateOk && freqGateOk && immunityGateOk;

  const charName = (charId) => characters.find((c) => c.id === charId)?.name || charId;

  const handleConfirm = () => {
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
        // Only when heightened above native — native casts keep their log text.
        rank: directCastRank > (ability.level || 0) ? directCastRank : undefined,
        nowSecs,
      });
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

    // Push a save request to the GM for target-save abilities.
    if (rollProfile.mode === 'target-save' && saveTargets.length > 0 && rollProfile.dc != null) {
      const targets = saveTargets.map((e) => ({
        entryId: e.entryId,
        name: e.name,
        saveMod: e.defenses?.saves?.[rollProfile.defense] ?? null,
      }));
      addSaveRequest({
        casterId: character.id,
        casterName: character.name,
        abilityName: ability.name,
        save: rollProfile.defense,
        dc: saveDc,
        basic: !!(ability.basic),
        rank: directCastRank,
        targets,
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
        chainResults.rollResults.forEach((r) => {
          const degreeLabel = r.degree
            ? ({ criticalSuccess: 'Critical Hit', success: 'Hit', failure: 'Miss', criticalFailure: 'Critical Miss',
                 ...{ criticalSuccess: 'Critical Success', success: 'Success', failure: 'Failure', criticalFailure: 'Critical Failure' } }[r.degree] || r.degree)
            : null;
          appendLog({
            type: 'action', charId: character.id,
            text: degreeLabel
              ? `${character.name} ${effectiveVerb} ${ability.name} → ${label} vs ${r.name}: ${r.total} → ${degreeLabel}`
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
      <div className="ct-save-request-preview" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        <strong>Save request → GM:</strong> {saveLabel} DC {saveDc}
        <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
          {saveTargets.map((e) => (
            <li key={e.entryId}>{e.name}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${verb}: ${ability.name}`}
      themeColor={themeColor}
      maxWidth="560px"
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

            {needsPicker && (
              <TargetPicker
                selectable={selectable}
                isTargeted={isTargeted}
                onToggle={toggleTarget}
              />
            )}
            {mapSection}
            {rollSection}
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

      {!hasEffects && (
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
                  {ability.chain.modes?.includes('flurry') ? 'Strike or Flurry of Blows' : 'Strike'}
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
