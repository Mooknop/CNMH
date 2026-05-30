// Flanking geometry — pure functions, no Foundry globals.
//
// PF2e flanking rule: two creatures flank a target when they are on *opposite
// sides* of it — the straight line from one flanker's space through the target's
// space reaches the other flanker. On a grid the standard test is:
//   The segment from flanker-A's token center to flanker-B's token center
//   intersects (passes through or touches) the target's bounding rectangle.
//
// This is attacker-relative: the result lists, per enemy token, which PC charIds
// form a valid flanking pair through that enemy. Downstream, only flanking PCs
// get the off-guard modifier on their melee strikes.
//
// v1 scope: adjacency only (not reach weapons). Leave a TODO reach marker where
// the distance check would be extended.

// --- AABB segment-intersection helpers ------------------------------------

// Returns the AABB for a token given its top-left pixel position and tile dims.
function tokenAABB(token, gridSize) {
  const { width: w, height: h } = tokenDimensions(token);
  return {
    x1: token.x,
    y1: token.y,
    x2: token.x + w * gridSize,
    y2: token.y + h * gridSize,
  };
}

function tokenDimensions(token) {
  // Mirrors pf2eAdapter.getTokenDimensions without importing Foundry globals.
  return {
    width:  Math.max(1, Math.round(token.document?.width  ?? token.width  ?? 1)),
    height: Math.max(1, Math.round(token.document?.height ?? token.height ?? 1)),
  };
}

// Center of a token in pixels.
function tokenCenter(token, gridSize) {
  const { width: w, height: h } = tokenDimensions(token);
  return {
    x: token.x + (w * gridSize) / 2,
    y: token.y + (h * gridSize) / 2,
  };
}

// Cohen–Sutherland region codes for a point relative to an AABB.
const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8;
function regionCode(x, y, aabb) {
  let code = INSIDE;
  if (x < aabb.x1)      code |= LEFT;
  else if (x > aabb.x2) code |= RIGHT;
  if (y < aabb.y1)      code |= TOP;
  else if (y > aabb.y2) code |= BOTTOM;
  return code;
}

// True if the segment (x0,y0)→(x1,y1) intersects the AABB (Cohen-Sutherland).
function segmentIntersectsAABB(x0, y0, x1, y1, aabb) {
  let c0 = regionCode(x0, y0, aabb);
  let c1 = regionCode(x1, y1, aabb);
  while (true) {
    if (!(c0 | c1)) return true;     // both inside
    if (c0 & c1)    return false;    // both on same outside side
    const cx = c0 ? c0 : c1;
    let x, y;
    const { x1: rx1, y1: ry1, x2: rx2, y2: ry2 } = aabb;
    if (cx & BOTTOM) {
      x = x0 + (x1 - x0) * (ry2 - y0) / (y1 - y0);
      y = ry2;
    } else if (cx & TOP) {
      x = x0 + (x1 - x0) * (ry1 - y0) / (y1 - y0);
      y = ry1;
    } else if (cx & RIGHT) {
      y = y0 + (y1 - y0) * (rx2 - x0) / (x1 - x0);
      x = rx2;
    } else {
      y = y0 + (y1 - y0) * (rx1 - x0) / (x1 - x0);
      x = rx1;
    }
    if (cx === c0) { x0 = x; y0 = y; c0 = regionCode(x0, y0, aabb); }
    else           { x1 = x; y1 = y; c1 = regionCode(x1, y1, aabb); }
  }
}

// True if the two tokens are adjacent (share a face or corner, i.e. within
// √2 * gridSize pixel distance between closest points of their footprints).
// v1 scope only: TODO reach — for reach weapons extend this to the weapon's
// reach in squares.
function isAdjacent(a, b, gridSize) {
  const aAABB = tokenAABB(a, gridSize);
  const bAABB = tokenAABB(b, gridSize);
  const dx = Math.max(0, Math.max(aAABB.x1, bAABB.x1) - Math.min(aAABB.x2, bAABB.x2));
  const dy = Math.max(0, Math.max(aAABB.y1, bAABB.y1) - Math.min(aAABB.y2, bAABB.y2));
  return dx <= gridSize && dy <= gridSize;
}

// --- Public API -----------------------------------------------------------

/**
 * Compute which PC charIds form a valid flanking pair through each enemy token.
 *
 * @param {Token[]} enemyTokens  - Foundry token-like objects for NPCs/enemies.
 *                                 Each needs: { id, x, y, document?:{width,height} }
 * @param {Array}   pcEntries    - Objects with { charId, token } where token
 *                                 has the same shape.
 * @param {number}  gridSize     - Pixels per grid square (e.g. 100).
 *
 * @returns {Object} Map of enemyTokenId → { byCharIds: string[] }
 *   byCharIds lists the charIds of ALL PCs that are part of at least one valid
 *   flanking pair through this enemy. (The set may have 2+ members.)
 */
export function computeFlanking(enemyTokens, pcEntries, gridSize) {
  const result = {};

  for (const enemy of enemyTokens) {
    const enemyAABB = tokenAABB(enemy, gridSize);
    const flankers = new Set();

    // Check every unordered pair of PCs.
    for (let i = 0; i < pcEntries.length; i++) {
      for (let j = i + 1; j < pcEntries.length; j++) {
        const a = pcEntries[i];
        const b = pcEntries[j];
        if (!a.token || !b.token) continue;

        // Both flankers must be adjacent to the target (v1: adjacency; TODO reach).
        if (!isAdjacent(a.token, enemy, gridSize)) continue;
        if (!isAdjacent(b.token, enemy, gridSize)) continue;

        const ca = tokenCenter(a.token, gridSize);
        const cb = tokenCenter(b.token, gridSize);

        if (segmentIntersectsAABB(ca.x, ca.y, cb.x, cb.y, enemyAABB)) {
          flankers.add(a.charId);
          flankers.add(b.charId);
        }
      }
    }

    if (flankers.size > 0) {
      result[enemy.id] = { byCharIds: [...flankers] };
    }
  }

  return result;
}
