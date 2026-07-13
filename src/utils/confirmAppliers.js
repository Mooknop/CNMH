import { DEGREE_LABELS, ATTACK_DEGREE_LABELS } from './degreeDisplay';
import { DEFENSE_LABELS } from './defense';
import { formatDamageBreakdown } from './damage';
import { applyAbility } from './applyAbility';
import { lingeringDurationOverride } from './lingering';
import { isSustainedSpell, registerSustain } from './sustain';
import { markPlayingOnCast } from './playing';
import { hasSpellCounter, registerSpellCounter } from './spellCounter';
import { applyPersistentFromResults } from './persistentDamage';
import { relayDamageAndRevealIwr } from './damageRelay';
import { applyWhetstoneOnHit, applyWhetstoneReactionAndCrit } from './whetstoneOnHit';
import { applyStrikeOnCritSave, applyStrikeOnCritConditions, applyStrikeOnHitConditions } from './strikeOnCrit';
import { APP, syncKey } from '../sync/keys';

// Confirm-time appliers (extracted #1317 D4) — the remaining verbatim blocks
// of UseAbilityModal's handleConfirm that need no modal state beyond the
// explicit ctx bag, following the chainResultsAppliers.js pattern (D3). The
// orchestrator keeps only sequencing: the two early returns, the suffix
// collector, the cost spend and the MAP recordAttack.

/**
 * Normalise resolver output into ray groups so single-roll and multi-ray casts
 * share one logging path. Single-roll returns a flat result array → one group
 * with rayIndex null (no "ray N" prefix). Multi-ray returns [{ rayIndex, results }].
 */
export const buildRayGroups = (rawResults, isMultiRayResult) => {
  if (!rawResults) return [];
  return isMultiRayResult
    ? rawResults
    : (rawResults.length ? [{ rayIndex: null, results: rawResults }] : []);
};

/**
 * Cast-time registrations: the sustained-spell ledger (#220), the 'while
 * playing' composition mark (#935) and per-spell counters (#220 — Mirror
 * Image images, Bless emanation radius).
 *
 * @param {Object} ctx - { ability, caster, casterEntryId, encounter,
 *   directCastRank, foundryAuthoritative, getState, sendUpdate, appendLog }
 */
export const applyCastRegistrations = ({
  ability,
  caster,
  casterEntryId,
  encounter,
  directCastRank,
  foundryAuthoritative,
  getState,
  sendUpdate,
  appendLog,
}) => {
  // Sustained spells (#220) — register on the caster's ledger so the turn
  // tracker can prompt "Sustain a Spell" each turn. Only in an active
  // encounter, where turn-start prompts exist.
  if (isSustainedSpell(ability) && encounter?.phase === 'in-progress' && casterEntryId) {
    registerSustain({
      ability,
      caster,
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

  // 'While playing' (#935) — a Composition cast marks the caster playing
  // through the end of their next turn; the turn-boundary sweep lapses it.
  markPlayingOnCast({ ability, caster, casterEntryId, encounter, sendUpdate, appendLog });

  // Per-spell counters (#220) — Mirror Image images, Bless emanation radius.
  // Not turn-bound, so registered on any cast (the EffectsPanel surfaces them).
  if (hasSpellCounter(ability)) {
    registerSpellCounter({
      ability,
      caster,
      round: encounter?.round,
      getState,
      sendUpdate,
    });
  }
};

/**
 * Apply the ability's structured effects[] / grants[] (with the Lingering
 * Composition extension, #226-B) — or, for abilities without them, write the
 * generic action log line, omitting enemies whose roll result gets its own
 * dedicated line below.
 *
 * @returns {boolean} suffixLogged — whether the resource suffix already landed
 *   on a log line (the orchestrator otherwise appends a dedicated entry).
 */
export const applyEffectsOrLogGeneric = ({
  hasEffects,
  ability,
  caster,
  casterEntryId,
  targetCharIds,
  enemyTargetNames,
  selectedEntries,
  rayGroups,
  order,
  encounter,
  characters,
  getState,
  sendUpdate,
  appendLog,
  effectiveVerb,
  directCastRank,
  nowSecs,
  foundryAuthoritative,
  sourceSuffix,
}) => {
  // Entry IDs of enemies whose result has a degree (they get a dedicated log line).
  const coveredByRoll = new Set(
    rayGroups.flatMap((g) => g.results.filter((r) => r.degree != null).map((r) => r.entryId))
  );

  if (hasEffects) {
    // Lingering Composition (#226-B): a pending extension on the caster
    // lengthens this composition's effect, then is consumed.
    const lingering = getState(caster.id, APP.LINGERING);
    const effectDurationOverride = lingeringDurationOverride(ability, lingering) || undefined;

    applyAbility({
      ability,
      caster,
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
      try { window.localStorage.setItem(syncKey(APP.LINGERING, caster.id), JSON.stringify(null)); } catch { /* noop */ }
      sendUpdate(caster.id, APP.LINGERING, null);
      appendLog({
        type: 'action',
        charId: caster.id,
        text: `${caster.name}'s ${ability.name} is extended to ${effectDurationOverride.rounds} rounds (Lingering Composition)`,
      });
    }
    return false;
  }

  // Generic action log — omit enemies whose roll result will be logged below.
  const charName = (charId) => characters.find((c) => c.id === charId)?.name || charId;
  const genericNames = [
    ...targetCharIds.map(charName),
    ...selectedEntries
      .filter((e) => e.kind === 'enemy' && !coveredByRoll.has(e.entryId))
      .map((e) => e.name),
  ].join(', ');
  if (genericNames || coveredByRoll.size === 0) {
    appendLog({
      type:   'action',
      charId: caster.id,
      text:   (genericNames
        ? `${caster.name} ${effectiveVerb} ${ability.name} on ${genericNames}`
        : `${caster.name} ${effectiveVerb} ${ability.name}`) + sourceSuffix,
    });
    return !!sourceSuffix;
  }
  return false;
};

/**
 * Log each rolled ray-group result: per-target degree line with the damage
 * total and rider breakdown (#222) and the applied situational-bonus
 * reasons (#274).
 */
export const logRayGroupResults = ({
  rayGroups,
  character,
  ability,
  effectiveVerb,
  effectiveDefense,
  appendLog,
}) => {
  if (!rayGroups.length) return;
  const defLabel = DEFENSE_LABELS[effectiveDefense] || effectiveDefense;
  const degreeMap = effectiveDefense === 'ac' ? ATTACK_DEGREE_LABELS : DEGREE_LABELS;
  rayGroups.forEach((g) => {
    const rayPrefix = g.rayIndex != null ? ` — ray ${g.rayIndex + 1}` : '';
    g.results.forEach((r) => {
      if (!r.degree) return;
      const degreeLabel = degreeMap[r.degree] || r.degree;
      // Damage step result (#222): per-target total with the rider breakdown.
      const dmgSuffix = r.damage?.final != null
        ? ` · damage ${formatDamageBreakdown(r.damage)}`
        : '';
      // Situational bonus reason (#274): note the applied circumstance toggles.
      const adjustSuffix = r.adjust
        ? ` (incl. ${r.adjust > 0 ? '+' : ''}${r.adjust}: ${(r.adjustSources || []).join(', ')})`
        : '';
      appendLog({
        type:   'action',
        charId: character.id,
        text:   `${character.name} ${effectiveVerb} ${ability.name}${rayPrefix} vs ${r.name} (${defLabel} ${r.dc}): ${r.total} → ${degreeLabel}${adjustSuffix}${dmgSuffix}`,
      });
    });
  });
};

/**
 * Post-roll effect riders, in their fixed sequence: persistent-damage
 * tracking (#272), the typed damage relay + IWR reveal-on-trigger
 * (#1016/#1014), whetstone on-hit riders (#1215) and the triggered whetstone
 * saves (#1216).
 */
export const applyPostRollEffects = ({
  ability,
  character,
  castCost,
  rayGroups,
  chainResults,
  hasChainStrike,
  order,
  damageProfile,
  setPersistentMap,
  getState,
  sendUpdate,
  appendLog,
  addSaveRequest,
  applyEnemyCondition,
  revealFiredIwr,
  recordFor,
  mergeRecord,
}) => {
  const strikeChainResults = hasChainStrike ? chainResults : null;

  // Persistent-damage tracking (#272): record each target's persistent
  // entries (already crit-doubled by computeTargetDamage) so the turn
  // tracker chips them and the watcher reminds at their turn end.
  applyPersistentFromResults({
    rayGroups,
    chainResults: strikeChainResults,
    abilityName: ability.name,
    setPersistentMap,
  });

  // Typed damage relay (#1016) + reveal-on-trigger (#1014): push each enemy
  // target's RAW typed total to the bridge (Foundry nets the monster's IWR)
  // and stamp any IWR that just fired into the RK record.
  relayDamageAndRevealIwr({
    rayGroups,
    chainResults: strikeChainResults,
    order,
    typeLabel: damageProfile?.typeLabel ?? null,
    sourceName: ability.name,
    sendUpdate,
    revealFiredIwr,
  });

  // Whetstone on-hit riders (#1215) — Analysis Eye / Leeching Fangs /
  // Limning Gem fire off successful results.
  applyWhetstoneOnHit({
    ability,
    character,
    rayGroups,
    chainResults: strikeChainResults,
    order,
    getState,
    sendUpdate,
    appendLog,
    applyEnemyCondition,
    recordFor,
    mergeRecord,
  });

  // Triggered whetstone saves (#1216) — Reactive Flash (reaction Strike) and
  // Chroma Kaleidoscope (critical Strike) push saves to the GM rail.
  applyWhetstoneReactionAndCrit({
    ability,
    character,
    castCost,
    rayGroups,
    chainResults: strikeChainResults,
    order,
    addSaveRequest,
    appendLog,
  });

  // Intrinsic on-crit save riders (#1439 — Serpent Dagger): a Strike that
  // inflicts a condition on a critical hit, gated by a fixed-DC save, pushes it
  // to the GM rail (the intrinsic-weapon mirror of the Chroma Kaleidoscope crit).
  applyStrikeOnCritSave({
    ability,
    character,
    rayGroups,
    chainResults: strikeChainResults,
    order,
    addSaveRequest,
    appendLog,
  });

  // Intrinsic on-crit conditions with no save (#1439 tail — alchemical bombs):
  // the condition applies straight to the enemy on a critical hit.
  applyStrikeOnCritConditions({
    ability,
    rayGroups,
    chainResults: strikeChainResults,
    order,
    applyEnemyCondition,
    appendLog,
  });

  // Intrinsic on-hit conditions (#1439 tail — alchemical bottles/grenades): the
  // condition applies to the enemy on any hit (success or crit).
  applyStrikeOnHitConditions({
    ability,
    rayGroups,
    chainResults: strikeChainResults,
    order,
    applyEnemyCondition,
    appendLog,
  });
};
