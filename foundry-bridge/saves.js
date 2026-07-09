// Feature: roll enemy saving throws in Foundry for the app's save-request rail
// (#1275, AA4 of epic #1098).
//
// The GM's RequestedSaves panel emits
//   cnmh_saveroll_global = { id, save, dc, targets:[{ entryId, name }], ts }
// (id = the save request's own id, so the ack correlates). The bridge:
//   1. Resolves each entryId → combatant token → actor (same seam as damageApply).
//   2. Rolls the actor's save statistic against the DC via rollActorSave —
//      PF2e applies the actor's live modifiers; the roll lands in Foundry chat
//      as a GM roll.
//   3. Acks on cnmh_savedone_global = { id, results:[{ entryId, name, d20,
//      total }], failed:[{ entryId, name }], ts }. Degrees are NOT computed
//      here — the app's computeSaveDegree stays the one source of truth.
//
// Dispatch only sees LIVE UPDATEs (FULL_STATE never replays saveroll), so a
// bridge that connects after a request simply misses it — the GM's manual d20
// entry remains the fallback. All Foundry access goes through pf2eAdapter.js.

import { resolveCombatantToken, rollActorSave } from './pf2eAdapter.js';
import { RELAY } from './syncKeys.js';

let _sendUpdate = null;

export function initSaves(sendUpdate) {
  _sendUpdate = sendUpdate;
}

const SAVE_STATS = ['fortitude', 'reflex', 'will'];

// Called by bridge.js when cnmh_saveroll_global arrives.
export async function handleSaveRoll(value) {
  const { id, save, dc, targets } = value || {};
  if (!Array.isArray(targets) || targets.length === 0) return;
  if (!SAVE_STATS.includes(save)) return;

  const results = [];
  const failed = [];
  for (const t of targets) {
    const { entryId, name } = t || {};
    const token = entryId ? resolveCombatantToken(entryId) : null;
    if (!token?.actor) {
      failed.push({ entryId: entryId ?? null, name: name || '' });
      continue;
    }
    try {
      const rolled = await rollActorSave(token.actor, save, typeof dc === 'number' ? dc : null);
      if (rolled && typeof rolled.d20 === 'number' && typeof rolled.total === 'number') {
        results.push({ entryId, name: token.actor.name || name || '', d20: rolled.d20, total: rolled.total });
      } else {
        failed.push({ entryId, name: name || '' });
      }
    } catch (err) {
      console.error('CNMH Bridge | rollActorSave failed:', err);
      failed.push({ entryId, name: name || '' });
    }
  }

  _sendUpdate?.('global', RELAY.SAVEDONE, {
    id: id ?? null,
    results,
    failed,
    ts: Date.now(),
  });
}
