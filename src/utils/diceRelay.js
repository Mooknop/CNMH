import { RELAY, globalKey } from '../sync/keys';
// Dice-tower relay to Foundry (#1490 S2). The app delegates a RAW dice roll —
// cnmh_rollreq_global = { id, charId, formula, flavor, ts } — and the bridge
// rolls a plain core Roll in Foundry chat (speaker via the actor map, Dice So
// Nice animates) and acks on cnmh_rolldone_global = { id, charId, ok, total,
// faces:[[sides, face], …], ts }. The app keeps EVERY modifier, DC, degree,
// and side effect: the ack only supplies the faces the manual input would
// otherwise be typed from.
//
// `id` is unique per request, so ack correlation is exact and a persisted
// rolldone hydrated on mount can never match a live request. ok:false (bad
// formula / bridge failure) means "fall back to manual entry now" — no
// timeout wait. Offline/sandbox mode (#553) never surfaces the roll button,
// so nothing degrades.

export const ROLLREQ_KEY = globalKey(RELAY.ROLLREQ);
export const ROLLDONE_KEY = globalKey(RELAY.ROLLDONE);

// Bridges older than this wire protocol don't answer rollreq (#1491). The
// feature gates itself on the announced protocol instead of raising the
// app-wide MIN_BRIDGE_PROTOCOL — an older module keeps every other rail
// working and simply doesn't offer the roll button.
export const ROLL_PROTOCOL = 3;

// How long a requester waits for the ack before giving up. The round-trip is
// app → DO relay → bridge → Foundry chat → back; anything past this means the
// bridge died mid-request and the player should just type the die.
export const ROLL_TIMEOUT_MS = 10_000;

let counter = 0;

// The cnmh_rollreq_global payload. `charId` is speaker attribution only.
export const buildRollRequest = ({ charId, formula, flavor }) => ({
  id: `roll-${Date.now()}-${(counter += 1)}`,
  charId: charId ?? null,
  formula,
  flavor: flavor || '',
  ts: Date.now(),
});

// The raw d20 face from an ack's kept-die pairs — what the manual d20 input
// would have been typed with. Falls back to the total for a bare `1d20`
// request answered by a bridge that sent no pairs.
export const d20FaceFrom = (ack) => {
  const pair = (ack?.faces || []).find((p) => Array.isArray(p) && p[0] === 20);
  if (pair && typeof pair[1] === 'number') return pair[1];
  return typeof ack?.total === 'number' ? ack.total : null;
};
