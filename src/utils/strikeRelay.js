import { RELAY, globalKey } from '../sync/keys';
// Strike rail to Foundry (#1531 S3). The dock's enemy pane delegates a native
// NPC strike — cnmh_strikereq_global = { id, entryId, actionIndex, variant,
// damage?, targets?, ts } — and the bridge rolls it through PF2e's own strike
// pipeline (chat card, Dice So Nice, native degree vs. the pre-set target),
// acking on cnmh_strikedone_global = { id, ok, mode, total, faces, degree, ts }.
// Unlike the dice tower (#1490), resolution IS native: Foundry owns NPC stats,
// so the ack is a read-out for the pane, never an input to app-side math.
//
// `id` is unique per request, so ack correlation is exact and a persisted
// strikedone hydrated on mount can never match a live request. ok:false =
// "read Foundry chat instead" — no timeout wait.

export const STRIKEREQ_KEY = globalKey(RELAY.STRIKEREQ);
export const STRIKEDONE_KEY = globalKey(RELAY.STRIKEDONE);

// Bridges older than this wire protocol don't answer strikereq. Feature-gated
// on the announced protocol (FoundryDiceInput precedent) instead of raising
// the app-wide MIN_BRIDGE_PROTOCOL.
export const STRIKE_PROTOCOL = 6;

// Round-trip budget before the pane falls back to "roll it in Foundry".
export const STRIKE_TIMEOUT_MS = 10_000;

let counter = 0;

// The cnmh_strikereq_global payload. `targets` (app entryIds) is only carried
// when the GM picked one — absent leaves the Foundry target set alone.
export const buildStrikeRequest = ({ entryId, actionIndex, variant = 0, damage = null, targets = null }) => ({
  id: `strike-${Date.now()}-${(counter += 1)}`,
  entryId,
  actionIndex,
  variant,
  ...(damage ? { damage } : {}),
  ...(Array.isArray(targets) && targets.length ? { targets } : {}),
  ts: Date.now(),
});

// PF2e degreeOfSuccess → attack vocabulary (the rail only rolls attacks;
// checks/saves have their own surfaces).
export const STRIKE_DEGREE_LABEL = {
  0: 'Critical Miss',
  1: 'Miss',
  2: 'Hit',
  3: 'Critical Hit',
};
