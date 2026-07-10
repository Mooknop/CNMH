import { RELAY, globalKey } from '../sync/keys';
// Typed damage relay to Foundry (#1016). After the damage step resolves, the
// app pushes each enemy target's damage total WITH its type to the bridge
// (cnmh_dmgapply_global); the bridge applies it through PF2e's own
// actor.applyDamage, which nets the monster's immunities/weaknesses/
// resistances. The app therefore always sends the RAW typed total — Foundry
// stays authoritative for enemy HP, and the app's logged number is
// informational (#932). The bridge acks on cnmh_dmgdone_global; the GM client
// mirrors the ack into the encounter log (useDamageRelayAck).
//
// Enemy-only by design: PC damage flows through cnmh_hp_<charId> (characterSync
// writes it back), so relaying PC hits would double-apply.

export const DMGAPPLY_KEY = globalKey(RELAY.DMGAPPLY);
export const DMGDONE_KEY  = globalKey(RELAY.DMGDONE);

export const newDamageApplyId = () =>
  `dmg-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

// Positive typed instances off a computeTargetDamage result (#1019), or null
// when the result was single-total entry (no instances field). Prefers the
// pre-IWR rawInstances (#1014): the app nets monster IWR into `instances` for
// display, but the relay must stay raw — Foundry's applyDamage nets IWR itself
// (and knows exceptions like 'except silver' the app's model drops).
const positiveInstances = (damage) => {
  const source = damage?.rawInstances ?? damage?.instances;
  const list = Array.isArray(source) ? source.filter((i) => i?.amount > 0) : null;
  return list?.length ? list.map((i) => ({ amount: i.amount, type: i.type || '' })) : null;
};

// Pre-IWR total off a compute result (#1014) — `final` when no IWR fired.
const rawAmount = (damage) => damage?.rawFinal ?? damage?.final;

/**
 * Per-target damage hits out of the confirm-time results, mirroring
 * persistentDamage.collectFromResults: ray groups ([{ rayIndex, results }])
 * and chained-strike rolls (chainResults.rolls).
 *
 * - Ray-group hits carry the profile's `typeLabel`. Each ray is its own damage
 *   application (PF2e applies IWR per instance).
 * - Multi-instance results (#1019 — a flaming rune's fire beside the base
 *   piercing) additionally carry `instances: [{ amount, type }]`; the bridge
 *   builds ONE multi-instance DamageRoll from them so PF2e nets IWR per
 *   instance within a single application. `amount` stays the summed total.
 * - Flurry of Blows combines its damage BEFORE resistances/weaknesses, so
 *   flurry rolls merge into ONE hit per target (instances merged per type);
 *   other chained strikes stay separate.
 * - `allowedEntryIds` (a Set) filters to enemy combatants; null allows all.
 *
 * @returns {Array<{ entryId, name, amount, type, instances? }>} hits with amount > 0
 */
export const collectDamageHits = (rayGroups, chainResults, {
  typeLabel = null,
  allowedEntryIds = null,
} = {}) => {
  const allowed = (entryId) => !allowedEntryIds || allowedEntryIds.has(entryId);
  const hits = [];
  const pushHit = (r, type) => {
    const instances = positiveInstances(r.damage);
    hits.push({
      entryId: r.entryId, name: r.name || '', amount: rawAmount(r.damage), type,
      ...(instances ? { instances } : {}),
    });
  };

  (rayGroups || []).forEach((g) => {
    (g?.results || []).forEach((r) => {
      if (r?.entryId && rawAmount(r.damage) > 0 && allowed(r.entryId)) {
        pushHit(r, typeLabel || '');
      }
    });
  });

  const rolls = chainResults?.rolls || [];
  if (chainResults?.mode === 'flurry') {
    const sums = new Map();
    rolls.forEach((rollSet) => {
      (rollSet || []).forEach((r) => {
        if (!r?.entryId || !(rawAmount(r.damage) > 0) || !allowed(r.entryId)) return;
        const cur = sums.get(r.entryId)
          || { entryId: r.entryId, name: r.name || '', amount: 0, type: '', typeSums: new Map() };
        cur.amount += rawAmount(r.damage);
        // Merge typed instances per type; an instance-less roll folds into ''.
        const instances = positiveInstances(r.damage)
          ?? [{ amount: rawAmount(r.damage), type: '' }];
        instances.forEach((i) => {
          cur.typeSums.set(i.type, (cur.typeSums.get(i.type) || 0) + i.amount);
        });
        sums.set(r.entryId, cur);
      });
    });
    sums.forEach(({ typeSums, ...hit }) => {
      // Only carry instances when something in the flurry was actually typed.
      const merged = [...typeSums].map(([type, amount]) => ({ amount, type }));
      const typed = merged.some((i) => i.type);
      hits.push(typed ? { ...hit, instances: merged } : hit);
    });
  } else {
    rolls.forEach((rollSet) => {
      (rollSet || []).forEach((r) => {
        if (r?.entryId && rawAmount(r.damage) > 0 && allowed(r.entryId)) {
          pushHit(r, '');
        }
      });
    });
  }

  return hits;
};

/**
 * The cnmh_dmgapply_global payload for a set of hits. `id` correlates the
 * bridge's cnmh_dmgdone_global ack; `sourceName` labels both sides' logs.
 */
export const buildDamageApply = ({ hits, sourceName }) => ({
  id: newDamageApplyId(),
  sourceName: sourceName || '',
  hits: hits || [],
  ts: Date.now(),
});

/**
 * Confirm-time applier (#1016 + #1014): push each enemy target's RAW typed
 * total to the bridge, which applies it through PF2e's actor.applyDamage —
 * Foundry nets the monster's IWR and stays authoritative for enemy HP.
 * Enemies only: PC damage flows through cnmh_hp and would double-apply.
 * Then reveal-on-trigger: any monster IWR that just modified a target's
 * applied damage is now table knowledge — the caller's revealFiredIwr stamps
 * it into the RK record and announces first reveals. Chained strikes are
 * untyped (no IWR) — harmless; callers pass chainResults only for strike
 * chains (null otherwise).
 */
export const relayDamageAndRevealIwr = ({
  rayGroups,
  chainResults,
  order,
  typeLabel,
  sourceName,
  sendUpdate,
  revealFiredIwr,
}) => {
  const enemyEntryIds = new Set(
    (order || []).filter((e) => e.kind === 'enemy').map((e) => e.entryId)
  );
  const damageHits = collectDamageHits(rayGroups, chainResults, {
    typeLabel,
    allowedEntryIds: enemyEntryIds,
  });
  if (damageHits.length) {
    sendUpdate('global', RELAY.DMGAPPLY, buildDamageApply({ hits: damageHits, sourceName }));
  }

  revealFiredIwr([
    ...(rayGroups || []).flatMap((g) => g?.results || []),
    ...((chainResults?.rolls || []).flat()),
  ]);
};
