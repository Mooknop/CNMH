// Scene snapshot rail (#1573 B1) — the eyes for Ping the Map and template
// placement: players have no Foundry client, so the GM canvas is captured,
// uploaded, and served back to them as a plain image URL.
//
//   App → bridge:  cnmh_snapreq_global  = { id, ts }
//   Bridge → app:  cnmh_snapdone_global = { id, ok, url?, capture?, worldRect?,
//                                           gridSize?, ts }
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
import { captureSceneSnapshot, pingCanvasPoint, createMeasuredTemplate } from './pf2eAdapter.js';
import { uploadImageBytes } from './tokenImages.js';

let _sendUpdate = null;

export function initSnapshots(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
}

// Called by bridge.js when cnmh_snapreq_global arrives.
export async function handleSnapshotRequest(value) {
  const id = value?.id;
  if (!id) return;
  const ack = (payload) =>
    _sendUpdate?.('global', RELAY.SNAPDONE, { id, ...payload, ts: Date.now() });

  try {
    const snap = captureSceneSnapshot();
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
