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
//   App → bridge:  cnmh_movereq_<charId>     = { moveType, ts }
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
//                  clipped = a wall/constraint stopped the route short of the
//                    last requested waypoint — the app offers a waypoint tap.
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
  getMinionActorLinks,
  getTokenGridPosition,
  getTokenDisposition,
  gridToPixels,
  measureMoveCost,
  hasWallCollision,
  moveToken,
  planTokenPath,
  measureTokenPathCost,
  moveTokenPath,
  resolveCombatantToken,
} from './pf2eAdapter.js';
import { RELAY } from './syncKeys.js';

let _sendUpdate = null;

export function initMovement(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
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

export function resolveToken(charId) {
  const actorMap = getActorMap();
  const actorId  = Object.keys(actorMap).find((k) => actorMap[k] === charId);
  if (actorId) {
    const actor = getActorById(actorId);
    // PCs have a single token on the scene; companions/familiars are separate
    // actors, so the first active token is the PC's own.
    const tokens = actor ? getActorTokens(actor) : [];
    if (tokens[0]) return tokens[0];
  }

  // Minion fallback (#362): a charId of the form `<ownerCharId>-<role>` is a
  // companion/familiar that isn't in the PC actor map. Resolve it through the
  // ownership-derived minion link to its own Foundry actor token. (Imported from
  // pf2eAdapter, not minionActors.js, to avoid a circular import.)
  const link = getMinionActorLinks(actorMap)
    .find((l) => `${l.ownerCharId}-${l.role}` === charId);
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

// Called by bridge.js when cnmh_movereq_<charId> arrives. moveType (step vs
// stride) no longer affects the probe — both step one cell at a time — but the
// app still sends it so it can apply the right action accounting client-side.
export async function handleMoveRequest(charId, value) {
  const token = resolveToken(charId);
  if (!token) return;

  const options = await getStepNeighbors(token);
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
function cellGeometry(token) {
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
  const { path, clipped } = await planTokenPath(token, cells.map(geo.toCenter));
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

// Execute a planned multi-waypoint route (#1736 S1) — the waypoint branch of
// handleMoveConfirm. Reports through the SAME movedone shape as the stepper.
async function confirmWaypointMove(charId, token, value) {
  const geo = cellGeometry(token);
  // Capture the start BEFORE the move: on the v14 pipeline the document may
  // already read as the landing by the time the move resolves, and the route's
  // cost has to be measured from where the token actually stood.
  const startCenter = {
    x: Number(token.x ?? token.document?.x ?? 0) + geo.offX,
    y: Number(token.y ?? token.document?.y ?? 0) + geo.offY,
  };

  // Cheap staleness protection: the world can change between plan and confirm
  // (a foe steps into the route), so re-plan/constrain right before executing
  // rather than trusting the app's cached path. Worst case is a stop-short,
  // which movedone already reports honestly.
  const { path } = await planTokenPath(
    token,
    value.waypoints.map(geo.toCenter),
    { origin: startCenter },
  );

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

  // Same piggyback as the stepper (#451) — the app re-opens the picker at the
  // landing without another movereq→moveopts round-trip.
  const nextOpts = await getStepNeighbors(token, landing);

  _sendUpdate?.(charId, RELAY.MOVEDONE, {
    newPosition: landing,
    feetMoved,
    reqTs: value?.ts ?? null,
    nextOpts,
  });
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
  const nextOpts = await getStepNeighbors(token, {
    col, row, x: landed.x, y: landed.y,
  });

  _sendUpdate?.(charId, RELAY.MOVEDONE, {
    newPosition: { col, row, x: landed.x, y: landed.y },
    feetMoved,
    reqTs: value?.ts ?? null,
    nextOpts,
  });
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
async function getStepNeighbors(token, origin) {
  const gridSize = getGridSize();
  const speed    = getSpeed(token.actor);

  const tokenPos = origin ?? getTokenGridPosition(token);
  const originCol = tokenPos.col;
  const originRow = tokenPos.row;
  const occupied  = occupiedCells(token, gridSize);
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

      // Occupancy (#456). You may move *through* an ally's square but can't end
      // there; enemies stay blocked (Tumble Through / size rules are out of
      // scope — see #614). kind is 'ally' or 'enemy' so the picker colors it.
      const occupant = occupied.get(`${col},${row}`);
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
  // app can disable "Done" until the player steps clear.
  const originOccupied = Array.from({ length: tW }).some((_, c) =>
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
