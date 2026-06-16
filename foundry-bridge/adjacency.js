// Adjacency geometry — pure function, no Foundry globals (#430).
//
// Exposes which combatants are adjacent to which, so the app can gate reach-
// limited actions (administer to an adjacent ally, Battle Medicine, open an
// adjacent door later). Keyed by the Foundry combatant id, which equals the
// app's encounter `order` entryId (encounter.js builds entries as `entryId: c.id`).
//
// "Adjacent" = footprints touch (share a face or corner) — the 8-neighbourhood
// on a grid. The gap between closest edges must be STRICTLY less than one grid
// square: a one-square gap (gap === gridSize) is NOT adjacent. (This is stricter
// than flanking's lenient `<=` check, which is fine there because the segment
// test filters it; reach needs the exact rule.)

const tokenDims = (t) => ({
  w: Math.max(1, Math.round(t.document?.width ?? t.width ?? 1)),
  h: Math.max(1, Math.round(t.document?.height ?? t.height ?? 1)),
});

function adjacent(a, b, gridSize) {
  const da = tokenDims(a);
  const db = tokenDims(b);
  const ax2 = a.x + da.w * gridSize;
  const ay2 = a.y + da.h * gridSize;
  const bx2 = b.x + db.w * gridSize;
  const by2 = b.y + db.h * gridSize;
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(ax2, bx2));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(ay2, by2));
  return dx < gridSize && dy < gridSize;
}

/**
 * Compute the symmetric adjacency map over all combat tokens.
 *
 * @param {Array}  combatTokens - [{ combatantId, token }] (token: { x, y, document?:{width,height} })
 * @param {number} gridSize     - pixels per grid square (e.g. 100)
 * @returns {Object} { [combatantId]: string[] } — adjacent combatant ids (both directions)
 */
export function computeAdjacency(combatTokens, gridSize) {
  const result = {};
  const add = (from, to) => {
    (result[from] = result[from] || []).push(to);
  };

  for (let i = 0; i < combatTokens.length; i++) {
    for (let j = i + 1; j < combatTokens.length; j++) {
      const a = combatTokens[i];
      const b = combatTokens[j];
      if (!a.token || !b.token) continue;
      if (adjacent(a.token, b.token, gridSize)) {
        add(a.combatantId, b.combatantId);
        add(b.combatantId, a.combatantId);
      }
    }
  }

  return result;
}
