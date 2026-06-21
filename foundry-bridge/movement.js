// Feature 3: Token movement via an 8-direction 5-ft stepper.
//
// Instead of scanning a whole speed-radius grid with one straight ray per square
// (which can't see around walls — it disagrees with Foundry both ways), the
// bridge probes only the 8 cells adjacent to the token. Each step is a single
// 5-ft move to a neighbour, validated with one short center-to-center collision
// test — which IS the real movement path, so it always matches Foundry. The app
// renders the 8 neighbours as a 3x3 D-pad and chains a fresh probe after every
// step; it accumulates traveled distance to charge actions in encounter mode.
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
//   App → bridge:  cnmh_moveconfirm_<charId> = { destination, moveType, actionCost, ts }
//   Bridge → app:  cnmh_movedone_<charId>    = { newPosition, feetMoved, nextOpts }
//                  nextOpts = the moveopts for the *destination* cell, computed
//                    right after the move so chained steps skip a whole
//                    movereq→moveopts round-trip (#451). Same shape as moveopts.
//
// All canvas/geometry calls go through pf2eAdapter.js.

// Token resolution uses the app-maintained actorMap (set by GM in the encounter
// UI) rather than a static TOKEN_MAP. charId → foundryActorId → the actor's
// active token on the current scene.
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
} from './pf2eAdapter.js';

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

  return null;
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
  _sendUpdate?.(charId, 'moveopts', { ...options, reqTs: value?.ts ?? null });
}

// Called by bridge.js when cnmh_moveconfirm_<charId> arrives.
export async function handleMoveConfirm(charId, value) {
  const token = resolveToken(charId);
  if (!token) return;

  const { destination } = value;
  const { x, y } = gridToPixels(destination.col, destination.row);

  // Measure feet center-to-center (token position is the cell's top-left).
  const gridSize = getGridSize();
  const { width: tW, height: tH } = getTokenDimensions(token);
  const offX = (tW * gridSize) / 2;
  const offY = (tH * gridSize) / 2;
  const feetMoved = snapFeet(
    measureMoveCost(token.x + offX, token.y + offY, x + offX, y + offY)
  );

  await moveToken(token, x, y);

  // Piggyback the destination cell's step options so a chained move doesn't pay
  // another movereq→moveopts round-trip (#451). Computed from the known
  // destination, not by re-reading the token — token.x/y lag the animated move.
  const nextOpts = await getStepNeighbors(token, {
    col: destination.col, row: destination.row, x, y,
  });

  _sendUpdate?.(charId, 'movedone', {
    newPosition: { col: destination.col, row: destination.row, x, y },
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
