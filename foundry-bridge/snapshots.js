// Scene snapshot rail (#1573 B1) — the eyes for Ping the Map and template
// placement: players have no Foundry client, so the GM canvas is captured,
// uploaded, and served back to them as a plain image URL.
//
//   App → bridge:  cnmh_snapreq_global  = { id, ts, moverId?, radiusFeet? }
//   Bridge → app:  cnmh_snapdone_global = { id, ok, url?, capture?, worldRect?,
//                                           gridSize?, moverId, trigger, ts }
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
// The template half (#1573 B4):
//   App → bridge:  cnmh_templateplace_global = { id, shape, feet, x, y,
//                                                sceneId, name?, ts }
//   Bridge → app:  cnmh_templatedone_global  = { id, ok, templateId?, ts }
//     Draws the real burst outline on the canvas and pings its centre, so the
//     table sees both the shape and a "look here" pulse. Radial shapes only —
//     a cone/line needs a facing the app can't infer, so those stay ping-only.
//     `templateId` comes back so a later cleanup rail can remove it.

import { RELAY } from './syncKeys.js';
import {
  captureSceneSnapshot, getSpeed, moverCaptureRect, pingCanvasPoint, createMeasuredTemplate,
} from './pf2eAdapter.js';
import { resolveToken } from './movement.js';
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

// Called by bridge.js when cnmh_snapreq_global arrives.
//
// `moverId` (optional) switches the capture to the mover-centered world rect;
// it resolves through the SAME id spaces as every movement key (PC charId,
// minion `<ownerCharId>-<role>`, combat entryId). An unresolvable moverId falls
// back to the legacy GM-view capture rather than nacking — the player still gets
// a map, just the GM's one.
export async function handleSnapshotRequest(value) {
  const id = value?.id;
  if (!id) return;

  const moverId = value?.moverId ? String(value.moverId) : null;
  const rect = moverId ? rectForMover(moverId, value?.radiusFeet) : null;
  await deliver({
    id,
    moverId: rect ? moverId : null,
    trigger: 'request',
    worldRect: rect,
  });
}

// One broadcast mover-centered capture per completed move (#1744 WS-2, OQ-1
// ruling): the bridge pushes it unprompted so N viewing clients cost ONE
// capture instead of N private snapreqs. Wired to movement.js's move-done seam
// in bridge.js, so this module and the movement rail stay independent.
export async function pushMoverSnapshot(moverId) {
  if (!moverId || !_sendUpdate) return;
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
// from the `trigger` / `moverId` fields.
async function deliver({ id, moverId, trigger, worldRect }) {
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
