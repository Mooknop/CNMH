// Single chokepoint for all PF2e system.* data access AND canvas/movement APIs.
// If PF2e or Foundry changes schema/API in a future version, only this file
// needs updating. Current target: Foundry v13 + PF2e v6.x.
//
// v14 MIGRATION NOTES are marked inline. When Forge recommends v14:
//   1. Bump module.json compatibility.verified to "14"
//   2. Update the two canvas functions marked [v14-MIGRATION] below
//   3. Re-verify system.* data paths (stable across v13→v14 for PF2e 6.x)

// --- Actor data ---

export function getHp(actor) {
  const hp = actor.system?.attributes?.hp;
  return {
    current:  hp?.value  ?? 0,
    max:      hp?.max    ?? 0,
    temp:     hp?.temp   ?? 0,
    dying:    actor.system?.attributes?.dying?.value  ?? 0,
    wounded:  actor.system?.attributes?.wounded?.value ?? 0,
    doomed:   actor.system?.attributes?.doomed?.value  ?? 0,
  };
}

export function getHeroPoints(actor) {
  return actor.system?.resources?.heroPoints?.value ?? 0;
}

export function getFocusPool(actor) {
  return {
    value: actor.system?.resources?.focus?.value ?? 0,
    max:   actor.system?.resources?.focus?.max   ?? 0,
  };
}

export function getSpeed(actor) {
  // PF2e moved land speed from system.attributes.speed to system.movement.speeds
  // (deprecated since PF2e 7.5.0). Prefer the new path; the old path is only read
  // as a fallback for older data, so the deprecation warning never fires normally.
  const land = actor.system?.movement?.speeds?.land;
  if (land) return land.total ?? land.value ?? 25;
  return actor.system?.attributes?.speed?.total ?? 25;
}

// Returns array of { slug, value } for all active conditions on the actor.
export function getConditions(actor) {
  return (actor.itemTypes?.condition ?? []).map((c) => ({
    slug:  c.slug,
    value: c.system?.value?.value ?? 1,
  }));
}

// --- Combat data ---

export function getCombatantActorId(combatant) {
  return combatant.actorId ?? combatant.actor?.id ?? null;
}

export function getCombatantTokenId(combatant) {
  return combatant.tokenId ?? combatant.token?.id ?? null;
}

export function getCombatantInitiative(combatant) {
  return combatant.initiative ?? null;
}

// --- Token geometry ---
// v14 uses canvas.grid for measurement. All grid/geometry calls go through here.

export function getTokenGridPosition(token) {
  const gridSize = canvas.scene?.grid?.size ?? 100;
  return {
    col: Math.round(token.x / gridSize),
    row: Math.round(token.y / gridSize),
  };
}

export function gridToPixels(col, row) {
  const gridSize = canvas.scene?.grid?.size ?? 100;
  return { x: col * gridSize, y: row * gridSize };
}

// Measure movement cost in feet between two pixel points using the PF2e diagonal rule.
// Movement cost in scene distance units (feet) between two pixel points,
// honoring the scene's diagonal rule (PF2e's alternating 5/10 when configured).
// v12/v13: measurePath takes an array of {x,y} waypoints and returns { distance }.
export function measureMoveCost(fromX, fromY, toX, toY) {
  const path = canvas.grid.measurePath([
    { x: fromX, y: fromY },
    { x: toX,   y: toY },
  ]);
  return path.distance;
}

// True if a wall blocks movement between two pixel points.
// v12/v13: canvas.walls.checkCollision was removed; collision goes through the
// move polygon backend. mode:'any' returns a boolean.
export function hasWallCollision(fromX, fromY, toX, toY) {
  const origin      = { x: fromX, y: fromY };
  const destination = { x: toX,   y: toY };
  return CONFIG.Canvas.polygonBackends.move.testCollision(origin, destination, {
    type: 'move',
    mode: 'any',
  });
}
