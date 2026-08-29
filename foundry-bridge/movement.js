// Feature 3: Token movement — an 8-direction 5-ft stepper AND a plan → execute
// path rail on the v14 movement pipeline.
//
// The stepper (v13-era, still the fallback): instead of scanning a whole
// speed-radius grid with one straight ray per square (which can't see around
// walls — it disagrees with Foundry both ways), the bridge probes only the 8
// cells adjacent to the token. Each step is a single 5-ft move to a neighbour,
// validated with one short center-to-center collision test — which IS the real
// movement path, so it always matches Foundry. The app renders the 8 neighbours
// as a 3x3 D-pad and chains a fresh probe after every step; it accumulates
// traveled distance to charge actions in encounter mode.
//
// The path rail (#1736 S1): the app taps a destination and the bridge answers
// with the REAL route core would walk, its terrain-aware cost, and whether a
// wall clipped it — then executes the whole route as one move on confirm. No
// per-cell round-trips, and the player sees the true cost before committing.
// The two rails share resolveToken/getStepNeighbors and coexist: an app that
// never sends `moveplan` gets byte-identical stepper behaviour.
//
// Protocol (all modeled as cnmh_* keys so the session relay relays them):
//   App → bridge:  cnmh_movereq_<charId>     = { moveType, ts, ignoreOccupancy? }
//                  ignoreOccupancy (#617/#1806): exploration-mode surfaces set
//                    this true so the #456 creature-occupancy rules (below)
//                    are skipped entirely — only walls/doors block. Absent
//                    (undefined/false) reproduces Encounter-mode behavior
//                    byte-for-byte. Also honored on cnmh_moveconfirm_<charId>
//                    so the movedone piggyback (nextOpts) stays consistent.
//   Bridge → app:  cnmh_moveopts_<charId>    = { origin, reachable[], blocked[], gridSize, speed, originOccupied }
//                  reachable[] entries: { col, row, feet, terrain, passThrough? }
//                    passThrough: true → an ally's square; steppable to move
//                    *through*, but the move may not END here (see originOccupied).
//                  blocked[]   entries: { col, row, kind: 'wall' | 'ally' | 'enemy' }
//                  speed = actor land Speed (ft), for action accounting
//                  originOccupied = the token currently shares its cell with an
//                    ally (it stepped through one) — the app forbids stopping here.
//   App → bridge:  cnmh_moveplan_<charId>    = { waypoints, moveType, ts }
//                  waypoints = tapped destination cells [{ col, row }, …] in
//                    order, EXCLUDING the origin.
//   Bridge → app:  cnmh_moveplanned_<charId> = { path, costFeet, clipped, reqTs }
//                  path = the legal route cells the token would traverse,
//                    [{ col, row, x, y }, …] excluding the origin and ending at
//                    the ACTUAL landing cell; x,y = the cell's top-left pixels.
//                  costFeet = terrain-aware total, snapped to 5.
//                  clipped = the route stopped short of the last requested
//                    waypoint — the app offers a waypoint tap. From protocol 23
//                    (#1832) the route PATHFINDS around walls first, so this now
//                    means "unreachable even going around" rather than "a wall
//                    is in the way"; the shape is unchanged and the partial
//                    route still rides along.
//   App → bridge:  cnmh_moveconfirm_<charId> = { destination, moveType, actionCost, ts, waypoints? }
//                  waypoints (optional) = the planned path cells verbatim →
//                    execute the whole multi-waypoint move. Absent → the legacy
//                    single-`destination` stepper flow, unchanged.
//   Bridge → app:  cnmh_movedone_<charId>    = { newPosition, feetMoved, reqTs, nextOpts }
//                  Shape is identical for both flows. feetMoved is the measured
//                  cost of the path ACTUALLY traveled (a v14 move may stop
//                  short); newPosition is the real landing.
//                  nextOpts = the moveopts for the *landing* cell, computed
//                    right after the move so chained steps skip a whole
//                    movereq→moveopts round-trip (#451). Same shape as moveopts.
//
// All canvas/geometry calls go through pf2eAdapter.js.

// Token resolution uses the app-maintained actorMap (set by GM in the encounter
// UI) rather than a static TOKEN_MAP. charId → foundryActorId → the actor's
// active token on the current scene. The <id> segment of the movement keys is
// charId for PCs, `<ownerCharId>-<role>` for minions (#362), or a combat
// entryId for enemies driven from the GM dock (#1572, protocol 10).
import { getActorMap } from './encounter.js';
import {
  getSpeed,
  getGridSize,
  getAllTokens,
  getTokenDimensions,
  getActorById,
  getActorTokens,
  getCombatTokenMap,
  getMinionActorLinks,
  getTokenGridPosition,
  getTokenIdentity,
  getTokenDisposition,
  gridToPixels,
  measureMoveCost,
  hasWallCollision,
  moveToken,
  measureTokenPathCost,
  moveTokenPath,
  resolveCombatantToken,
} from './pf2eAdapter.js';
// The shared planning layer (#1832): planRoutedPath IS planTokenPath plus
// "route around a clip". The plan and the confirm's re-plan both go through it,
// which is what makes the route the player approved the route that executes.
import { planRoutedPath } from './pathRoute.js';
import { RELAY } from './syncKeys.js';

let _sendUpdate = null;
let _onMoveDone = null;

export function initMovement(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
}

// Move-completion seam (#1744 WS-2). Anything that wants to react to "a mover
// finished moving" registers here rather than being imported by this module —
// the snapshot rail's post-move broadcast is the first user, wired in bridge.js,
// and movement.js stays unaware of it. The listener is fired AFTER movedone is
// on the wire (the app's own reply must never wait on a capture) and its
// failures are swallowed: a broken listener must not break movement.
export function setMoveDoneListener(fn) {
  _onMoveDone = typeof fn === 'function' ? fn : null;
}

function notifyMoveDone(charId) {
  if (!_onMoveDone) return;
  try {
    Promise.resolve(_onMoveDone(charId)).catch((err) =>
      console.error('CNMH Bridge | move-done listener failed:', err));
  } catch (err) {
    console.error('CNMH Bridge | move-done listener failed:', err);
  }
}

// PF2e movement is always in 5ft increments; measurePath can return IEEE noise
// (e.g. 14.9999996), so snap to the nearest 5.
const snapFeet = (n) => Math.round(n / 5) * 5;

// Grid cells occupied by other tokens (you can move through allies but can't end
// your movement on top of another creature). Accounts for multi-square tokens.
// Returns a Map of "col,row" → 'ally' | 'enemy' so the UI can differentiate
// which kind of creature blocks each square. Disposition > 0 (friendly) reads
// as an ally; neutral/hostile read as an enemy.
function occupiedCells(movingToken, gridSize) {
  const occupied = new Map();
  for (const t of getAllTokens()) {
    if (t.id === movingToken.id) continue;
    const side = getTokenDisposition(t) > 0 ? 'ally' : 'enemy';
    const baseCol = Math.round(t.x / gridSize);
    const baseRow = Math.round(t.y / gridSize);
    const { width: w, height: h } = getTokenDimensions(t);
    for (let c = 0; c < w; c++) {
      for (let r = 0; r < h; r++) {
        occupied.set(`${baseCol + c},${baseRow + r}`, side);
      }
    }
  }
  return occupied;
}

// The three id spaces a movement key can carry, and the Foundry data behind
// each. resolveToken() walks id → token (an app request naming a mover);
// resolveMoverId() walks token → id (#1736 S3 — the pathpreview push starts
// from a Foundry-side move and has to name the mover for the app). Both read
// their sources through here so the two directions can't drift apart.
// (getMinionActorLinks comes from pf2eAdapter, not minionActors.js, to avoid a
// circular import.)
function moverSources() {
  const actorMap = getActorMap();
  return { actorMap, minionLinks: getMinionActorLinks(actorMap) };
}

export function resolveToken(charId) {
  const { actorMap, minionLinks } = moverSources();
  const actorId = Object.keys(actorMap).find((k) => actorMap[k] === charId);
  if (actorId) {
    const actor = getActorById(actorId);
    // PCs have a single token on the scene; companions/familiars are separate
    // actors, so the first active token is the PC's own.
    const tokens = actor ? getActorTokens(actor) : [];
    if (tokens[0]) return tokens[0];
  }

  // Minion fallback (#362): a charId of the form `<ownerCharId>-<role>` is a
  // companion/familiar that isn't in the PC actor map. Resolve it through the
  // ownership-derived minion link to its own Foundry actor token.
  const link = minionLinks.find((l) => `${l.ownerCharId}-${l.role}` === charId);
  if (link) {
    const actor  = getActorById(link.foundryActorId);
    const tokens = actor ? getActorTokens(actor) : [];
    return tokens[0] ?? null;
  }

  // Enemy fallback (#1572): an id that is neither a mapped charId nor a minion
  // link is a combat entryId — the GM dock moving a foe. Combatant ids are
  // random Foundry ids, so they can't shadow the branches above; outside combat
  // (or for an unknown id) this resolves null and the request is ignored.
  return resolveCombatantToken(charId);
}

// token → the app-side mover id, in the SAME precedence resolveToken applies in
// reverse: mapped PC charId, then minion `<ownerCharId>-<role>`, then the
// combat entryId. Accepts a placed Token or a TokenDocument (movement hooks
// hand over the latter). Returns null for a token the app has no mover for —
// unmapped scenery, an out-of-combat NPC — which is a legitimate preview
// subject, just an anonymous one (the payload's tokenId still identifies it).
export function resolveMoverId(token) {
  const { tokenId, actorId } = getTokenIdentity(token);
  const { actorMap, minionLinks } = moverSources();

  if (actorId && actorMap[actorId]) return actorMap[actorId];

  const link = actorId ? minionLinks.find((l) => l.foundryActorId === actorId) : null;
  if (link) return `${link.ownerCharId}-${link.role}`;

  if (tokenId) {
    const entry = getCombatTokenMap().find((e) => e.token?.id === tokenId);
    if (entry) return entry.combatantId;
  }

  return null;
}

// Called by bridge.js when cnmh_movereq_<charId> arrives. moveType (step vs
// stride) no longer affects the probe — both step one cell at a time — but the
// app still sends it so it can apply the right action accounting client-side.
export async function handleMoveRequest(charId, value) {
  const token = resolveToken(charId);
  if (!token) return;

  const options = await getStepNeighbors(token, undefined, Boolean(value?.ignoreOccupancy));
  if (!options) return;

  // Echo the request ts so the app can correlate this response to its request
  // and ignore stale option sets from a previous move.
  _sendUpdate?.(charId, RELAY.MOVEOPTS, { ...options, reqTs: value?.ts ?? null });
}

// Cell ↔ pixel converters for one token (#1736 S1). Three coordinate spaces
// meet on this rail and each conversion has to be explicit:
//   * the wire speaks CELLS, and a cell's x,y on the wire is its TOP-LEFT pixel
//     (what gridToPixels yields and what token.x/y stores);
//   * the collision / measurement backends want CREATURE CENTRES (same reason
//     getStepNeighbors offsets its rays — a corner-to-corner ray runs along the
//     grid lines where walls sit).
// The offset is the token's own footprint, so a Large creature converts right.
export function cellGeometry(token) {
  const gridSize = getGridSize();
  const { width: tW, height: tH } = getTokenDimensions(token);
  const offX = (tW * gridSize) / 2;
  const offY = (tH * gridSize) / 2;
  return {
    gridSize,
    offX,
    offY,
    toCenter: ({ col, row }) => {
      const { x, y } = gridToPixels(col, row);
      return { x: x + offX, y: y + offY };
    },
    toCell: ({ x, y }) => {
      const left = x - offX;
      const top  = y - offY;
      return {
        col: Math.round(left / gridSize),
        row: Math.round(top / gridSize),
        x: left,
        y: top,
      };
    },
  };
}

// Called by bridge.js when cnmh_moveplan_<charId> arrives (#1736 S1). Turns the
// tapped destination cells into the route core would ACTUALLY walk, prices it
// terrain-aware, and flags a wall/constraint that clipped it short. Read-only:
// nothing moves until a moveconfirm carrying waypoints arrives, which is what
// lets the app show a true cost and gate the action spend behind a confirm.
export async function handleMovePlan(charId, value) {
  const token = resolveToken(charId);
  if (!token) return;

  const cells = Array.isArray(value?.waypoints) ? value.waypoints : [];
  if (!cells.length) return;

  const geo = cellGeometry(token);
  const { path, clipped } = await planRoutedPath(token, cells.map(geo.toCenter));
  const costFeet = snapFeet(await measureTokenPathCost(token, path));

  // Echo the request ts (same correlation pattern as moveopts) so the app can
  // discard a plan superseded by a later tap.
  _sendUpdate?.(charId, RELAY.MOVEPLANNED, {
    path: path.map(geo.toCell),
    costFeet,
    clipped,
    reqTs: value?.ts ?? null,
  });
}

// The token's CURRENT centre, in the creature-centre space the path rail speaks.
// Callers capture this BEFORE a move: on the v14 pipeline the document may
// already read as the landing by the time the move resolves, and a route's cost
// has to be measured from where the token actually stood.
export function tokenStartCenter(token, geo = cellGeometry(token)) {
  return {
    x: Number(token.x ?? token.document?.x ?? 0) + geo.offX,
    y: Number(token.y ?? token.document?.y ?? 0) + geo.offY,
  };
}

// EXECUTION primitive, shared by the single-move confirm and the group-move rail
// (#1823). Walks `path` — creature centres, excluding the origin, exactly what
// planTokenPath returns — and reports where the token really landed and what
// the trip really cost. Deliberately owns NO wire traffic and NO move-done
// notification: those live in the ack wrappers around it, which is precisely
// what keeps a group move from firing one per-mover capture per member (the
// group rail composes this primitive, never confirmWaypointMove).
export async function walkTokenPath(token, path, { origin } = {}) {
  const geo = cellGeometry(token);
  const startCenter = origin ?? tokenStartCenter(token, geo);

  // A route blocked at its very first segment still answers — a silent bridge
  // would strand the app's awaiting-done state.
  const landedCenter = path.length ? await moveTokenPath(token, path) : startCenter;
  const landing = geo.toCell(landedCenter);

  // feetMoved prices the route ACTUALLY traveled: a v14 move may legally stop
  // short, so truncate the plan at the landing before measuring.
  const landedAt = path.findIndex(
    (p) => Math.abs(p.x - landedCenter.x) <= 0.5 && Math.abs(p.y - landedCenter.y) <= 0.5,
  );
  const traveled = path.length === 0
    ? []
    : (landedAt >= 0 ? path.slice(0, landedAt + 1) : [landedCenter]);
  const feetMoved = snapFeet(
    await measureTokenPathCost(token, traveled, { origin: startCenter }),
  );

  return { landing, landedCenter, feetMoved };
}

// Execute a planned multi-waypoint route (#1736 S1) — the waypoint branch of
// handleMoveConfirm. Reports through the SAME movedone shape as the stepper.
async function confirmWaypointMove(charId, token, value) {
  const geo = cellGeometry(token);
  const startCenter = tokenStartCenter(token, geo);

  // Cheap staleness protection: the world can change between plan and confirm
  // (a foe steps into the route), so re-plan right before executing rather than
  // trusting the app's cached path. Worst case is a stop-short, which movedone
  // already reports honestly. This MUST be the same routed planner the plan used
  // (#1832) — a confirm that only constrained would walk into the wall the plan
  // promised to go around.
  const { path } = await planRoutedPath(
    token,
    value.waypoints.map(geo.toCenter),
    { origin: startCenter },
  );

  const { landing, feetMoved } = await walkTokenPath(token, path, { origin: startCenter });

  // Same piggyback as the stepper (#451) — the app re-opens the picker at the
  // landing without another movereq→moveopts round-trip. ignoreOccupancy
  // (#617/#1806) rides the same confirm payload as the stepper flow so the
  // piggybacked opts stay consistent with the move that produced them.
  const nextOpts = await getStepNeighbors(token, landing, Boolean(value?.ignoreOccupancy));

  _sendUpdate?.(charId, RELAY.MOVEDONE, {
    newPosition: landing,
    feetMoved,
    reqTs: value?.ts ?? null,
    nextOpts,
  });
  notifyMoveDone(charId);
}

// Called by bridge.js when cnmh_moveconfirm_<charId> arrives.
export async function handleMoveConfirm(charId, value) {
  const token = resolveToken(charId);
  if (!token) return;

  // Path rail (#1736 S1): a confirm carrying the planned waypoints executes the
  // whole route in one move. Without them everything below is the legacy
  // single-destination stepper flow, byte-identical.
  if (Array.isArray(value?.waypoints) && value.waypoints.length) {
    await confirmWaypointMove(charId, token, value);
    return;
  }

  const { destination } = value;
  const { x, y } = gridToPixels(destination.col, destination.row);

  const gridSize = getGridSize();
  const { width: tW, height: tH } = getTokenDimensions(token);
  const offX = (tW * gridSize) / 2;
  const offY = (tH * gridSize) / 2;
  // Capture the start BEFORE the move — on the v14 pipeline the document may
  // already reflect the landing by the time moveToken resolves.
  const startX = token.x;
  const startY = token.y;

  // v14 readiness (#1574): moveToken reports where the token ACTUALLY landed —
  // the v14 movement pipeline may stop a move short of the request. On v13 the
  // landing always equals the request, so nothing changes.
  const landed = (await moveToken(token, x, y)) ?? { x, y };
  const col = Math.round(landed.x / gridSize);
  const row = Math.round(landed.y / gridSize);

  // Measure feet center-to-center (token position is the cell's top-left).
  const feetMoved = snapFeet(
    measureMoveCost(startX + offX, startY + offY, landed.x + offX, landed.y + offY)
  );

  // Piggyback the landing cell's step options so a chained move doesn't pay
  // another movereq→moveopts round-trip (#451). Computed from the reported
  // landing, not by re-reading the token — token.x/y lag the animated move.
  // ignoreOccupancy (#617/#1806) rides the moveconfirm payload so the
  // piggybacked opts match the request that started this move.
  const nextOpts = await getStepNeighbors(token, {
    col, row, x: landed.x, y: landed.y,
  }, Boolean(value?.ignoreOccupancy));

  _sendUpdate?.(charId, RELAY.MOVEDONE, {
    newPosition: { col, row, x: landed.x, y: landed.y },
    feetMoved,
    reqTs: value?.ts ?? null,
    nextOpts,
  });
  notifyMoveDone(charId);
}

// Probe the 8 cells adjacent to the token's current cell. Each candidate is a
// single 5-ft step, so one short center-to-center collision test is the actual
// movement path — accurate, unlike a long straight ray that can't route around
// walls. No speed-radius scan and no cost cap: every direct neighbour is a legal
// single step (terrain just tags it difficult). `speed` rides along so the app
// can charge a Stride action per Speed of accumulated distance.
//
// `origin` (optional) overrides where the probe is centred — { col, row, x, y }
// with x,y the cell's TOP-LEFT pixel. Used to probe the destination right after
// a move (#451) without re-reading token.x/y, which lag the animated update.
// `ignoreOccupancy` (#617/#1806) is exploration mode's escape hatch: PF2e
// occupancy rules (#456 — ally pass-through, enemy blocked, originOccupied
// gating) only apply tactically in Encounter mode. When set, every neighbour
// classifies purely on wall collision — no creature ever blocks, pass-throughs,
// or occupied-origin. Absent (undefined/false) reproduces prior behavior
// byte-for-byte, which is what every encounter-mode caller still sends.
async function getStepNeighbors(token, origin, ignoreOccupancy = false) {
  const gridSize = getGridSize();
  const speed    = getSpeed(token.actor);

  const tokenPos = origin ?? getTokenGridPosition(token);
  const originCol = tokenPos.col;
  const originRow = tokenPos.row;
  const occupied  = ignoreOccupancy ? null : occupiedCells(token, gridSize);
  const reachable = [];
  const blocked   = [];

  // Measure cost / wall collision center-to-center. token.x/token.y and
  // gridToPixels() both yield a cell's TOP-LEFT corner; a corner-to-corner ray
  // runs along grid lines where walls sit, producing spurious collisions.
  // Foundry's collision backend expects the creature centers.
  const { width: tW, height: tH } = getTokenDimensions(token);
  const offX = (tW * gridSize) / 2;
  const offY = (tH * gridSize) / 2;
  // When probing the destination, token.x/y still hold the pre-move position, so
  // use the supplied origin pixel; otherwise read the token's current corner.
  const baseX = origin ? origin.x : token.x;
  const baseY = origin ? origin.y : token.y;
  const fromX = baseX + offX;
  const fromY = baseY + offY;

  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dc === 0 && dr === 0) continue;
      const col  = originCol + dc;
      const row  = originRow + dr;
      const { x: destX, y: destY } = gridToPixels(col, row);
      const toX = destX + offX;
      const toY = destY + offY;

      if (hasWallCollision(fromX, fromY, toX, toY)) {
        blocked.push({ col, row, kind: 'wall' });
        continue;
      }

      // Occupancy (#456), skipped entirely in exploration mode (#617/#1806 —
      // occupied is null when ignoreOccupancy is set). You may move *through*
      // an ally's square but can't end there; enemies stay blocked (Tumble
      // Through / size rules are out of scope — see #614). kind is 'ally' or
      // 'enemy' so the picker colors it.
      const occupant = occupied?.get(`${col},${row}`);
      if (occupant === 'enemy') {
        blocked.push({ col, row, kind: 'enemy' });
        continue;
      }

      // A step costing more than its straight-line distance → difficult terrain.
      const cost = snapFeet(measureMoveCost(fromX, fromY, toX, toY));
      const straightFeet = Math.max(Math.abs(dc), Math.abs(dr)) * 5;
      const terrain = cost > straightFeet ? 'difficult' : 'normal';
      // An ally's square is reachable as a pass-through (steppable, can't stop).
      const cell = { col, row, feet: cost, terrain };
      if (occupant === 'ally') cell.passThrough = true;
      reachable.push(cell);
    }
  }

  // The move may not END on an ally; flag it when the token already shares one
  // of its footprint cells with another creature (it stepped through), so the
  // app can disable "Done" until the player steps clear. Always false in
  // exploration mode (#617/#1806) — occupied is null there.
  const originOccupied = occupied != null && Array.from({ length: tW }).some((_, c) =>
    Array.from({ length: tH }).some((_, r) =>
      occupied.has(`${originCol + c},${originRow + r}`)
    )
  );

  return {
    origin: { col: originCol, row: originRow },
    reachable,
    blocked,
    gridSize,
    speed,
    originOccupied,
  };
}
