import { DEGREE_LABELS, ATTACK_DEGREE_LABELS } from './degreeDisplay';
import { formatDamageBreakdown } from './damage';
import { HARROW_CAST_DC } from './harrow';
import { applyAbility } from './applyAbility';
import { applyHealing } from './consumables';
import { buildChainSelfEffect } from './spellshapeTransform';
import { APP, syncKey } from '../sync/keys';

// Chained-ability consumption appliers (extracted #1317 D3) — the confirm-time
// blocks that consume a ChainedStrikeSection / ChainedSpellSection result.
// Pure appliers: all state (session, log, GM save rail, casting resources, the
// harrow omen) arrives via the explicit ctx bag, so the modal's handleConfirm
// stays a single call per chain kind. The MAP recordAttack and the chain
// total-cost spend stay in the orchestrator — core turn sequencing.

/**
 * Log chained strike results (Inner Upheaval and similar). Results with a
 * resolved damage entry log the real per-target total (#222); the static
 * dice string stays as the fallback when no total was entered.
 *
 * @param {Object} chainResults - ChainedStrikeSection#getResults()
 * @param {Object} ctx - { character, ability, effectiveVerb, appendLog }
 */
export const applyChainStrikeResults = (chainResults, { character, ability, effectiveVerb, appendLog }) => {
  const strikeLabel = chainResults.mode === 'flurry' ? 'Flurry of Blows' : chainResults.strikeName;
  chainResults.rolls.forEach((rollSet, rollIdx) => {
    if (!rollSet) return;
    const strikeNum = chainResults.mode === 'flurry' ? ` (${rollIdx + 1})` : '';
    rollSet.forEach((r) => {
      const degreeLabel = r.degree
        ? (ATTACK_DEGREE_LABELS[r.degree] || r.degree)
        : null;
      const dmgText = r.damage?.final != null
        ? ` · damage ${formatDamageBreakdown(r.damage)}`
        : ` · dmg ${chainResults.damage}`;
      // Situational bonus reason (#511): note any applied circumstance toggles,
      // mirroring the single-roll resolver's log suffix (#274).
      const adjustSuffix = r.adjust
        ? ` (incl. ${r.adjust > 0 ? '+' : ''}${r.adjust}: ${(r.adjustSources || []).join(', ')})`
        : '';
      const resultText = degreeLabel
        ? `${character.name} ${effectiveVerb} ${ability.name} — ${strikeLabel}${strikeNum} vs ${r.name} (AC ${r.dc}): ${r.total} → ${degreeLabel}${adjustSuffix}${dmgText}`
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
};

/**
 * Consume a chained spell cast (Reach Spell, Harrow Casting, etc.): spend the
 * casting resource the section picked (#235), log per-ray results (#581) with
 * the Split Shot second-target note (#227), push the chained save request,
 * apply Harrow Casting's drawn-card mechanics (#227) and the spellshape
 * self-effect (#1001 S2).
 *
 * @param {Object} chainResults - ChainedSpellSection#getResults()
 * @param {Object} ctx - { character, ability, effectiveVerb, casterEntryId,
 *   targetCharIds, order, encounter, characters, getState, sendUpdate,
 *   appendLog, addSaveRequest, resources, omen, nowSecs }
 */
export const applyChainSpellResults = (chainResults, {
  character,
  ability,
  effectiveVerb,
  casterEntryId,
  targetCharIds,
  order,
  encounter,
  characters,
  getState,
  sendUpdate,
  appendLog,
  addSaveRequest,
  resources,
  omen,
  nowSecs,
}) => {
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
    const chainDegreeMap = chainResults.rollProfile?.defense === 'ac' ? ATTACK_DEGREE_LABELS : DEGREE_LABELS;
    // Multi-ray chained casts (#581, Blazing Bolt) return grouped results
    // [{rayIndex, results}]; single-roll casts return a flat array. Normalise
    // to ray groups so both share one logging path (mirrors the direct path).
    const chainRayGroups = chainResults.multiRay
      ? chainResults.rollResults
      : [{ rayIndex: null, results: chainResults.rollResults }];
    chainRayGroups.forEach((g) => {
      const rayPrefix = g.rayIndex != null ? ` — ray ${g.rayIndex + 1}` : '';
      g.results.forEach((r) => {
        const degreeLabel = r.degree ? (chainDegreeMap[r.degree] || r.degree) : null;
        // Split Shot (#227): the designated second target takes half damage.
        const isSplitSecondary = chainResults.splitShot?.secondaryEntryId === r.entryId;
        const splitSuffix = isSplitSecondary
          ? ' · second target — half damage, no other effects'
          : '';
        // Damage step result (#571): per-target total with the rider breakdown.
        // Suppressed on the Split Shot second target — its damage is halved and
        // the note above already says so, so the full number would mislead.
        const dmgSuffix = (r.damage?.final != null && !isSplitSecondary)
          ? ` · damage ${formatDamageBreakdown(r.damage)}`
          : '';
        appendLog({
          type: 'action', charId: character.id,
          text: degreeLabel
            ? `${character.name} ${effectiveVerb} ${ability.name} → ${label}${rayPrefix} vs ${r.name}: ${r.total} → ${degreeLabel}${dmgSuffix}${splitSuffix}`
            : `${character.name} ${effectiveVerb} ${ability.name} → ${label}${rayPrefix}`,
        });
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
      basic: !!chainResults.spellBasic,
      rank: chainResults.castRank > 0 ? chainResults.castRank : undefined,
      targets: chainResults.saveTargets.map((e) => ({
        entryId: e.entryId, name: e.name,
        saveMod: e.defenses?.saves?.[chainResults.rollProfile.defense] ?? null,
      })),
      ...(chainResults.damage && { damage: chainResults.damage }),
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

  // Spellshape self-effect (#1001 S2): a chained spellshape can grant the
  // caster a buff parametrized by the chained spell's rank + a chosen
  // descriptor (Energy Ablation — resistance vs a chosen energy type = the
  // spell's rank, until the end of your next turn). Inline modifiers, so it
  // can't ride applyAbility's static-catalog path.
  const chainSelfEffect = ability.chain?.selfEffect
    ? buildChainSelfEffect({
        selfEffect: ability.chain.selfEffect,
        castRank: chainResults.castRank,
        choice: chainResults.selfEffectChoice,
        caster: character,
        abilityName: ability.name,
        casterEntryId,
        encounter,
        nowSecs,
      })
    : null;
  if (chainSelfEffect) {
    const nextEffects = [...(getState(character.id, APP.EFFECTS) || []), chainSelfEffect];
    try {
      window.localStorage.setItem(syncKey(APP.EFFECTS, character.id), JSON.stringify(nextEffects));
    } catch { /* noop */ }
    sendUpdate(character.id, APP.EFFECTS, nextEffects);
    const m = chainSelfEffect.modifiers[0];
    appendLog({
      type: 'action', charId: character.id,
      text: `${character.name} gains ${chainSelfEffect.name || 'a spellshape effect'} (${m.stat} ${m.amount} vs ${m.vs})`,
    });
  }
};
