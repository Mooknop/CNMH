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
 *   - SNAP/PING/TEMPLATE_PROTOCOL, SNAP_TIMEOUT_MS → src/utils/snapshotRelay.js
 *   - STRIKE_PROTOCOL / STRIKE_TIMEOUT_MS     → src/utils/strikeRelay.js
 *   - CAST_PROTOCOL / CAST_TIMEOUT_MS         → src/utils/castRelay.js
 *   - ENEMY_MOVE_PROTOCOL                     → src/utils/movement.js
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
