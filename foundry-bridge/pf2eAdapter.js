// Single chokepoint for all PF2e system.* data access AND canvas/movement APIs.
// If PF2e or Foundry changes schema/API in a future version, only this file
// needs updating. Current target: Foundry v13 + PF2e v6.x.
//
// v14 MIGRATION NOTES are marked inline. When Forge recommends v14:
//   1. Bump module.json compatibility.verified to "14"
//   2. Update the two canvas functions marked [v14-MIGRATION] below
//   3. Re-verify system.* data paths (stable across v13→v14 for PF2e 6.x)

import { BRIDGE_SOURCE_FLAG } from './utils.js';

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

// Returns defensive stats for an actor: AC, save modifiers, and IWR.
// Saves are returned as modifiers (not DCs); the app derives DC = 10 + modifier.
// Returns null when actor is absent.
export function getDefenses(actor) {
  if (!actor) return null;
  return {
    ac: actor.system?.attributes?.ac?.value ?? null,
    saves: {
      fortitude: actor.system?.saves?.fortitude?.value ?? null,
      reflex:    actor.system?.saves?.reflex?.value    ?? null,
      will:      actor.system?.saves?.will?.value      ?? null,
    },
    immunities:  (actor.system?.attributes?.immunities  ?? []).map((i) => i.type).filter(Boolean),
    resistances: (actor.system?.attributes?.resistances ?? []).map((r) => ({ type: r.type, value: r.value })).filter((r) => r.type),
    weaknesses:  (actor.system?.attributes?.weaknesses  ?? []).map((w) => ({ type: w.type, value: w.value })).filter((w) => w.type),
  };
}

// Resolve a combatant to its live actor document. Prefers the already-embedded
// actor reference (combatant.actor); falls back to game.actors lookup.
export function getCombatantActor(combatant) {
  return combatant.actor ?? getActorById(getCombatantActorId(combatant)) ?? null;
}

// --- Actor lookup & writes ---

export function getActorById(actorId) {
  return game.actors?.get(actorId) ?? null;
}

export function getActorId(actor) {
  return actor?.id ?? null;
}

// The active token(s) for an actor on the current scene. PCs have a single token;
// companions/familiars are separate actors, so callers take the first.
export function getActorTokens(actor) {
  return actor?.getActiveTokens?.() ?? [];
}

// Write HP back to the actor, tagged so the bridge's own updateActor hook ignores
// the echo (see isBridgeEcho).
export function updateActorHp(actor, { current, temp }) {
  return actor.update({
    'system.attributes.hp.value': current,
    'system.attributes.hp.temp':  temp ?? 0,
  }, { [BRIDGE_SOURCE_FLAG]: 'app' });
}

export function updateActorHeroPoints(actor, value) {
  return actor.update({
    'system.resources.heroPoints.value': value,
  }, { [BRIDGE_SOURCE_FLAG]: 'app' });
}

// Apply a PF2e effect item to an actor by Foundry compendium UUID.
// Resolves the UUID, clones the source document, and creates it as an embedded
// Item on the actor — producing the effect icon/aura visible in Foundry.
// Tagged with BRIDGE_SOURCE_FLAG so the characterSync createItem hook ignores it
// (the hook already guards with isConditionItem, but tagging is belt-and-suspenders).
// Returns null when the UUID resolves to nothing (invalid / wrong pack).
export async function applyEffectByUuid(actor, ref) {
  // eslint-disable-next-line no-undef
  const source = await fromUuid(ref);
  if (!source || !actor) return null;
  return actor.createEmbeddedDocuments('Item', [source.toObject()],
    { [BRIDGE_SOURCE_FLAG]: 'app' });
}

// --- Condition items (createItem/updateItem/deleteItem hook payloads) ---

export function isConditionItem(item) {
  return item?.type === 'condition';
}

// The owning Actor of a condition Item, or null if the item isn't on an actor.
export function getConditionItemActor(item) {
  const actor = item?.parent;
  if (!actor || actor.documentName !== 'Actor') return null;
  return actor;
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

// --- Combat lookup & lifecycle ---

export function getCombatById(combatId) {
  return game.combats?.get(combatId) ?? null;
}

export function getActiveCombat() {
  return game.combat ?? null;
}

export function advanceCombatTurn(combat) {
  return combat.nextTurn();
}

// The version-independent combat snapshot the encounter payload is built from.
// Keeping these reads here means a v14 Combat API rename touches only this file.
export function getCombatState(combat) {
  return {
    active:            combat.active,
    started:           combat.started,
    round:             combat.round ?? 0,
    turn:              combat.turn  ?? 0,
    combatants:        combat.combatants ?? [],
    activeCombatantId: combat.combatant?.id ?? null,
  };
}

// --- Targeting (Slice 2) ---

export function getTokenById(tokenId) {
  return canvas.tokens?.get?.(tokenId) ?? null;
}

// Resolve a combat entry (combatant id, the app's entryId) to its placed token
// on the current scene. combat.combatants is a Foundry Collection (Map-like);
// fall back to array .find for the test mock.
export function resolveCombatantToken(entryId) {
  const combat = getActiveCombat();
  if (!combat) return null;
  const combatants = combat.combatants;
  const combatant = combatants?.get?.(entryId)
    ?? (Array.isArray(combatants) ? combatants.find((c) => c.id === entryId) : null);
  if (!combatant) return null;
  const tokenId = getCombatantTokenId(combatant);
  const token = tokenId ? getTokenById(tokenId) : null;
  // A combatant can also expose its token document directly.
  return token ?? combatant.token?.object ?? combatant.token ?? null;
}

// Set the current user's target set (what attack/save automation reads in
// Foundry). updateTokenTargets is the v11+ user API.
export function setUserTargets(tokens) {
  const ids = (tokens || []).map((t) => t?.id).filter(Boolean);
  game.user?.updateTokenTargets?.(ids);
}

// Flanking (Slice 3): enumerate token-id → placed-token for all tokens in the
// current scene. Returns an array of { id, token } only for tokens that are
// actually placed (getActiveTokens returns a live list).
export function getCombatTokenMap() {
  const combat = getActiveCombat();
  if (!combat) return [];
  return (combat.combatants ?? []).map((c) => {
    const tokenId = getCombatantTokenId(c);
    const token = tokenId ? getTokenById(tokenId) : null;
    return { combatantId: c.id, actorId: getCombatantActorId(c), token };
  }).filter((e) => e.token);
}

// Ask the PF2e system whether attackerToken is flanking targetToken.
// TokenPF2e.isFlanking(target) returns true when this token AND at least one
// allied token are on opposite sides of target — the system handles diagonal
// rules, reach, multi-square tokens, and wall-blocking correctly.
// v14 MIGRATION: isFlanking lives on the TokenPF2e placeable, unchanged in v14.
export function checkFlanking(attackerToken, targetToken) {
  return attackerToken?.isFlanking?.(targetToken) ?? false;
}

// --- Token geometry ---
// v14 uses canvas.grid for measurement. All grid/geometry calls go through here.

export function getGridSize() {
  return canvas.scene?.grid?.size ?? 100;
}

// All placed tokens on the current scene (for occupancy / flanking geometry).
export function getAllTokens() {
  return canvas.tokens?.placeables ?? [];
}

// A token's footprint in grid squares, clamped to a 1×1 minimum.
export function getTokenDimensions(token) {
  return {
    width:  Math.max(1, Math.round(token.document?.width  ?? 1)),
    height: Math.max(1, Math.round(token.document?.height ?? 1)),
  };
}

export function getTokenGridPosition(token) {
  const gridSize = getGridSize();
  return {
    col: Math.round(token.x / gridSize),
    row: Math.round(token.y / gridSize),
  };
}

export function gridToPixels(col, row) {
  const gridSize = getGridSize();
  return { x: col * gridSize, y: row * gridSize };
}

// Move a token to a pixel position, tagged so the bridge's own move/update hooks
// ignore the echo.
// [v14-MIGRATION]: v14 introduced a dedicated movement pipeline (TokenDocument.move /
// the moveToken hook). The update() path still functions on v13 and v14; migrate
// here (one switch point) for waypoint support and smoother animation.
export function moveToken(token, x, y) {
  return token.document.update({ x, y }, { [BRIDGE_SOURCE_FLAG]: 'app', animate: true });
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
