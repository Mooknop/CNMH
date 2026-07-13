// FX animation catalog resolver + strike-time emit (#1416, epic #1414).
//
// The fxAnimations content collection is an ordered rule list:
//   { id, priority?, when: { kind? | abilityName? | damageType? | rangeType? },
//     play: { shape, file, opts? } }
// Rules sort by ascending priority (missing = 1000) and the FIRST rule whose
// every `when` field strictly equals the strike's facts wins — per-ability
// signature rules sit at low priority numbers above the damage-type family
// defaults. Even the defaults are content: retuning or adding an animation is
// a content edit, never an app deploy. `play` is the resolved recipe the
// bridge interprets (foundry-bridge/animations.js): `shape` from its
// vocabulary (melee | projectile), `file` a Sequencer database key.
//
// Fire-and-forget juice (same contract as the bridge half): no catalog, no
// matching rule, no resolved hits, or no relay → silently emit nothing.
// Nothing may gate on this emit.

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

// Hit target entryIds across ray groups + chained strikes (dedup'd). Misses
// don't animate in v1 — the swing is the hit feedback, mirroring how the
// damage relay only carries landed results.
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
 * Confirm-time applier: resolve the strike against the fxAnimations catalog
 * and relay the recipe on cnmh_fxplay_global for the bridge to play.
 */
export function emitStrikeFxPlay({
  sendUpdate,
  fxAnimations,
  ability,
  casterEntryId,
  rayGroups,
  chainResults,
}) {
  if (!sendUpdate || !casterEntryId) return;
  const play = resolveFxRule(fxAnimations, strikeFxFacts(ability));
  if (!play) return;
  const targets = collectHitEntryIds(rayGroups, chainResults);
  if (!targets.length) return;
  sendUpdate('global', RELAY.FXPLAY, {
    id: newEntryUid(),
    ts: Date.now(),
    shape: play.shape,
    file: play.file,
    source: casterEntryId,
    targets,
    ...(play.opts ? { opts: play.opts } : {}),
  });
}
