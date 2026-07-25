import { RELAY, globalKey } from '../sync/keys';

// Scene-snapshot + map-ping relay contract (#1573 B1/B2).
//
//   app → bridge  cnmh_snapreq_global   { id, ts }
//   bridge → app  cnmh_snapdone_global  { id, ok, url?, capture?, worldRect?,
//                                         gridSize?, ts }
//   app → bridge  cnmh_pingpoint_global { id, x, y, sceneId, name?, ts }
//
// The IMAGE never rides the relay — snapdone carries a stable /api/images URL
// (the bridge uploaded the bytes over HTTP); the DO would drop a frame that
// size, and synced keys persist to localStorage.
//
// `id` is unique per request, so a persisted snapdone hydrated on mount can
// never satisfy a live request. ok:false = "no snapshot available" — the
// requester should say so rather than wait out the timeout.

export const SNAPREQ_KEY = globalKey(RELAY.SNAPREQ);
export const SNAPDONE_KEY = globalKey(RELAY.SNAPDONE);

// Per-rail protocol floors. Capture landed in protocol 11 (B1) and the ping
// channel in 12 (B2), so each gates independently: a protocol-11 bridge can
// still serve snapshots to B3's placement flow even though it can't ping.
export const SNAP_PROTOCOL = 11;
export const PING_PROTOCOL = 12;

// Capture + upload + ack is slower than a dice round-trip (a PIXI extract plus
// an R2 PUT), so this is deliberately longer than ROLL_TIMEOUT_MS.
export const SNAP_TIMEOUT_MS = 20_000;

let counter = 0;

export const buildSnapshotRequest = () => ({
  id: `snap-${Date.now()}-${(counter += 1)}`,
  ts: Date.now(),
});

// `name` is the pinger's display name — carried for future GM-side attribution;
// Foundry's own ping pulse is what the table actually sees.
export const buildPingPoint = ({ x, y, sceneId, name }) => ({
  id: `ping-${Date.now()}-${(counter += 1)}`,
  x,
  y,
  sceneId: sceneId || '',
  ...(name ? { name } : {}),
  ts: Date.now(),
});
