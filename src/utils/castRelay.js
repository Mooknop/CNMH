import { RELAY, globalKey } from '../sync/keys';
// Cast rail to Foundry (#1531 S4). The dock's enemy pane delegates a native
// NPC spell cast — cnmh_castreq_global = { id, entryId, entryItemId, spellId,
// rank, ts } — and the bridge invokes SpellcastingEntryPF2e#cast: chat card +
// REAL slot/innate-use consumption in Foundry (v1 decision: Foundry owns NPC
// resources). The foekit re-push off the resulting item update refreshes the
// pane's remaining counts; the ack (cnmh_castdone_global = { id, ok, name?,
// rank?, ts }) only feeds the pane's read-out line.

export const CASTREQ_KEY = globalKey(RELAY.CASTREQ);
export const CASTDONE_KEY = globalKey(RELAY.CASTDONE);

// Bridges older than this wire protocol don't answer castreq. Feature-gated
// on the announced protocol (FoundryDiceInput precedent).
export const CAST_PROTOCOL = 7;

// Round-trip budget before the pane falls back to "cast it in Foundry".
export const CAST_TIMEOUT_MS = 10_000;

let counter = 0;

// The cnmh_castreq_global payload. `rank` heightens; null casts at the
// spell's own rank.
export const buildCastRequest = ({ entryId, entryItemId, spellId, rank = null }) => ({
  id: `cast-${Date.now()}-${(counter += 1)}`,
  entryId,
  entryItemId,
  spellId,
  ...(Number.isInteger(rank) ? { rank } : {}),
  ts: Date.now(),
});
