// Single chokepoint for all PF2e system.* data access AND canvas/movement APIs.
// If PF2e or Foundry changes schema/API in a future version, only this file
// needs updating. Current target: Foundry v13 + PF2e v7.x.
//
// v14 MIGRATION NOTES are marked inline. When Forge recommends v14:
//   1. Bump module.json compatibility.verified to "14"
//   2. Update the two canvas functions marked [v14-MIGRATION] below
//   3. Re-verify system.* data paths (stable across v13→v14 for PF2e 7.x)

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

// Returns a stable creature-type key for an actor: same underlying creature type
// yields the same key within a campaign. Prefers the compendium source UUID; falls
// back to a normalized slug from the base name + level. Foundry appends disambiguators
// like `Goblin Warrior 2` / `Goblin Warrior (3)`; those trailing suffixes are stripped
// so identical creatures collapse to one key.
function creatureKeyFor(actor) {
  const source = actor?._stats?.compendiumSource ?? actor?.flags?.core?.sourceId ?? null;
  if (source) return source;
  const name = actor?.name ?? '';
  const base = name.replace(/\s*\(\d+\)$/, '').replace(/\s+\d+$/, '').trim();
  const level = actor?.system?.details?.level?.value ?? null;
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'creature'}-l${level ?? 0}`;
}

// Returns bestiary data for an NPC/enemy actor: level, rarity, traits, image,
// perception, speed, HP, a plain-text description (HTML stripped), and a stable
// creatureKey for same-type identity.
// Returns null when actor is absent. All fields have safe fallbacks so partial
// actor data never throws.
export function getBestiaryInfo(actor) {
  if (!actor) return null;
  const img = actor.img || actor.prototypeToken?.texture?.src || null;
  const level = actor.system?.details?.level?.value ?? null;
  const rarity = actor.system?.traits?.rarity ?? 'common';
  const traitSlugs = Array.isArray(actor.system?.traits?.value)
    ? actor.system.traits.value
    : [];
  const size = actor.system?.traits?.size?.value ?? null;
  const traits = size ? [size, ...traitSlugs] : traitSlugs;
  const perception = actor.system?.perception?.mod
    ?? actor.system?.attributes?.perception?.value
    ?? null;
  const speed = getSpeed(actor);
  const hp = getHp(actor);
  const rawDescription = actor.system?.details?.publicNotes ?? '';
  const description = rawDescription.replace(/<[^>]+>/g, '').trim();
  const creatureKey = creatureKeyFor(actor);
  return { img, level, rarity, traits, perception, speed, hp, description, creatureKey };
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

// Resolve an effect ref to a source document. Two forms are supported:
//   • a Foundry UUID (e.g. Compendium.pf2e.spell-effects.Item.…) → fromUuid
//   • a "slug:<slug>" ref → the first World Items entry with that slug. This lets
//     content reference a GM-imported world effect (the Courageous Anthem aura,
//     #455) by a stable slug instead of an install-specific world UUID.
async function resolveEffectSource(ref) {
  if (typeof ref !== 'string' || !ref) return null;
  const slugMatch = /^slug:(.+)$/.exec(ref);
  if (slugMatch) {
    const slug = slugMatch[1];
    const items = game.items?.contents ?? (Array.isArray(game.items) ? game.items : []);
    return items.find((i) => i.slug === slug) ?? null;
  }
  return fromUuid(ref);
}

// Apply a PF2e effect item to an actor by ref (UUID or slug: form — see
// resolveEffectSource). Clones the source document and creates it as an embedded
// Item on the actor — producing the effect icon/aura visible in Foundry.
// Tagged with BRIDGE_SOURCE_FLAG so the characterSync item hooks treat the create
// as bridge-originated (no echo back to the app).
// Returns null when the ref resolves to nothing (invalid / wrong pack / not imported).
export async function applyEffectByUuid(actor, ref) {
  const source = await resolveEffectSource(ref);
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

// --- Effect items (Foundry → app effect read-back, #455) ---

export function isEffectItem(item) {
  return item?.type === 'effect';
}

// The owning Actor of an effect Item, or null when it isn't embedded on an actor.
// Shares the parent-document check with conditions; kept separate so callers read
// at the right granularity.
export function getEffectItemActor(item) {
  const actor = item?.parent;
  if (!actor || actor.documentName !== 'Actor') return null;
  return actor;
}

// All active (non-disabled, non-expired) effect items on an actor, as
// { slug, name, img }. This is the snapshot the read-back pushes whenever an
// effect item changes on a synced PC, so the app mirrors Foundry-applied buffs
// (e.g. the Courageous Anthem aura granted to allies in range).
export function getEffects(actor) {
  return (actor?.itemTypes?.effect ?? [])
    .filter((e) => !e.isExpired && !e.system?.disabled)
    .map((e) => ({
      slug: e.slug ?? e.system?.slug ?? null,
      name: e.name,
      img:  e.img ?? null,
    }))
    .filter((e) => e.slug);
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

// --- Chat-message action detection (#472b) ---

// Normalize a PF2e chat message into the action-feed context the bridge needs,
// or null when the message carries no roll context (chat banter, GM narration,
// damage-only cards, etc.) — that null is the "context-typed actions only" filter.
//
// ChatMessagePF2e exposes `actor` / `item` / `target` getters and stashes the
// roll context under flags.pf2e.context. Raw item-cost hints are passed through
// untouched; actorFeed.js maps them to the app's compact 1|2|3|'r'|'f' cost form.
//
// v14 MIGRATION: the ChatMessagePF2e getters and the flags.pf2e.context shape are
// stable across v13→v14 for PF2e 7.x; re-verify the context.type vocabulary only
// if PF2e renames its check domains.
export function getChatMessageContext(message) {
  const context = message?.flags?.pf2e?.context;
  if (!context?.type) return null;

  const actor  = message.actor  ?? null;
  const item   = message.item   ?? null;
  const target = message.target ?? null;

  // Melee vs ranged, for the app's attack reaction triggers (#472c). WeaponPF2e
  // classifies on the presence of a range band: isRanged === !!system.range,
  // isMelee === !isRanged. Non-weapon attacks (e.g. spell attacks) leave it null.
  const attackRange = context.type === 'attack-roll'
    ? (item?.isRanged === true ? 'ranged' : item?.isMelee === true ? 'melee' : null)
    : null;

  // Typed damage read-out (#1355): a damage-roll message's DamageRoll exposes
  // per-type instances — the same IWR-relevant typing the app relays outward on
  // cnmh_dmgapply_global. Surfaced so the actor feed can carry real numbers and
  // types for the app's taken-damage juice. Messages without readable rolls
  // degrade to the pre-#1355 shape (no damage fields).
  const damage = context.type === 'damage-roll' ? damageRollInfo(message) : null;

  return {
    ...(damage ?? {}),
    type:       context.type,                 // attack-roll|spell-cast|skill-check|saving-throw|damage-roll|…
    outcome:    context.outcome ?? null,       // degree of success for checks
    actorId:    actor?.id ?? message.speaker?.actor ?? null,
    itemName:   item?.name ?? null,
    itemType:   item?.type ?? null,
    attackRange,                                // 'ranged' | 'melee' | null
    // Raw cost hints — actorFeed.js normalizes these to the compact form.
    actionCount: item?.system?.actions?.value ?? null,     // actions / feats: 1|2|3
    actionType:  item?.system?.actionType?.value ?? null,  // 'action'|'reaction'|'free'
    spellTime:   item?.system?.time?.value ?? null,        // spells: '1'|'2'|'reaction'|…
    targetActorId: target?.actor?.id ?? null,              // who the action targets (damage/attack)
    targetName:  target?.token?.name ?? target?.actor?.name ?? null,
  };
}

// Per-type totals off a damage-roll message's rolls, or null when nothing is
// readable. Zero/negative instances are dropped; `type` may be '' (untyped).
//
// v14 MIGRATION: DamageRoll#instances and DamageInstance#type/#total are stable
// getters in PF2e 6.x; re-verify if PF2e reworks its roll classes.
function damageRollInfo(message) {
  const rolls = Array.isArray(message?.rolls) ? message.rolls : [];
  const instances = [];
  let total = 0;
  for (const roll of rolls) {
    for (const inst of roll?.instances ?? []) {
      const amount = Number(inst?.total) || 0;
      if (amount <= 0) continue;
      instances.push({ amount, type: inst?.type || '' });
      total += amount;
    }
  }
  return instances.length ? { damageTotal: total, damageInstances: instances } : null;
}

// The installed version of a module (the bridge reads its own for the
// protocol hello, #1310). Null outside Foundry / before modules are ready.
export function getModuleVersion(moduleId) {
  return game.modules?.get?.(moduleId)?.version ?? null;
}

export function getActiveCombat() {
  return game.combat ?? null;
}

export function advanceCombatTurn(combat) {
  return combat.nextTurn();
}

// --- Combat writes (initiative-commit flow, #494/#495) ---
// The bridge runs in the GM client, so these GM-only combat writes are available.
// All three are core CombatEncounter methods (stable across v13→v14 for PF2e 7.x).

// Write several combatants' initiatives in one shot. `initiatives` is an array of
// PF2e SetInitiativeData: { id, value, statistic?, overridePriority? } where `id`
// is the Foundry combatant.id (the encounter payload's entryId).
//
// EncounterPF2e.setMultipleInitiatives batches the writes into a single
// updateEmbeddedDocuments call (one updateCombat hook → one relay push, vs one per
// combatant with setInitiative) and preserves the current turn. `statistic` is the
// PF2e initiative statistic used for tie-breaks; omitting it stores null, which is
// acceptable here — the app sends a precomputed total and tie-break is ordering-only
// (per #494 design). Verified against foundryvtt/pf2e src/module/encounter/document.ts.
// v14 MIGRATION: setMultipleInitiatives is a PF2e EncounterPF2e method (PF2e 7.x);
// re-verify it survives the v14 system release. The base Combat#setInitiative(id,
// value) is the fallback if PF2e ever drops it.
export function setMultipleInitiatives(combat, initiatives) {
  return combat.setMultipleInitiatives(initiatives);
}

// Roll initiative for every NPC combatant that has no initiative yet.
// v14 MIGRATION: Combat#rollNPC() is unchanged in v14.
export function rollNpcInitiatives(combat) {
  return combat.rollNPC();
}

// Begin the encounter (round 1, first turn). Combat#startCombat() flips
// started → true and fires updateCombat.
// v14 MIGRATION: Combat#startCombat() is unchanged in v14.
export function startCombat(combat) {
  return combat.startCombat();
}

// Roll a saving throw for an actor against a DC (#1275 — the app's save-request
// rail). actor.saves[stat] is a PF2e Statistic; roll() resolves the check with
// the actor's LIVE modifiers (frightened, elixirs, …), so the result can differ
// from the app's static bestiary saveMod — the app treats this total as
// authoritative. rollMode 'gmroll' keeps enemy saves off the players' chat.
// Returns { d20, total } (degree is recomputed app-side — computeSaveDegree is
// the one source of truth for nat-20/nat-1 and Incapacitation) or null when the
// actor has no such statistic.
// v14 MIGRATION: Statistic#roll is a PF2e API (src/module/system/statistic);
// re-verify the options bag ({ dc, skipDialog, rollMode }) on the v14 system.
export async function rollActorSave(actor, save, dc) {
  const statistic = actor?.saves?.[save];
  if (typeof statistic?.roll !== 'function') return null;
  const roll = await statistic.roll({
    ...(typeof dc === 'number' ? { dc: { value: dc } } : {}),
    skipDialog: true,
    rollMode: 'gmroll',
  });
  if (!roll) return null;
  return {
    d20: roll.dice?.[0]?.total ?? null,
    total: roll.total ?? null,
  };
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

// --- Damage application (#1016) ---

// Apply a flat, typed damage total to a combatant's actor, letting the PF2e
// system net the target's IWR (immunities/weaknesses/resistances). The app
// always relays the RAW typed total: a typed DamageRoll instance is what makes
// actor.applyDamage run its IWR pipeline — a plain number is applied as-is
// (untyped, no IWR), which is the deliberate path for untyped damage.
// Returns false when there is nothing to apply (no actor / non-positive amount).
// v14 MIGRATION: DamageRoll is looked up in CONFIG.Dice.rolls (PF2e registers
// its roll classes there); actor.applyDamage({ damage, token }) is a PF2e
// ActorPF2e method. Re-verify both against the v14-era system release.
export async function applyTypedDamage(token, amount, type = '') {
  const actor = token?.actor;
  if (!actor?.applyDamage || typeof amount !== 'number' || amount <= 0) return false;
  const tokenDoc = token.document ?? token;
  const DamageRoll = CONFIG.Dice?.rolls?.find?.((R) => R.name === 'DamageRoll');
  if (type && DamageRoll) {
    const roll = await new DamageRoll(`${amount}[${type}]`).evaluate();
    await actor.applyDamage({ damage: roll, token: tokenDoc });
  } else {
    await actor.applyDamage({ damage: amount, token: tokenDoc });
  }
  return true;
}

// Apply several typed damage instances as ONE application (#1019 — a piercing
// sword with a flaming rune). PF2e's DamageRoll takes a comma-separated
// multi-instance formula ('6[piercing],3[fire]'); actor.applyDamage then nets
// the target's IWR per instance within the single application — matching how
// the system applies its own multi-type strike damage. Non-positive instances
// are skipped; an untyped instance contributes a bare (IWR-exempt) term. Falls
// back to a plain summed application when DamageRoll is unavailable.
// v14 MIGRATION: same CONFIG.Dice.rolls + actor.applyDamage surface as
// applyTypedDamage above — re-verify against the v14-era system release.
export async function applyDamageInstances(token, instances) {
  const actor = token?.actor;
  const parts = (instances || []).filter((i) => typeof i?.amount === 'number' && i.amount > 0);
  if (!actor?.applyDamage || !parts.length) return false;
  const tokenDoc = token.document ?? token;
  const DamageRoll = CONFIG.Dice?.rolls?.find?.((R) => R.name === 'DamageRoll');
  if (!DamageRoll) {
    const total = parts.reduce((sum, i) => sum + i.amount, 0);
    await actor.applyDamage({ damage: total, token: tokenDoc });
    return true;
  }
  const formula = parts
    .map((i) => (i.type ? `${i.amount}[${i.type}]` : `${i.amount}`))
    .join(',');
  const roll = await new DamageRoll(formula).evaluate();
  await actor.applyDamage({ damage: roll, token: tokenDoc });
  return true;
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

// A token's disposition relative to the party. Foundry's CONST.TOKEN_DISPOSITIONS:
// FRIENDLY = 1, NEUTRAL = 0, HOSTILE = -1, SECRET = -2. Used to classify which
// kind of creature blocks a movement square (ally vs enemy).
export function getTokenDisposition(token) {
  return token?.document?.disposition ?? token?.disposition ?? 0;
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

// Create a token for an actor on the active scene at a pixel position (#362).
// Builds the token from the actor's prototype token (so it inherits art/size/
// vision), then places it. Tagged with BRIDGE_SOURCE_FLAG for consistency with
// the other bridge writes. Returns null when there's no scene to place into.
export function createTokenForActor(actor, x, y) {
  const scene = canvas.scene;
  if (!scene?.createEmbeddedDocuments || !actor) return null;
  const tokenData = actor.prototypeToken?.toObject?.() ?? {};
  tokenData.x = x;
  tokenData.y = y;
  return scene.createEmbeddedDocuments('Token', [tokenData], { [BRIDGE_SOURCE_FLAG]: 'app' });
}

// Find an open 1×1 cell adjacent to a token to drop a spawned minion into (#362).
// Scans the 8 neighbours, skipping cells occupied by any token or blocked by a
// wall (center-to-center, matching the movement probe). Falls back to the owner's
// own cell if every neighbour is taken — a visible overlap beats no token.
export function findOpenAdjacentCell(ownerToken) {
  const gridSize = getGridSize();
  const { col: originCol, row: originRow } = getTokenGridPosition(ownerToken);

  const occupied = new Set();
  for (const t of getAllTokens()) {
    const baseCol = Math.round(t.x / gridSize);
    const baseRow = Math.round(t.y / gridSize);
    const { width, height } = getTokenDimensions(t);
    for (let c = 0; c < width; c++) {
      for (let r = 0; r < height; r++) occupied.add(`${baseCol + c},${baseRow + r}`);
    }
  }

  const { width: oW, height: oH } = getTokenDimensions(ownerToken);
  const fromX = ownerToken.x + (oW * gridSize) / 2;
  const fromY = ownerToken.y + (oH * gridSize) / 2;
  const half = gridSize / 2;

  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dc === 0 && dr === 0) continue;
      const col = originCol + dc;
      const row = originRow + dr;
      if (occupied.has(`${col},${row}`)) continue;
      const { x, y } = gridToPixels(col, row);
      if (hasWallCollision(fromX, fromY, x + half, y + half)) continue;
      return { x, y };
    }
  }
  return gridToPixels(originCol, originRow);
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

// All player-character actors on this world (hasPlayerOwner = true, type =
// 'character'). Used to push cnmh_roster_global so the app can resolve
// charId → token outside of active combat.
export function getPlayerActors() {
  return (game.actors?.contents ?? []).filter(
    (a) => a.type === 'character' && a.hasPlayerOwner
  );
}

// World actors filed under the named folder, mapped to the summon-pool shape the
// app's Add-summon flow consumes (#261). Stats reuse the same extractors as
// combat enemies, so a summoned creature carries identical defenses/HP. The GM
// curates the folder in Foundry; an empty/absent folder yields [].
export function getSummonFolderActors(folderName) {
  const target = folderName || 'Summons';
  return (game.actors?.contents ?? [])
    .filter((a) => a.folder?.name === target)
    .map((a) => {
      const bestiary = getBestiaryInfo(a);
      return {
        key:      getActorId(a),
        name:     a.name,
        level:    bestiary?.level ?? null,
        hp:       { max: bestiary?.hp?.max ?? 0 },
        defenses: getDefenses(a),
        traits:   bestiary?.traits ?? [],
        img:      bestiary?.img ?? null,
      };
    });
}

// Derive companion/familiar → owner-PC links from Foundry actor ownership (#362).
// A minion actor is a player-owned `familiar` (role 'familiar') or a player-owned
// `npc` animal companion (role 'companion'); it's tied to the PC owned by the same
// player user. `actorMap` is the app's { foundryActorId: charId } map, which tells
// us which Foundry PC actor corresponds to which app charId.
//
// Returns [{ foundryActorId, ownerCharId, role, name, onScene }]. Actors whose
// owning player has no mapped PC are skipped (we can't name an owner for them).
export function getMinionActorLinks(actorMap = {}) {
  const map = actorMap || {};
  const allActors = game.actors?.contents ?? [];
  const users = game.users?.contents ?? (Array.isArray(game.users) ? game.users : []);
  const gmUserIds = new Set(users.filter((u) => u?.isGM).map((u) => u.id));
  // Foundry CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER === 3; fall back to the literal
  // so the derivation is testable without the full Foundry CONST global.
  const OWNER = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;

  // Non-GM user ids that own (OWNER level) the given actor.
  const playerOwnerIds = (actor) =>
    Object.entries(actor.ownership ?? {})
      .filter(([uid, lvl]) => lvl === OWNER && uid !== 'default' && !gmUserIds.has(uid))
      .map(([uid]) => uid);

  // player user id → the app charId of the PC they own (first match wins).
  const userToCharId = {};
  for (const actor of allActors) {
    if (actor.type !== 'character' || !actor.hasPlayerOwner) continue;
    const charId = map[getActorId(actor)];
    if (!charId) continue;
    for (const uid of playerOwnerIds(actor)) {
      if (!(uid in userToCharId)) userToCharId[uid] = charId;
    }
  }

  const links = [];
  for (const actor of allActors) {
    let role = null;
    if (actor.type === 'familiar') role = 'familiar';
    else if (actor.type === 'npc' && actor.hasPlayerOwner) role = 'companion';
    if (!role) continue;
    const ownerCharId = playerOwnerIds(actor)
      .map((uid) => userToCharId[uid])
      .find(Boolean);
    if (!ownerCharId) continue;
    links.push({
      foundryActorId: getActorId(actor),
      ownerCharId,
      role,
      name: actor.name,
      onScene: getActorTokens(actor).length > 0,
    });
  }
  return links;
}

// --- Door / wall data ---

export function getSceneWalls() {
  return canvas.walls?.placeables ?? [];
}

export function getWallById(id) {
  return canvas.walls?.get?.(id) ?? null;
}

// A wall is a door when door > 0 (1 = door, 2 = secret door).
export function isDoor(wall) {
  return (wall?.document?.door ?? wall?.door ?? 0) > 0;
}

// Door state: 0 = closed, 1 = open, 2 = locked.
export function getDoorState(wall) {
  return wall?.document?.ds ?? wall?.ds ?? 0;
}

// Returns the wall's endpoint coords as [x1, y1, x2, y2].
export function getWallCoords(wall) {
  return wall?.document?.c ?? wall?.c ?? [0, 0, 0, 0];
}

// Set a door's state (0 closed / 1 open / 2 locked).
// Tagged with BRIDGE_SOURCE_FLAG so the bridge's own updateWall handler
// can skip the echo when it originates from the app.
export function setDoorState(wall, ds) {
  return wall.document.update({ ds }, { [BRIDGE_SOURCE_FLAG]: 'app' });
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

// --- Hooks + settings seam (#1313) -------------------------------------------
// Feature modules never touch the Hooks/game globals directly (enforced by
// eslint no-restricted-globals); registration funnels through these so a
// [v14-MIGRATION] hook-name or signature change is a one-file fix. bridge.js
// (the Foundry entry point) is the only other file allowed at the globals.

// Register a persistent Foundry hook handler.
export function onHook(name, fn) {
  Hooks.on(name, fn);
}

// Read one of this module's registered settings; undefined when the settings
// registry isn't ready (e.g. before init) or the key is unknown.
export function getModuleSetting(moduleId, key) {
  try {
    return game.settings?.get(moduleId, key);
  } catch {
    return undefined;
  }
}
