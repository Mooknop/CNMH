import { RELAY, globalKey, PARTY_MAP_PROTOCOL } from '../sync/keys';

// Scene-snapshot + map-ping relay contract (#1573 B1/B2).
//
//   app → bridge  cnmh_snapreq_global   { id, ts, moverId?, radiusFeet? }
//   bridge → app  cnmh_snapdone_global  { id, ok, url?, capture?, worldRect?,
//                                         gridSize?, ts, moverId?, trigger? }
//   app → bridge  cnmh_pingpoint_global { id, x, y, sceneId, name?, ts }
//
// The IMAGE never rides the relay — snapdone carries a stable /api/images URL
// (the bridge uploaded the bytes over HTTP); the DO would drop a frame that
// size, and synced keys persist to localStorage.
//
// `id` is unique per request, so a persisted snapdone hydrated on mount can
// never satisfy a live request. ok:false = "no snapshot available" — the
// requester should say so rather than wait out the timeout.
//
// `moverId` / `radiusFeet` (#1744 WS-2, protocol 16) are additive and
// optional: a plain `snapreq` with neither still gets the GM's current
// viewport, unchanged. When `moverId` is present the bridge instead centers
// the capture on that token, extending `radiusFeet` in every direction (or
// its own 1.5×Speed default when omitted) — a world-rect render rather than
// a screen extract. `snapdone`'s `worldRect`/`worldTransform`/`gridSize`
// keep their exact prior meaning for whichever rect got captured, so
// `worldPointFromTap` / `normalizedFromWorld` need no changes either way.
// The bridge also broadcasts an unsolicited mover-centered `snapdone`
// (`trigger: 'movedone'`) after every `movedone` for that mover — it carries
// no request `id` a pending promise can correlate against, so a consumer
// that wants to adopt it must watch the raw synced value by `moverId`
// instead (see `useMoverMapSurface`).
//
// `party: true` (#1807, protocol 21) is the third capture shape: the world
// rect framing EVERY actor-mapped PC token on the rendered scene, plus a
// margin. Its ack adds `tokens: [{ moverId, x, y }]` — the world-space centre
// of each token in frame — and carries `moverId: null`, which is exactly how a
// consumer tells the three shapes apart: non-null `moverId` = mover-centered,
// null + `tokens` = party-framed, null with no `tokens` = the legacy GM view.
// While the play mode is 'exploration' with no combat active the bridge's
// post-`movedone` broadcast is party-framed too, so a party surface adopts any
// later `tokens`-bearing ack rather than only its own correlated reply (see
// `usePartyMapSurface`).

export const SNAPREQ_KEY = globalKey(RELAY.SNAPREQ);
export const SNAPDONE_KEY = globalKey(RELAY.SNAPDONE);
export const TEMPLATEDONE_KEY = globalKey(RELAY.TEMPLATEDONE);

// Per-rail protocol floors. Capture landed in protocol 11 (B1), the ping
// channel in 12 (B2) and measured templates in 13 (B4), so each gates
// independently: a protocol-11 bridge still serves snapshots to the placement
// flow, and a protocol-12 one still pings where an area landed even though it
// can't draw the outline.
export const SNAP_PROTOCOL = 11;
export const PING_PROTOCOL = 12;
export const TEMPLATE_PROTOCOL = 13;

// The party-framed capture floor (#1807) is DEFINED bridge-side
// (foundry-bridge/syncKeys.js, alongside PROTOCOL_VERSION) because the bridge
// owns which bump grew the field; re-exported here so every snapshot-rail
// consumer still reads its protocol floors from this one module.
export { PARTY_MAP_PROTOCOL };

// Capture + upload + ack is slower than a dice round-trip (a PIXI extract plus
// an R2 PUT), so this is deliberately longer than ROLL_TIMEOUT_MS.
export const SNAP_TIMEOUT_MS = 20_000;

// A mover-centered capture (#1744 S4) backs a live destination picker, which
// blocks the player's turn — unlike Ping the Map's "ask, then wait", a dead
// or busy GM client here must fall back to the abstract grid quickly rather
// than stall a Stride behind the full SNAP_TIMEOUT_MS. Still generous enough
// for a real PIXI-extract-plus-R2-upload round trip on a slow connection.
export const MOVE_SNAP_TIMEOUT_MS = 8_000;

let counter = 0;

// `moverId` + `radiusFeet` (#1744 WS-2, protocol 16) and `party` (#1807,
// protocol 21) are additive/optional — omitting them all sends byte-identical
// requests to every pre-#1744 consumer (Ping the Map, area-spell placement).
// `party` is only ever sent as `true`: a falsy value omits the field entirely
// rather than asking an older bridge to reason about `party: false`.
export const buildSnapshotRequest = ({ moverId, radiusFeet, party } = {}) => ({
  id: `snap-${Date.now()}-${(counter += 1)}`,
  ...(moverId ? { moverId } : {}),
  ...(radiusFeet != null ? { radiusFeet } : {}),
  ...(party ? { party: true } : {}),
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

// A placed area's outline (#1573 B4). `direction` (compass degrees) and
// `width` (line only, #1735 S2/S3) are additive/optional — a burst/emanation
// request never carries them, and a pre-#1735 recipient simply never sees
// the keys. `x`/`y` is a burst/emanation's placed point OR a cone/line's
// self-derived origin (`directionalOriginWorld`, `utils/spellArea.js`) — the
// caller decides which; this builder is shape-agnostic.
export const buildTemplatePlace = ({ shape, feet, x, y, sceneId, name, direction, width }) => ({
  id: `tpl-${Date.now()}-${(counter += 1)}`,
  shape,
  feet,
  x,
  y,
  sceneId: sceneId || '',
  ...(name ? { name } : {}),
  ...(direction != null ? { direction } : {}),
  ...(width != null ? { width } : {}),
  ts: Date.now(),
});
