// Feature 3: Token movement via grid picker.
//
// Protocol (all modeled as cnmh_* keys so the session relay relays them):
//   App → bridge:  cnmh_movereq_<charId>     = { moveType, ts }
//   Bridge → app:  cnmh_moveopts_<charId>    = { origin, reachable[], blocked[], gridSize, maxFeet }
//                  blocked[] entries carry kind: 'wall' | 'ally' | 'enemy'
//   App → bridge:  cnmh_moveconfirm_<charId> = { destination, moveType, actionCost, ts }
//   Bridge → app:  cnmh_movedone_<charId>    = { newPosition, feetMoved }
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
  if (!actorId) return null;
  const actor = getActorById(actorId);
  if (!actor) return null;
  // PCs have a single token on the scene; companions/familiars are separate
  // actors, so the first active token is the PC's own.
  const tokens = getActorTokens(actor);
  return tokens[0] ?? null;
}

// Called by bridge.js when cnmh_movereq_<charId> arrives.
export async function handleMoveRequest(charId, value) {
  const token = resolveToken(charId);
  if (!token) return;

  const moveType = value?.moveType ?? 'stride';
  const options  = await getReachableSquares(token, moveType);
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

  _sendUpdate?.(charId, 'movedone', {
    newPosition: { col: destination.col, row: destination.row, x, y },
    feetMoved,
    reqTs: value?.ts ?? null,
  });
}

async function getReachableSquares(token, moveType) {
  const gridSize  = getGridSize();
  const speed     = getSpeed(token.actor);
  const maxFeet   = moveType === 'step' ? 5 : speed;
  const maxSquares = maxFeet / 5;

  const { col: originCol, row: originRow } = getTokenGridPosition(token);
  const occupied  = occupiedCells(token, gridSize);
  const reachable = [];
  const blocked   = [];

  // Measure cost / wall collision center-to-center. token.x/token.y and
  // gridToPixels() both yield a cell's TOP-LEFT corner; a corner-to-corner ray
  // runs along grid lines where walls sit, producing spurious collisions and
  // wrongly blocking open squares. Foundry's collision backend expects the
  // creature centers.
  const { width: tW, height: tH } = getTokenDimensions(token);
  const offX = (tW * gridSize) / 2;
  const offY = (tH * gridSize) / 2;
  const fromX = token.x + offX;
  const fromY = token.y + offY;

  for (let dc = -maxSquares; dc <= maxSquares; dc++) {
    for (let dr = -maxSquares; dr <= maxSquares; dr++) {
      if (dc === 0 && dr === 0) continue;
      const col  = originCol + dc;
      const row  = originRow + dr;
      const { x: destX, y: destY } = gridToPixels(col, row);
      const toX = destX + offX;
      const toY = destY + offY;

      const cost = snapFeet(measureMoveCost(fromX, fromY, toX, toY));
      if (cost > maxFeet) continue;

      if (hasWallCollision(fromX, fromY, toX, toY)) {
        blocked.push({ col, row, kind: 'wall' });
        continue;
      }

      // Can't end movement on another creature's square. kind is 'ally' or
      // 'enemy' so the picker can color the obstacle accordingly.
      const occupant = occupied.get(`${col},${row}`);
      if (occupant) {
        blocked.push({ col, row, kind: occupant });
        continue;
      }

      // A square costs more than straight-line distance → difficult terrain.
      const straightFeet = Math.max(Math.abs(dc), Math.abs(dr)) * 5;
      const terrain = cost > straightFeet ? 'difficult' : 'normal';
      reachable.push({ col, row, feet: cost, terrain });
    }
  }

  return {
    origin: { col: originCol, row: originRow },
    reachable,
    blocked,
    gridSize,
    maxFeet,
  };
}
