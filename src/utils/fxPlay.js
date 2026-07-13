// FX animation catalog resolver + emits (#1416/#1461-era A4, epic #1414).
//
// The fxAnimations content collection is an ordered rule list:
//   { id, priority?, when: { <fact>: <value>, ... }, play: { shape, file, opts? } }
// Rules sort by ascending priority (missing = 1000) and the FIRST rule whose
// every `when` field strictly equals the ability's facts wins — per-ability
// signature rules sit at low priority numbers above the family defaults. Even
// the defaults are content: retuning or adding an animation is a content
// edit, never an app deploy. `play` is the resolved recipe the bridge
// interprets (foundry-bridge/animations.js): `shape` from its vocabulary,
// `file` a Sequencer database key.
//
// Two emit seams, one catalog:
//   - emitAbilityFxPlay — UseAbilityModal confirm (applyPostRollEffects):
//     strikes and attack-roll spells, animating HIT targets.
//   - save spells resolve GM-side (RequestedSaves), so the CASTER's client
//     resolves the rule at request-build time (resolveSaveRequestFx — where
//     the catalog and ability live) and the recipe rides the save request;
//     emitSaveFxPlay fires it when the GM resolves, animating every target
//     (they're in the area regardless of their save).
//
// Fire-and-forget juice (same contract as the bridge half): no catalog, no
// matching rule, no targets, or no relay → silently emit nothing. Nothing may
// gate on these emits.

import { RELAY } from '../sync/keys';
import { newEntryUid } from './uid';

const DEFAULT_PRIORITY = 1000;

/**
 * First matching rule's `play` recipe, or null. `facts` is a flat bag; a rule
 * matches when every key in its `when` strictly equals the same fact. A `when`
 * key outside the current fact vocabulary compares against undefined and never
 * matches — rules authored for a future matcher degrade to no-ops, not errors.
 */
export function resolveFxRule(rules, facts) {
  const ordered = (Array.isArray(rules) ? rules : [])
    .filter((r) => r?.when && typeof r.play?.shape === 'string' && typeof r.play?.file === 'string')
    .sort((a, b) => (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY));
  for (const rule of ordered) {
    if (Object.entries(rule.when).every(([k, v]) => facts?.[k] === v)) return rule.play;
  }
  return null;
}

/**
 * A strike's matcher facts. Strike objects (strikeUtils resolveItemStrikes)
 * have no id of their own, so per-ability overrides key on the strike NAME;
 * `type` is only ever 'ranged' or absent-meaning-melee, folded here so
 * catalog rules can say `rangeType: 'melee'` explicitly.
 */
export function strikeFxFacts(ability) {
  return {
    kind: 'strike',
    abilityName: ability?.name ?? null,
    damageType: ability?.damageType ?? null,
    rangeType: ability?.type === 'ranged' ? 'ranged' : 'melee',
  };
}

/**
 * A spell/ability's matcher facts. `defenseKind` folds the defense into
 * 'attack' vs 'save' so one catalog rule covers all three saves
 * (the equality matcher can't express "any save").
 */
export function spellFxFacts({ abilityName, damageType, defense }) {
  return {
    kind: 'spell',
    abilityName: abilityName ?? null,
    damageType: damageType ?? null,
    defense: defense ?? null,
    defenseKind: defense == null ? null : (defense === 'ac' ? 'attack' : 'save'),
  };
}

/**
 * Facts for whatever ability just resolved at the modal seam. Weapon strikes
 * are `type: 'melee'|'ranged'`; everything else is treated as a spell-like
 * ability whose defense is its `targetDefense` (or AC via the Attack trait —
 * spell attacks), with damage type from the resolved profile.
 */
export function abilityFxFacts(ability, damageProfile) {
  if (ability?.type === 'melee' || ability?.type === 'ranged') {
    return strikeFxFacts(ability);
  }
  return spellFxFacts({
    abilityName: ability?.name,
    damageType: damageProfile?.typeLabel ?? ability?.damageData?.type ?? ability?.damageType ?? null,
    defense: ability?.targetDefense ?? (ability?.traits?.includes('Attack') ? 'ac' : null),
  });
}

// The wire event for a resolved recipe (foundry-bridge/animations.js contract).
const buildFxPlayEvent = (play, source, targets) => ({
  id: newEntryUid(),
  ts: Date.now(),
  shape: play.shape,
  file: play.file,
  source: source ?? null,
  targets,
  ...(play.opts ? { opts: play.opts } : {}),
});

// Hit target entryIds across ray groups + chained strikes (dedup'd). Misses
// don't animate at the modal seam — the swing/bolt is the hit feedback,
// mirroring how the damage relay only carries landed results.
const collectHitEntryIds = (rayGroups, chainResults) => {
  const ids = new Set();
  const push = (r) => {
    if (r?.entryId && (r.degree === 'success' || r.degree === 'criticalSuccess')) {
      ids.add(r.entryId);
    }
  };
  (rayGroups || []).forEach((g) => (g?.results || []).forEach(push));
  (chainResults?.rolls || []).forEach((set) => (set || []).forEach(push));
  return [...ids];
};

/**
 * Modal-confirm applier: resolve the strike / attack-roll spell against the
 * catalog and relay the recipe on cnmh_fxplay_global for the bridge to play.
 * Save-based abilities produce no roll results here (their save request is
 * resolved GM-side) so they fall out on the empty target list.
 */
export function emitAbilityFxPlay({
  sendUpdate,
  fxAnimations,
  ability,
  damageProfile,
  casterEntryId,
  rayGroups,
  chainResults,
}) {
  if (!sendUpdate || !casterEntryId) return;
  const play = resolveFxRule(fxAnimations, abilityFxFacts(ability, damageProfile));
  if (!play) return;
  const targets = collectHitEntryIds(rayGroups, chainResults);
  if (!targets.length) return;
  sendUpdate('global', RELAY.FXPLAY, buildFxPlayEvent(play, casterEntryId, targets));
}

/**
 * Request-build-time resolution for a save spell (caster's client — the
 * catalog lives here). Returns the recipe to ride the save request
 * (`{ shape, file, opts?, source }`), or null when nothing matches.
 */
export function resolveSaveRequestFx({ fxAnimations, ability, damageProfile, casterEntryId, defense }) {
  const play = resolveFxRule(fxAnimations, spellFxFacts({
    abilityName: ability?.name,
    damageType: damageProfile?.typeLabel ?? ability?.damageData?.type ?? null,
    defense: defense ?? null,
  }));
  if (!play) return null;
  return { ...play, source: casterEntryId ?? null };
}

/**
 * GM-side applier (RequestedSaves.finishResolve): fire the recipe that rode
 * the save request. EVERY resolved target animates — a fireball engulfs the
 * square whether or not the save succeeded. Bursts play without a source
 * token, so a null source is fine (the bridge skips source-needing shapes).
 */
export function emitSaveFxPlay({ sendUpdate, fx, results }) {
  if (!sendUpdate || !fx?.shape || !fx?.file) return;
  const targets = [...new Set((results || []).map((r) => r?.entryId).filter(Boolean))];
  if (!targets.length) return;
  const { source, ...play } = fx;
  sendUpdate('global', RELAY.FXPLAY, buildFxPlayEvent(play, source, targets));
}
