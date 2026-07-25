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

import { RELAY } from './syncKeys.js';
import { captureSceneSnapshot } from './pf2eAdapter.js';
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
