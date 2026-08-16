/**
 * Foundry bridge presence + protocol, for specs that drive a protocol-gated rail
 * (#1606).
 *
 * `fixtures/session.ts` reports the bridge as PRESENT (the #553 write-gate would
 * otherwise freeze synced writes), but presence alone is not enough for anything
 * gated on the handshake: `useBridgeStatus` reads its protocol off
 * `cnmh_bridgehello_global`, and with no hello seeded that protocol is `null`, so
 * the feature under test never renders at all and the spec fails as "the button
 * was never there" rather than "the rail is broken". Seed `bridgeHello(N)`
 * alongside the rest of the state and the gate opens.
 *
 * The protocol floors and timeouts below are COPIES of the app's own constants,
 * not imports: `e2e/` is a separate TS project that deliberately never reaches
 * into `src/` (the same reason `CAMPAIGN_ID` is restated in
 * `fixtures/session.ts`). That is a real drift risk, so it is concentrated in
 * this one file rather than restated per spec — when a floor moves in the source
 * of truth, this is the only place to follow it:
 *
 *   - ROLL_PROTOCOL / ROLL_TIMEOUT_MS         → src/utils/diceRelay.js
 *   - SNAP/PING/TEMPLATE_PROTOCOL, SNAP_TIMEOUT_MS, MOVE_SNAP_TIMEOUT_MS → src/utils/snapshotRelay.js
 *   - STRIKE_PROTOCOL / STRIKE_TIMEOUT_MS     → src/utils/strikeRelay.js
 *   - CAST_PROTOCOL / CAST_TIMEOUT_MS         → src/utils/castRelay.js
 *   - ENEMY_MOVE_PROTOCOL / FULL_MOVE_PROTOCOL / MAP_MOVE_PROTOCOL → src/utils/movement.js
 *   - MIN_BRIDGE_PROTOCOL                     → src/hooks/useBridgeStatus.js
 */

// ── src/utils/diceRelay.js ───────────────────────────────────────────────────

/** Bridges below this never answer `cnmh_rollreq_global` (#1491), so the app
 *  hides the "Roll in Foundry" button. Deliberately its own floor rather than
 *  the app-wide MIN_BRIDGE_PROTOCOL — an older module keeps every other rail. */
export const ROLL_PROTOCOL = 3;

/** The dice requester's give-up deadline. Specs use it to prove an `ok:false`
 *  nack settles NOW rather than waiting the deadline out. */
export const ROLL_TIMEOUT_MS = 10_000;

// ── src/utils/snapshotRelay.js ───────────────────────────────────────────────

/** Scene capture (#1573 B1) — `cnmh_snapreq_global` → `cnmh_snapdone_global`. */
export const SNAP_PROTOCOL = 11;

/** Ping the Map (#1573 B2) — `cnmh_pingpoint_global`. */
export const PING_PROTOCOL = 12;

/** Measured templates (#1573 B4) — `cnmh_templateplace_global`. */
export const TEMPLATE_PROTOCOL = 13;

/** The three floors above gate INDEPENDENTLY: a protocol-11 bridge still serves
 *  the placement flow its snapshot while hiding "Ping the map", and a
 *  protocol-12 one still pings where an area landed without drawing the outline.
 *  Specs asserting the degradation matrix want the individual constants, never a
 *  single "map protocol". */

/** Capture + upload + ack (a PIXI extract plus an R2 PUT) is slower than a dice
 *  round-trip, hence longer than ROLL_TIMEOUT_MS. */
export const SNAP_TIMEOUT_MS = 20_000;

/** The mover-centered capture behind Move-sheet map mode (#1744 S4) gives up
 *  faster than a plain `snapreq` — a live destination picker blocks the
 *  player's turn, so a dead/busy GM client must fall back to the abstract
 *  grid well before SNAP_TIMEOUT_MS. Specs use it to prove the fallback
 *  notice appears once this deadline (not SNAP_TIMEOUT_MS) elapses. */
export const MOVE_SNAP_TIMEOUT_MS = 8_000;

// ── src/utils/strikeRelay.js ─────────────────────────────────────────────────

/** Native NPC strikes from the GM dock's enemy pane (#1531 S3) —
 *  `cnmh_strikereq_global` → `cnmh_strikedone_global`. Below this floor the pane
 *  keeps its read-only MAP ladder and grows no roll buttons at all. */
export const STRIKE_PROTOCOL = 6;

/** The strike requester's give-up deadline. Specs use it to prove an `ok:false`
 *  nack settles NOW rather than waiting the deadline out. */
export const STRIKE_TIMEOUT_MS = 10_000;

// ── src/utils/castRelay.js ───────────────────────────────────────────────────

/** Native NPC spellcasting (#1531 S4) — `cnmh_castreq_global` →
 *  `cnmh_castdone_global`. Its own floor, INDEPENDENT of STRIKE_PROTOCOL: a
 *  protocol-6 bridge rolls strikes natively but never grows Cast buttons. */
export const CAST_PROTOCOL = 7;

/** As STRIKE_TIMEOUT_MS, for the cast rail. */
export const CAST_TIMEOUT_MS = 10_000;

// ── src/utils/movement.js ────────────────────────────────────────────────────

/** The dock's foe Move tab (#1572 A2). The movereq/moveopts/moveconfirm/movedone
 *  machine itself is far older — this is the protocol at which the BRIDGE
 *  learned to resolve a combat `entryId` to a token (A1), so an older module
 *  hides the tab rather than offering a pad that can never move anything. */
export const ENEMY_MOVE_PROTOCOL = 10;

/** The bridge protocol that taught the movement rail the plan/confirm
 *  pipeline (#1736 S1/S2) — findMovementPath/constrainMovementPath/
 *  measureMovementPath wrappers plus the moveplan→moveplanned relay pair and
 *  moveconfirm's waypoints[] field. PC Stride gates the destination-tap
 *  confirm flow on this floor; below it (or no hello at all) the encounter
 *  dock's Stride sheet shows an outdated-bridge notice instead of a pad — the
 *  5-ft D-pad fallback for Stride was retired in #1736 S5 once the tap flow
 *  was table-verified. (Step, exploration, minions, and foe movement keep
 *  their own stepper fallbacks; this floor is Stride-only.) */
export const FULL_MOVE_PROTOCOL = 14;

/** The bridge protocol that taught the relay a filtered `pathpreview` channel
 *  (plus the unfiltered `pathpreviewgm` companion), per-token-scene grid
 *  conversion, and mover-centered snapshot captures (#1744 WS-1/WS-2). The
 *  Move sheet's grid/map surface toggle (`useDevicePref`, OQ-4) only appears
 *  at this floor or above; below it — or with no hello at all — the abstract
 *  grid is the only surface, and `usePathPreview` renders no ghosts even off
 *  a live preview channel (an older, unfiltered bridge must never leak one). */
export const MAP_MOVE_PROTOCOL = 16;

// ── src/hooks/useBridgeStatus.js ─────────────────────────────────────────────

/** The oldest protocol the app still fully supports — below this, SyncStatus
 *  renders the "Bridge outdated" badge ('stale', not 'live'). Raised 1 → 14 in
 *  #1736 S5 alongside FULL_MOVE_PROTOCOL (same value, same reason: PC Stride's
 *  tap flow is now the only way to Stride in the encounter dock). Specs that
 *  need a healthy 'live' badge and don't care about a SPECIFIC feature's own
 *  floor should seed `bridgeHello(MIN_BRIDGE_PROTOCOL)`, not an older
 *  per-feature constant like TEMPLATE_PROTOCOL. */
export const MIN_BRIDGE_PROTOCOL = 14;

// ── the handshake payload ────────────────────────────────────────────────────

/**
 * The `cnmh_bridgehello_global` record a live bridge announces itself with
 * (#1310) — seed it through `mockSession`:
 *
 *   mockSession(page, { seed: { cnmh_bridgehello_global: bridgeHello(TEMPLATE_PROTOCOL) } })
 *
 * `module` is the module version string; nothing gates on it, so it is a label
 * for whoever is reading the failure output. Pass one when a spec runs several
 * bridges and it helps to tell them apart.
 */
export const bridgeHello = (protocol: number, module = '0.0.0-e2e') => ({ protocol, module });
