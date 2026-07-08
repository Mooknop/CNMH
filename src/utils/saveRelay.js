// Enemy save-roll relay to Foundry (#1275, AA4 of epic #1098). The GM's
// RequestedSaves panel pushes a pending save request's targets to the bridge
// (cnmh_saveroll_global); the bridge rolls each combatant's saving throw via
// PF2e's Statistic#roll — the actor's LIVE modifiers apply, so the returned
// total is authoritative over the app's static bestiary saveMod — and acks on
// cnmh_savedone_global. The app recomputes degrees from d20 + total via
// computeSaveDegree (one source of truth for nat-20/nat-1) and resolves the
// request through the same path as manually typed d20s.
//
// `id` is the save request's own id (savereq-…), so the ack correlates without
// a separate counter. Targets the bridge cannot resolve come back in `failed`
// and stay on the GM's manual d20 entry — offline/sandbox mode (#553) degrades
// to today's flow (nothing answers, inputs stay editable).

export const SAVEROLL_KEY = 'cnmh_saveroll_global';
export const SAVEDONE_KEY = 'cnmh_savedone_global';

// savedone is a persisted synced key, so a fresh mount hydrates with the LAST
// ack ever sent. Only acks stamped within this window count as live — same
// reasoning as useDamageRelayAck's ACK_FRESH_MS.
export const SAVEDONE_FRESH_MS = 15_000;

/**
 * The cnmh_saveroll_global payload for a pending save request.
 * @param {Object} req - { id, save, dc, targets:[{ entryId, name }] }
 */
export const buildSaveRoll = ({ id, save, dc, targets }) => ({
  id,
  save,
  dc: typeof dc === 'number' ? dc : null,
  targets: (targets || []).map((t) => ({ entryId: t.entryId, name: t.name || '' })),
  ts: Date.now(),
});
