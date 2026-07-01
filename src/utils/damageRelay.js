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

export const DMGAPPLY_KEY = 'cnmh_dmgapply_global';
export const DMGDONE_KEY  = 'cnmh_dmgdone_global';

export const newDamageApplyId = () =>
  `dmg-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

/**
 * Per-target damage hits out of the confirm-time results, mirroring
 * persistentDamage.collectFromResults: ray groups ([{ rayIndex, results }])
 * and chained-strike rolls (chainResults.rolls).
 *
 * - Ray-group hits carry the profile's `typeLabel`. Each ray is its own damage
 *   application (PF2e applies IWR per instance).
 * - Flurry of Blows combines its damage BEFORE resistances/weaknesses, so
 *   flurry rolls merge into ONE hit per target; other chained strikes stay
 *   separate. Chain results carry no damage type today, so they relay untyped
 *   (flat application — no IWR netting until strikes carry a type).
 * - `allowedEntryIds` (a Set) filters to enemy combatants; null allows all.
 *
 * @returns {Array<{ entryId, name, amount, type }>} hits with amount > 0
 */
export const collectDamageHits = (rayGroups, chainResults, {
  typeLabel = null,
  allowedEntryIds = null,
} = {}) => {
  const allowed = (entryId) => !allowedEntryIds || allowedEntryIds.has(entryId);
  const hits = [];

  (rayGroups || []).forEach((g) => {
    (g?.results || []).forEach((r) => {
      if (r?.entryId && r.damage?.final > 0 && allowed(r.entryId)) {
        hits.push({ entryId: r.entryId, name: r.name || '', amount: r.damage.final, type: typeLabel || '' });
      }
    });
  });

  const rolls = chainResults?.rolls || [];
  if (chainResults?.mode === 'flurry') {
    const sums = new Map();
    rolls.forEach((rollSet) => {
      (rollSet || []).forEach((r) => {
        if (!r?.entryId || !(r.damage?.final > 0) || !allowed(r.entryId)) return;
        const cur = sums.get(r.entryId) || { entryId: r.entryId, name: r.name || '', amount: 0, type: '' };
        cur.amount += r.damage.final;
        sums.set(r.entryId, cur);
      });
    });
    hits.push(...sums.values());
  } else {
    rolls.forEach((rollSet) => {
      (rollSet || []).forEach((r) => {
        if (r?.entryId && r.damage?.final > 0 && allowed(r.entryId)) {
          hits.push({ entryId: r.entryId, name: r.name || '', amount: r.damage.final, type: '' });
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
