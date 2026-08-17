// Aura emanations (#1733 S1 + S2): the app says "this character's aura is on,
// 15 ft", the bridge draws a token-attached emanation Region that follows the
// creature around the map, and pushes back who is standing in it.
//
// Protocol (protocol ≥ 19):
//   app → bridge:  cnmh_auraset_<charId>     = { active, feet, label?, color?, ts }
//   bridge → app:  cnmh_auramembers_<charId> = { inside: [{ entryId?, tokenId,
//                                                 name, disposition, hidden }], ts }
//
// FIRE-AND-FORGET. There is no ack channel in either direction: the ring is
// presentational and `auramembers` is the read-back. Nothing in here may throw
// out of a handler — a failure logs `CNMH Bridge | …` and the app is simply no
// worse off than a disconnected bridge (the app-only `cnmh_aura_<charId>` key
// stays authoritative for impulse gating either way).
//
// V14-ONLY. `RegionDocument.createTokenEmanation` is a 14.353 API and there is
// no honest v13 equivalent — a MeasuredTemplate does not follow its caster. A
// v13 world (or a v14 build without the capability) no-ops: no ring, and no
// membership pushes to describe a ring that isn't there.
//
// RADIUS IS AUTHORED, NEVER GUESSED (#1733 ruling). `feet` comes from the
// activating ability's `areaShape { shape:'emanation', feet }`; an aura with no
// authored size is never sent, and a payload that arrives without a positive
// `feet` is treated as a deactivation rather than as a default-sized ring.
//
// HOW ENTER/EXIT IS ACTUALLY DETECTED. See REGION_HOOKS in pf2eAdapter.js for
// the long version: v14 core routes `CONST.REGION_EVENTS.TOKEN_ENTER` /
// `TOKEN_EXIT` to RegionBehaviorType instances ONLY — there is no core hook for
// them. So membership is recomputed off the token lifecycle hooks the bridge
// already trusts (`updateToken`/`createToken`/`deleteToken`, exactly what
// positions.js listens to), and the enter/exit *semantics* are recovered by
// pushing only when the membership set genuinely changed. A creature can only
// enter or leave an aura by something moving, appearing, or being removed, so
// the two are observably equivalent — and this one is provable in tests.
// Membership itself is read from core (`RegionDocument#tokens`) whenever core
// will answer; the geometric fallback below only runs when it won't.

import {
  REGION_HOOKS,
  createTokenAuraRegion,
  deleteRegion,
  findBridgeAuraRegions,
  getAllTokens,
  getCombatTokenMap,
  getGridDistance,
  getGridSize,
  getRegionTokens,
  getTokenDimensions,
  getTokenDisposition,
  getTokenGridPosition,
  getTokenIdentity,
  getTokenName,
  isTokenHidden,
  onHook,
} from './pf2eAdapter.js';
import { resolveToken } from './movement.js';
import { RELAY } from './syncKeys.js';

let _sendUpdate = null;

// charId → { feet, label, color, regionId } for every aura the bridge believes
// is live. The single source of truth for "is this aura active" — the sweep and
// every recompute read it.
const _auras = new Map();

// charId → the last `inside` signature put on the wire, so a token move that
// changes nobody's membership stays off the relay.
const _lastSent = new Map();

// The connect-time sweep only runs for a genuine (re)connection. `ws.onopen`
// arms it; the FULL_STATE that follows fires and disarms it.
let _sweepArmed = false;

export function initAuras(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
  _resetAuras();

  // Defensive registration, the pathPreview.js pattern: a build that renamed or
  // never emits one of these names just never fires it, and must not take the
  // module's init down on the way past.
  registerHook(REGION_HOOKS.TOKEN_UPDATE, () => refreshAllAuras());
  registerHook(REGION_HOOKS.TOKEN_CREATE, () => refreshAllAuras());
  registerHook(REGION_HOOKS.TOKEN_DELETE, () => refreshAllAuras());
  // Opportunistic: on 14.365 these never fire (region events reach behavior
  // documents, not Hooks). Harmless if they ever start to — the recompute is
  // idempotent and de-duplicated.
  registerHook(REGION_HOOKS.TOKEN_ENTER, () => refreshAllAuras());
  registerHook(REGION_HOOKS.TOKEN_EXIT, () => refreshAllAuras());
}

function registerHook(name, fn) {
  if (!name) return;
  try {
    onHook(name, fn);
  } catch {
    // No hook registry (or a build that rejects the name): no live membership
    // updates, no crash. Creation-time membership still pushes.
  }
}

// Test seam / reconnect hygiene: forget every aura WITHOUT touching the canvas.
// (The canvas half is sweepOrphanAuraRegions, which deliberately runs first.)
export function _resetAuras() {
  _auras.clear();
  _lastSent.clear();
  _sweepArmed = false;
}

// charIds the bridge currently believes have a live ring — exported for tests
// and for anything that later wants to reason about active auras.
export function getActiveAuraCharIds() {
  return [..._auras.keys()];
}

// --- inbound: cnmh_auraset_<charId> -----------------------------------------

// Idempotent by construction: an existing ring for this charId is deleted
// BEFORE a new one is created, so re-activation (a changed radius, a re-cast, a
// FULL_STATE replay) swaps the ring rather than stacking a second one on the
// same creature.
export async function handleAuraSet(charId, value) {
  if (!charId) return;
  try {
    const feet = Number(value?.feet);
    // Deactivation, an unauthored/invalid radius, and an unresolvable token all
    // land on the same teardown — there is no such thing as a default aura.
    if (!value?.active || !(feet > 0)) {
      await teardownAura(charId);
      return;
    }

    const token = resolveToken(charId);
    if (!token) {
      await teardownAura(charId);
      return;
    }

    await deleteAuraRegion(charId);

    const regionId = await createTokenAuraRegion({
      token,
      feet,
      label: value?.label ?? '',
      color: value?.color ?? '',
      charId,
    });
    if (!regionId) {
      // v13, or a v14 build without createTokenEmanation. Nothing was drawn, so
      // there is no membership to describe — stay silent rather than pushing an
      // empty set that reads as "your aura is empty".
      _auras.delete(charId);
      _lastSent.delete(charId);
      return;
    }

    _auras.set(charId, {
      feet, label: value?.label ?? '', color: value?.color ?? '', regionId,
    });
    // Initial membership: who was already standing inside when the ring lit up.
    pushAuraMembers(charId, { force: true });
  } catch (err) {
    console.error('CNMH Bridge | aura activation failed:', err);
  }
}

// Delete the ring (if any) and forget the aura. Silent — the caller decides
// whether the app hears about it.
async function deleteAuraRegion(charId) {
  const existing = _auras.get(charId);
  if (existing?.regionId) await deleteRegion(existing.regionId);
  _auras.delete(charId);
}

// Full teardown: ring gone AND the app told, with the empty push the contract
// promises on deactivation. Unconditional — a deactivation for an aura the
// bridge never had still clears whatever the app is showing.
async function teardownAura(charId) {
  await deleteAuraRegion(charId);
  _lastSent.set(charId, '');
  _sendUpdate?.(charId, RELAY.AURAMEMBERS, { inside: [], ts: Date.now() });
}

// --- outbound: cnmh_auramembers_<charId> ------------------------------------

// Recompute one aura's membership and push it if it changed (or `force`).
// Returns the payload actually sent, or null.
export function pushAuraMembers(charId, { force = false } = {}) {
  if (!_sendUpdate || !_auras.has(charId)) return null;

  const inside = computeAuraMembers(charId);
  const signature = JSON.stringify(inside);
  if (!force && _lastSent.get(charId) === signature) return null;
  _lastSent.set(charId, signature);

  const payload = { inside, ts: Date.now() };
  _sendUpdate(charId, RELAY.AURAMEMBERS, payload);
  return payload;
}

// Every live aura, recomputed. Driven by the token hooks — cheap because the
// map is empty for the overwhelmingly common "nobody has an aura up" case.
export function refreshAllAuras() {
  if (!_auras.size) return;
  for (const charId of [..._auras.keys()]) {
    // The aura's own token vanishing (deleted, or moved off this scene) tears
    // the ring down and tells the app, rather than leaving a stale ring behind.
    if (!resolveToken(charId)) {
      teardownAura(charId).catch((err) =>
        console.error('CNMH Bridge | aura teardown failed:', err));
      continue;
    }
    pushAuraMembers(charId);
  }
}

// Who is inside `charId`'s aura, in wire order (stable: by tokenId).
//
// The aura's OWN token is excluded — the app knows the caster stands in their
// own aura, and shipping them would make every consumer filter it back out.
// Hidden tokens ARE included, flagged: GM surfaces need the complete picture and
// player-facing surfaces drop them on the flag (the positions / encounter
// convention, #1749 OQ-5).
export function computeAuraMembers(charId) {
  const state = _auras.get(charId);
  if (!state) return [];

  const ownerToken = resolveToken(charId);
  if (!ownerToken) return [];
  const ownerTokenId = getTokenIdentity(ownerToken).tokenId;

  // Core's own answer first; our geometry only when core won't answer.
  const contained = getRegionTokens(state.regionId)
    ?? geometricMembers(ownerToken, state.feet);

  const combatMap = getCombatTokenMap();
  const entries = [];
  for (const token of contained) {
    const { tokenId } = getTokenIdentity(token);
    if (!tokenId || tokenId === ownerTokenId) continue;
    // entryId only when the token is in the CURRENT combat — absent for a
    // non-combatant, the same optionality rule as `pathpreview.id`.
    const entryId = combatMap.find((e) => e.token?.id === tokenId)?.combatantId ?? null;
    entries.push({
      ...(entryId ? { entryId } : {}),
      tokenId,
      name: getTokenName(token),
      disposition: getTokenDisposition(token),
      hidden: isTokenHidden(token),
    });
  }
  entries.sort((a, b) => String(a.tokenId).localeCompare(String(b.tokenId)));
  return entries;
}

// --- geometric fallback ------------------------------------------------------

// PF2e counts the first diagonal as 5 ft, the second as 10, alternating — so N
// diagonal steps cost N + floor(N / 2) squares. Distance between two token
// FOOTPRINTS, in feet: the emanation runs from the edge of the creature's
// space, so a Large aura source reaches a square further than a Medium one.
export function pf2eGridDistanceFeet(a, b, gridDistance = 5) {
  // Gap between the two footprints along each axis, 0 when they overlap.
  const gap = (aMin, aSize, bMin, bSize) =>
    Math.max(0, Math.max(aMin - (bMin + bSize - 1), bMin - (aMin + aSize - 1)));
  const dCols = gap(a.col, a.width, b.col, b.width);
  const dRows = gap(a.row, a.height, b.row, b.height);
  const diagonals = Math.min(dCols, dRows);
  const straights = Math.max(dCols, dRows) - diagonals;
  return (straights + diagonals + Math.floor(diagonals / 2)) * gridDistance;
}

// Used only when `RegionDocument#tokens` is unreadable — a build that moved the
// property, or a Region core hasn't finished bookkeeping. Approximate on
// purpose: it is a safety net under core's own answer, not a second rules
// engine. Footprint-aware, so a 2x2 ogre standing at the rim counts.
function geometricMembers(ownerToken, feet) {
  const gridSize = getGridSize();
  if (!gridSize) return [];
  const gridDistance = getGridDistance();
  const footprint = (token) => ({
    ...getTokenGridPosition(token),
    ...getTokenDimensions(token),
  });
  const owner = footprint(ownerToken);
  const ownerTokenId = getTokenIdentity(ownerToken).tokenId;

  return getAllTokens().filter((token) => {
    const { tokenId } = getTokenIdentity(token);
    if (!tokenId || tokenId === ownerTokenId) return false;
    return pf2eGridDistanceFeet(owner, footprint(token), gridDistance) <= Number(feet);
  });
}

// --- connect-time sweep + FULL_STATE replay ---------------------------------

// Armed by `ws.onopen`, fired by the FULL_STATE that follows it. The relay
// always sends FULL_STATE on connect (worker/CampaignSession.js), so arming is
// what keeps the sweep tied to a real reconnection instead of running on any
// FULL_STATE that might arrive later in a session.
export function armAuraSweep() {
  _sweepArmed = true;
}

// Delete EVERY bridge-stamped aura Region on the scene and forget them all.
//
// Sweep-then-replay, not diff-then-patch, and the order matters: after a Foundry
// reload the in-memory registry is empty, so a surviving ring on the canvas is
// indistinguishable from an orphan left by a world that crashed mid-aura. Rather
// than guess, the sweep clears the slate and the replay immediately re-creates a
// fresh ring for every aura FULL_STATE still says is active. Re-creating is
// cheap (one document write per active aura, and active auras are rare), while
// the alternative silently accumulates dead rings on the map forever.
export async function sweepOrphanAuraRegions() {
  const found = findBridgeAuraRegions();
  _auras.clear();
  _lastSent.clear();
  for (const { regionId } of found) {
    await deleteRegion(regionId);
  }
  return found.length;
}

// FULL_STATE handler. `auraset` is a PERSISTED channel: a bridge restart must
// bring every still-active ring back, and it replays through the SAME
// handleAuraSet the live rail uses so there is one activation path, not two.
export async function replayAuraState(payload) {
  if (!_sweepArmed) return;
  _sweepArmed = false;
  try {
    await sweepOrphanAuraRegions();
    for (const [charId, state] of Object.entries(payload || {})) {
      if (charId === 'global') continue;
      const stored = state?.[RELAY.AURASET];
      if (!stored) continue;
      await handleAuraSet(charId, stored);
    }
  } catch (err) {
    console.error('CNMH Bridge | aura replay failed:', err);
  }
}
