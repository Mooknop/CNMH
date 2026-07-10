import { applyHealing } from './consumables';
import { rkKeyFor, revealOneIwr } from './recallKnowledge';
import { getClassDC } from './CharacterUtils';
import { calculateSpellStats } from './SpellUtils';

// Whetstone confirm-time automations (#1215/#1216) — the bound whetstone's
// riders fire off the confirmed Strike results. Pure appliers: all state
// (session, log, RK record, enemy conditions, GM save rail) arrives via the
// explicit argument bag, so the modal's handleConfirm stays a single call.

// Flat list of every per-target result: ray groups ([{ rayIndex, results }] —
// single-roll casts arrive as one group) plus chained-strike rolls. Callers
// pass chainResults only for strike chains (null otherwise).
const strikeResults = (rayGroups, chainResults) => [
  ...(rayGroups || []).flatMap((g) => g?.results || []),
  ...((chainResults?.rolls || []).flat()),
];

/**
 * Whetstone on-hit riders (#1215) — the bound whetstone's confirm-time
 * automations fire off successful results: Analysis Eye learns one
 * weakness/resistance, Leeching Fangs heals half the damage dealt,
 * Limning Gem lights the target up (+ a reminder note).
 */
export const applyWhetstoneOnHit = ({
  ability,
  character,
  rayGroups,
  chainResults,
  order,
  getState,
  sendUpdate,
  appendLog,
  applyEnemyCondition,
  recordFor,
  mergeRecord,
}) => {
  const wsOnHit = ability.whetstoneOnHit;
  if (!wsOnHit) return;
  const hitResults = strikeResults(rayGroups, chainResults)
    .filter((r) => r?.degree === 'success' || r?.degree === 'criticalSuccess');
  if (!hitResults.length) return;
  if (wsOnHit.healHalf) {
    const dealt = hitResults.reduce((sum, r) => sum + (r.damage?.final || 0), 0);
    const heal = Math.floor(dealt / 2);
    if (heal > 0) {
      applyHealing({
        target: { id: character.id, name: character.name, maxHp: character.maxHp },
        amount: heal,
        getState,
        sendUpdate,
        appendLog,
        logText: `${wsOnHit.itemName}: ${character.name} heals ${heal} HP (half of ${dealt} dealt — living targets only)`,
      });
    }
  }
  if (wsOnHit.revealIwr) {
    hitResults.forEach((r) => {
      const entry = (order || []).find((e) => e.entryId === r.entryId);
      if (!entry || entry.kind !== 'enemy') return;
      const key = rkKeyFor(entry);
      if (!key) return;
      const { revealed, fresh } = revealOneIwr(recordFor(key), entry.defenses);
      if (!revealed) {
        appendLog({
          type: 'system',
          text: `${wsOnHit.itemName}: ${entry.name} has no weakness or resistance to learn.`,
        });
        return;
      }
      mergeRecord(key, (prev) => revealOneIwr(prev, entry.defenses).record);
      if (fresh) {
        appendLog({
          type: 'system',
          text: `${wsOnHit.itemName}: ${entry.name}'s ${revealed.kind} to ${revealed.type} is revealed!`,
        });
      }
    });
  }
  if (wsOnHit.condition) {
    hitResults.forEach((r) => {
      const entry = (order || []).find((e) => e.entryId === r.entryId);
      if (!entry || entry.kind !== 'enemy') return;
      applyEnemyCondition(r.entryId, { id: wsOnHit.condition, source: wsOnHit.itemName });
      appendLog({
        type: 'system',
        text: `${wsOnHit.itemName}: ${entry.name} is ${wsOnHit.condition}`,
      });
    });
  }
  if (wsOnHit.note) {
    appendLog({ type: 'action', charId: character.id, text: `${wsOnHit.itemName}: ${wsOnHit.note}` });
  }
};

/**
 * Triggered whetstone saves (#1216). Reactive Flash: a Strike made as a
 * reaction forces every target's save — pushed to the GM rail with a note
 * to resolve it BEFORE applying the attack (a failure means off-guard, −2
 * AC vs this Strike). Chroma Kaleidoscope: a critical Strike forces a save
 * vs the wielder's class/spell DC (higher); per-degree conditions ride the
 * request for RequestedSaves to apply on resolution.
 */
export const applyWhetstoneReactionAndCrit = ({
  ability,
  character,
  castCost,
  rayGroups,
  chainResults,
  order,
  addSaveRequest,
  appendLog,
}) => {
  const wsReaction = ability.whetstoneReactionSave;
  const wsCrit = ability.whetstoneOnCrit;
  if (!wsReaction && !wsCrit) return;
  const allStrikeResults = strikeResults(rayGroups, chainResults);
  const saveTargetsFor = (rs, save) => rs
    .map((r) => {
      const entry = (order || []).find((e) => e.entryId === r.entryId);
      return entry
        ? { entryId: entry.entryId, name: entry.name, saveMod: entry.defenses?.saves?.[save] ?? null }
        : null;
    })
    .filter(Boolean);
  if (wsReaction && castCost === 'reaction' && allStrikeResults.length) {
    const save = wsReaction.save || 'reflex';
    addSaveRequest({
      casterId: character.id,
      casterName: character.name,
      abilityName: wsReaction.itemName,
      save,
      dc: wsReaction.dc,
      basic: false,
      targets: saveTargetsFor(allStrikeResults, save),
      ...(wsReaction.conditions ? { conditions: wsReaction.conditions } : {}),
    });
    appendLog({
      type: 'system',
      text: `${wsReaction.itemName}: resolve the target's ${save} save (DC ${wsReaction.dc}) BEFORE applying this reaction Strike — on a failure the target is off-guard against it.`,
    });
  }
  if (wsCrit) {
    const crits = allStrikeResults.filter((r) => r.degree === 'criticalSuccess');
    if (crits.length) {
      const save = wsCrit.save || 'will';
      const dc = wsCrit.dcFrom === 'classOrSpellDC'
        ? Math.max(getClassDC(character) || 0, calculateSpellStats(character).spellDC || 0)
        : wsCrit.dc;
      addSaveRequest({
        casterId: character.id,
        casterName: character.name,
        abilityName: wsCrit.itemName,
        save,
        dc,
        basic: false,
        targets: saveTargetsFor(crits, save),
        ...(wsCrit.conditions ? { conditions: wsCrit.conditions } : {}),
      });
    }
  }
};
