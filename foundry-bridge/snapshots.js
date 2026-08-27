// Scene snapshot rail (#1573 B1) — the eyes for Ping the Map and template
// placement: players have no Foundry client, so the GM canvas is captured,
// uploaded, and served back to them as a plain image URL.
//
//   App → bridge:  cnmh_snapreq_global  = { id, ts, moverId?, radiusFeet?, party? }
//   Bridge → app:  cnmh_snapdone_global = { id, ok, url?, capture?, worldRect?,
//                                           gridSize?, tokens?, moverId, trigger, ts }
//     url       — stable app-relative /api/images/… (the SAME secret-gated,
//                 content-addressed R2 pipeline as bestiary tokens, filed under
//                 the 'Scene Snapshots' catalog folder; captures are never
//                 referenced by content docs, so the existing orphan sweep is
//                 their GC)
//     capture   — stage worldTransform at capture time {a,b,c,d,tx,ty,screenW,
//                 screenH,sceneId}: the app inverts it to map a normalized tap
//                 back to world coordinates
//     worldRect — {x1,y1,x2,y2} viewport in world coords (matrix-less fallback)
//     gridSize  — px per grid square, for world→cell math
//     tokens    — [{ moverId, x, y }], world-space CENTRE of each party token in
//                 frame — PARTY CAPTURES ONLY (#1807, see below); absent on a
//                 mover-centered or legacy GM-view ack
//
// MOVER-CENTERED captures (#1744 WS-2, epic OQ-1/OQ-5): a `snapreq` naming a
// `moverId` is answered with a capture of the WORLD RECT around that token
// (`radiusFeet` in every direction, defaulting to 1.5× its Speed) instead of the
// GM's screen view — so the destination a player wants to tap is in frame no
// matter where the GM is looking. The same capture is BROADCAST once after every
// `movedone`, so the map a player taps is never more than one move stale. The
// geometry fields keep their exact meaning (they describe the captured rect), so
// the app's existing inverse tap math needs no change. A `snapreq` WITHOUT a
// moverId is the legacy GM-view capture, unchanged.
//
// PARTY-FRAMED captures (#1807, epic #1804 S3): a `snapreq` carrying
// `party: true` is answered with the world rect that frames EVERY actor-mapped
// PC token currently on the rendered scene, plus a margin — the bounding box
// of each in-frame token's own moverCaptureRect at a shared margin, which IS
// the bbox expanded by that margin (each per-token rect is already {token
// centre ± margin}, clamped to canvas bounds — see pf2eAdapter's
// moverCaptureRect). The margin is 1.5× the fastest in-frame party member's
// Speed — the same Stride-plus-half-again multiplier a single mover's default
// radius uses (MOVER_RADIUS_SPEED_FACTOR) — falling back to the plain 30 ft
// radius when no party member reports a Speed. A party member off the
// rendered scene, or with no mapped token at all, is simply absent from the
// frame and the `tokens` list (never a reason to nack the whole capture).
// The ack then carries `tokens: [{ moverId, x, y }]` — the WORLD-SPACE CENTRE
// of each token that made it into frame (see pf2eAdapter's
// getTokenWorldCenter) — added ONLY on a party capture (request or broadcast);
// every other capture's ack is byte-identical to before this slice. When no
// party member has a token on the rendered scene, a party request falls back
// to the legacy GM-view capture, mirroring the moverId-unresolved fallback
// below rather than nacking.
//
// `moverId` on the ack distinguishes the THREE capture shapes the app now has
// to render: non-null = mover-centered (frames one token); null + `tokens`
// present = party-framed (frames the group, tap targets included); null with
// no `tokens` = the legacy GM view.
//
// EXPLORATION BROADCAST (#1807): while the app's play mode is 'exploration'
// (tracked from `cnmh_playmode_global` — see setPlayMode/trackPlayMode below —
// and only when no Foundry combat is currently active), `pushMoverSnapshot`'s
// post-`movedone` broadcast captures the PARTY rect instead of the single
// mover's, so every client's party map refreshes after each move. Encounter
// (combat active) and downtime broadcasts are unchanged — still mover-centered.
//
// The IMAGE never rides the relay: the session DO drops frames over 64KB and
// synced keys persist to localStorage — only metadata and the URL travel.
// Live-only: snapreq is never replayed from FULL_STATE (a bridge connecting
// late simply misses it; the app's request timeout is the fallback), and an
// ok:false nack means "no snapshot available — fall back now".
//
// The tap half (#1573 B2):
//   App → bridge:  cnmh_pingpoint_global = { id, x, y, sceneId, name?, ts }
//     The app inverts the capture matrix locally, so what arrives is already
//     WORLD coordinates. Fire-and-forget like fxplay — Foundry broadcasts the
//     ping pulse to every client, and the player's own confirmation is local.
//     Scene-guarded in the adapter: a snapshot of scene A never pings scene B.
//
// The template half (#1573 B4, directional shapes #1735 S2):
//   App → bridge:  cnmh_templateplace_global = { id, shape, feet, x, y,
//                                                sceneId, name?, ts,
//                                                direction?, width? }
//   Bridge → app:  cnmh_templatedone_global  = { id, ok, templateId?, ts }
//     Draws the real area outline on the canvas and pings its origin, so the
//     table sees both the shape and a "look here" pulse. `templateId` comes
//     back so a later cleanup rail can remove it.
//
//     `shape` is 'burst'/'emanation' (radial, drawn on every generation) or —
//     protocol ≥ 18 — 'cone'/'line', which carry `direction` (COMPASS degrees:
//     0 = north, clockwise, multiples of 45) and, for a line, `width` (feet,
//     default 5). For a directional shape `x`/`y` is the shape's ORIGIN, not a
//     centre: the app derives it from the caster's own space. Directional
//     shapes are v14-only (they exist as Region cone/line shapes and nothing
//     else); a v13 world, a build missing the shape type, or a missing facing
//     all nack with ok:false and the table falls back to the ping.
//
//     The Region drawn here is PRESENTATIONAL. Occupancy — who is caught —
//     stays app-side in spellArea.js over the quantized template cells; the
//     bridge never reads a Region back to answer that.

import { RELAY } from './syncKeys.js';
import {
  captureSceneSnapshot, getSpeed, moverCaptureRect, getTokenWorldCenter, pingCanvasPoint,
  createMeasuredTemplate, getActiveCombat,
} from './pf2eAdapter.js';
import { resolveToken } from './movement.js';
import { getActorMap } from './encounter.js';
import { uploadImageBytes } from './tokenImages.js';

// How far a mover-centered capture reaches when the request doesn't say: 1.5×
// the mover's Speed in every direction (epic #1744, OQ-5 ruling) — a full
// Stride plus half again, so a two-action move stays in frame. Falls back to a
// plain 30 ft radius for a token whose actor reports no Speed at all.
export const MOVER_RADIUS_SPEED_FACTOR = 1.5;
export const MOVER_RADIUS_FALLBACK_FEET = 30;

let _sendUpdate = null;

export function initSnapshots(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
}

// The last-seen GM-set non-combat play mode (#1807), tracked from
// cnmh_playmode_global — bridge.js calls this on FULL_STATE (seed from
// persisted state) and on every UPDATE of that key, mirroring how it already
// tracks dicesets. Mirrors the app's usePlayMode default so an unset key
// (a fresh world, or a bridge that connected before the app ever wrote one)
// reads as exploration rather than freezing the party map on downtime.
let _playMode = 'exploration';

export function setPlayMode(mode) {
  if (typeof mode === 'string' && mode) _playMode = mode;
}

// The EFFECTIVE play mode this rail cares about: combat always wins (mirrors
// usePlayMode's own `encounter.active ? 'encounter' : gmMode` derivation) —
// read live off the real Foundry combat rather than trusting a possibly-stale
// tracked value, since the bridge already has that answer for free.
function isExplorationMode() {
  return !getActiveCombat()?.active && _playMode === 'exploration';
}

// Called by bridge.js when cnmh_snapreq_global arrives.
//
// `moverId` (optional) switches the capture to the mover-centered world rect;
// it resolves through the SAME id spaces as every movement key (PC charId,
// minion `<ownerCharId>-<role>`, combat entryId). An unresolvable moverId falls
// back to the legacy GM-view capture rather than nacking — the player still gets
// a map, just the GM's one.
//
// `party` (optional, #1807) switches the capture to the PARTY-framed rect
// instead — see the header comment for the framing rule. No party member on
// the rendered scene falls back to the legacy GM-view capture too, for the
// same "a map beats no map" reason as an unresolved moverId.
export async function handleSnapshotRequest(value) {
  const id = value?.id;
  if (!id) return;

  if (value?.party) {
    const party = partyCapture();
    await deliver({
      id,
      moverId: null,
      trigger: 'request',
      worldRect: party?.rect ?? null,
      tokens: party?.tokens ?? null,
    });
    return;
  }

  const moverId = value?.moverId ? String(value.moverId) : null;
  const rect = moverId ? rectForMover(moverId, value?.radiusFeet) : null;
  await deliver({
    id,
    moverId: rect ? moverId : null,
    trigger: 'request',
    worldRect: rect,
  });
}

// One broadcast capture per completed move (#1744 WS-2, OQ-1 ruling; party
// framing #1807): the bridge pushes it unprompted so N viewing clients cost
// ONE capture instead of N private snapreqs. Wired to movement.js's move-done
// seam in bridge.js, so this module and the movement rail stay independent.
//
// In exploration mode (no active combat, GM-set mode 'exploration') the
// broadcast frames the whole PARTY instead of just the mover who moved — every
// client's party map stays fresh after each step. Encounter and downtime
// broadcasts are unchanged: still centered on the one mover that moved.
export async function pushMoverSnapshot(moverId) {
  if (!moverId || !_sendUpdate) return;

  if (isExplorationMode()) {
    const party = partyCapture();
    // No party member in frame at all — nothing worth broadcasting (mirrors
    // the mover-centered "unknown mover" no-op below).
    if (!party) return;
    await deliver({
      id: `snapmove-${moverId}-${Date.now()}`,
      moverId: null,
      trigger: 'movedone',
      worldRect: party.rect,
      tokens: party.tokens,
    });
    return;
  }

  const rect = rectForMover(moverId);
  // No rect = the mover isn't on the rendered scene (or has no token any more).
  // A broadcast nobody asked for is not worth a nack.
  if (!rect) return;
  await deliver({
    id: `snapmove-${moverId}-${Date.now()}`,
    moverId,
    trigger: 'movedone',
    worldRect: rect,
  });
}

// Every actor-mapped PC charId (#1807 — "party" = resolvable via the SAME
// actor map movement.js's resolveToken already reads), resolved to its placed
// token exactly as a per-mover request would. A charId with no mapped actor,
// no active token, or a token on another scene simply doesn't make it into
// the returned list — resolveToken degrades to null the same way it does for
// any other rail; there is no separate "party roster" to fall out of sync.
function partyTokens() {
  const actorMap = getActorMap();
  const charIds = Array.from(new Set(Object.values(actorMap)));
  return charIds
    .map((charId) => ({ charId, token: resolveToken(charId) }))
    .filter((entry) => entry.token);
}

// The shared margin for a party capture (#1807 ruling): 1.5× the fastest
// resolvable party member's Speed — MOVER_RADIUS_SPEED_FACTOR, the same
// Stride-plus-half-again multiplier a single mover's default radius uses — so
// a full Stride from any edge token stays in frame. Falls back to the plain
// MOVER_RADIUS_FALLBACK_FEET when no party member reports a Speed.
function partyMarginFeet(entries) {
  const speeds = entries.map((e) => Number(getSpeed(e.token.actor))).filter((s) => s > 0);
  const fastest = speeds.length ? Math.max(...speeds) : 0;
  return fastest > 0 ? fastest * MOVER_RADIUS_SPEED_FACTOR : MOVER_RADIUS_FALLBACK_FEET;
}

// The party-framed capture (#1807): the bounding box of every in-frame party
// token's own moverCaptureRect at the shared margin — which IS the bbox
// expanded by that margin, since each per-token rect is already {token centre
// ± margin} clamped to canvas bounds — plus the world-space centre of each
// token that contributed to the box. A token whose moverCaptureRect comes
// back null (off the rendered scene, no readable geometry) is excluded from
// both the box and `tokens`, exactly like the mover-centered rail already
// treats an off-scene mover. Returns null when NO party member is in frame.
function partyCapture() {
  const entries = partyTokens();
  if (!entries.length) return null;

  const feet = partyMarginFeet(entries);
  let rect = null;
  const tokens = [];
  for (const { charId, token } of entries) {
    const tokenRect = moverCaptureRect(token, feet);
    if (!tokenRect) continue;
    rect = rect
      ? {
          x1: Math.min(rect.x1, tokenRect.x1),
          y1: Math.min(rect.y1, tokenRect.y1),
          x2: Math.max(rect.x2, tokenRect.x2),
          y2: Math.max(rect.y2, tokenRect.y2),
        }
      : tokenRect;
    const center = getTokenWorldCenter(token);
    if (center) tokens.push({ moverId: charId, x: center.x, y: center.y });
  }
  return rect ? { rect, tokens } : null;
}

// The world rect for a mover, or null when it can't be built (unknown id, token
// on another scene, no canvas dimensions).
function rectForMover(moverId, radiusFeet) {
  try {
    const token = resolveToken(moverId);
    if (!token) return null;
    const requested = Number(radiusFeet);
    const feet = requested > 0 ? requested : defaultRadiusFeet(token);
    return moverCaptureRect(token, feet);
  } catch (err) {
    console.error('CNMH Bridge | mover capture rect failed:', err);
    return null;
  }
}

function defaultRadiusFeet(token) {
  const speed = Number(getSpeed(token.actor));
  return speed > 0 ? speed * MOVER_RADIUS_SPEED_FACTOR : MOVER_RADIUS_FALLBACK_FEET;
}

// capture → R2 upload → snapdone ack. One path for every trigger, so a
// broadcast capture and a requested one are indistinguishable to the app apart
// from the `trigger` / `moverId` fields. `tokens` (#1807) rides along ONLY
// when the caller passes it (a party capture) — every other capture's ack is
// unchanged from before this slice.
async function deliver({ id, moverId, trigger, worldRect, tokens }) {
  const ack = (payload) =>
    _sendUpdate?.('global', RELAY.SNAPDONE, {
      id, ...payload, moverId, trigger, ts: Date.now(),
    });

  try {
    const snap = captureSceneSnapshot(worldRect ? { worldRect } : undefined);
    const blob = snap ? dataUrlToBlob(snap.dataUrl) : null;
    const url = blob
      ? await uploadImageBytes(blob, `snapshot-${snap.capture.sceneId || 'scene'}`, {
        folder: 'Scene Snapshots',
      })
      : null;
    if (!url) {
      ack({ ok: false });
      return;
    }
    ack({
      ok: true,
      url,
      capture: snap.capture,
      worldRect: snap.worldRect,
      gridSize: snap.gridSize,
      ...(tokens ? { tokens } : {}),
    });
  } catch (err) {
    console.error('CNMH Bridge | scene snapshot failed:', err);
    ack({ ok: false });
  }
}

// Called by bridge.js when cnmh_pingpoint_global arrives. Fire-and-forget: no
// ack channel — a ping that can't be placed (stale scene, no canvas) is a
// no-op the player already saw acknowledged on their own device.
export function handlePingPoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  try {
    pingCanvasPoint(x, y, { sceneId: String(value?.sceneId ?? '') });
  } catch (err) {
    console.error('CNMH Bridge | map ping failed:', err);
  }
}

// Called by bridge.js when cnmh_templateplace_global arrives (#1573 B4).
// Draws the area's outline, then pings its centre so the table's eye goes
// there. Acks with the created template's id; ok:false means the app should
// tell the player the outline didn't land.
export async function handleTemplatePlace(value) {
  const id = value?.id;
  if (!id) return;
  const ack = (payload) =>
    _sendUpdate?.('global', RELAY.TEMPLATEDONE, { id, ...payload, ts: Date.now() });

  const x = Number(value?.x);
  const y = Number(value?.y);
  const sceneId = String(value?.sceneId ?? '');
  try {
    const templateId = await createMeasuredTemplate({
      shape: String(value?.shape ?? ''),
      feet: Number(value?.feet),
      x,
      y,
      sceneId,
      // Optional on the wire (radial shapes never send them); the adapter
      // refuses a directional shape whose facing is absent rather than
      // guessing one.
      direction: value?.direction,
      width: value?.width,
    });
    // The pulse is worth sending even when no outline was drawn — the player
    // still told the table where they meant.
    pingCanvasPoint(x, y, { sceneId });
    ack(templateId ? { ok: true, templateId } : { ok: false });
  } catch (err) {
    console.error('CNMH Bridge | measured template failed:', err);
    ack({ ok: false });
  }
}

// data:image/webp;base64,… → Blob. Decoded by hand (no fetch()) so a malformed
// capture nacks instead of throwing across the network stack.
function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;,]+);base64,(.*)$/.exec(String(dataUrl ?? ''));
  if (!match) return null;
  const [, mime, b64] = match;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}
