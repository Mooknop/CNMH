// Feature 3: Token movement via grid picker.
//
// Protocol (all modeled as cnmh_* keys so the session relay relays them):
//   App → bridge:  cnmh_movereq_<charId>     = { moveType, ts }
//   Bridge → app:  cnmh_moveopts_<charId>    = { origin, reachable[], blocked[], gridSize, maxFeet }
//   App → bridge:  cnmh_moveconfirm_<charId> = { destination, moveType, actionCost, ts }
//   Bridge → app:  cnmh_movedone_<charId>    = { newPosition, feetMoved }
//
// All canvas/geometry calls go through pf2eAdapter.js.

// Token resolution uses the app-maintained actorMap (set by GM in the encounter
// UI) rather than a static TOKEN_MAP. charId → foundryActorId → the actor's
// active token on the current scene.
import { getActorMap } from './encounter.js';
import { BRIDGE_SOURCE_FLAG } from './utils.js';
import {
  getSpeed,
  getTokenGridPosition,
  gridToPixels,
  measureMoveCost,
  hasWallCollision,
} from './pf2eAdapter.js';

let _sendUpdate = null;

export function initMovement(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
}

function resolveToken(charId) {
  const actorMap = getActorMap();
  const actorId  = Object.keys(actorMap).find((k) => actorMap[k] === charId);
  if (!actorId) return null;
  const actor = game.actors?.get(actorId);
  if (!actor) return null;
  // PCs have a single token on the scene; companions/familiars are separate
  // actors, so the first active token is the PC's own.
  const tokens = actor.getActiveTokens?.() ?? [];
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
  const feetMoved = measureMoveCost(token.x, token.y, x, y);

  // v13: TokenDocument.update({x,y}) works for movement on both v13 and v14.
  // [v14-MIGRATION]: v14 introduced a dedicated movement pipeline (TokenDocument.move /
  // the moveToken hook). Consider migrating for smoother animation and waypoint support,
  // but the update() path still functions and is safe to keep for now.
  await token.document.update({ x, y }, { [BRIDGE_SOURCE_FLAG]: 'app', animate: true });

  _sendUpdate?.(charId, 'movedone', {
    newPosition: { col: destination.col, row: destination.row, x, y },
    feetMoved,
    reqTs: value?.ts ?? null,
  });
}

async function getReachableSquares(token, moveType) {
  const gridSize  = canvas.scene?.grid?.size ?? 100;
  const speed     = getSpeed(token.actor);
  const maxFeet   = moveType === 'step'           ? 5
                  : moveType === 'double-stride'   ? speed * 2
                  :                                 speed;
  const maxSquares = maxFeet / 5;

  const { col: originCol, row: originRow } = getTokenGridPosition(token);
  const reachable = [];
  const blocked   = [];

  for (let dc = -maxSquares; dc <= maxSquares; dc++) {
    for (let dr = -maxSquares; dr <= maxSquares; dr++) {
      if (dc === 0 && dr === 0) continue;
      const col  = originCol + dc;
      const row  = originRow + dr;
      const { x: destX, y: destY } = gridToPixels(col, row);

      const cost = measureMoveCost(token.x, token.y, destX, destY);
      if (cost > maxFeet) continue;

      if (hasWallCollision(token.x, token.y, destX, destY)) {
        blocked.push({ col, row });
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
