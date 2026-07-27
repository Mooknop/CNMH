// Pure helpers for the shared live encounter state stored at
// cnmh_encounter_global (via useSyncedState). Kept side-effect-free so the
// encounter hook + GM panel + tests all agree on the same algebra.
//
// Order entries carry a stable `entryId` (not `charId`) so non-PC participants
// — generic enemies this slice, fleshed-out stat blocks later — share the same
// shape. `kind: 'pc'` entries additionally carry a `charId` FK into characters.

import { newEntryUid } from './uid';

export const defaultEncounter = () => ({
  active: false,
  phase: 'idle', // 'idle' | 'setup' | 'in-progress' | 'ended'
  round: 0,
  currentTurnIndex: 0,
  order: [],
  log: [],
  saveRequests: [], // pending save requests from players to the GM
  // Resolved save degrees flowing BACK to the caster (#1683). See
  // makeSaveResolution below for the record shape and SAVE_RESOLUTION_LIMIT
  // for the bound. Dies with the encounter (endEncounter resets to this).
  saveResolutions: [],
  // Armed payloads (#987) — damage/save an ability stores at cast that only
  // fires when a LATER trigger happens (Targeting Beacon's beacon exploding on
  // the next hit). Wiring these as cast-time damage would resolve them at the
  // wrong moment, so they sit here until the GM fires them.
  armedPayloads: [],
});

// saveRequest shape:
// { id, ts, casterId, casterName, abilityName, save, dc, basic, rank?,
//   targets:[{entryId,name,saveMod}], status:'pending'|'resolved' }
// rank: the spell's cast rank when the source was a spell (#235).
let _saveReqCounter = 0;
export const makeSaveRequest = (req) => ({
  ...req,
  id: `savereq-${Date.now()}-${++_saveReqCounter}`,
  ts: Date.now(),
  status: 'pending',
});

/**
 * Save-resolution write-back (#1683 — workstream G1 of the Roll Resolution
 * redesign). When the GM resolves a save request, the resolved degrees are
 * additionally recorded on `encounter.saveResolutions` so the CASTER's client
 * can read its own outcome (friction F6: today the degrees die with the
 * request). Purely additive — nothing consumes it yet; G2 (#1689) builds the
 * caster-side result card and the post-outcome damage roll on top of it.
 *
 * Record shape (the G2 contract — keep it stable):
 *
 *   {
 *     id,             // the resolved request's id (`savereq-…`) — stable join key
 *     ts,             // resolution timestamp (ms); also the eviction ordering
 *     casterId,       // charId of the caster — G2 filters on this
 *     casterEntryId,  // caster's encounter entryId, or null when unresolvable
 *     casterName,
 *     abilityName,
 *     rank,           // cast rank when the source was a spell, else null
 *     save,           // defense key ('reflex' | 'fortitude' | 'will' | …)
 *     dc,
 *     basic,          // basic save → the half/double damage ladder applies
 *     results: [{ entryId, name, d20, total, degree }],
 *     damage,         // the request's damage payload snapshot, or null
 *   }
 *
 * `damage` is carried verbatim from the request (`{ entered, expression,
 * typeLabel, riders, degrees? }`) rather than dropped: G2 inverts the flow so
 * the caster rolls damage AFTER seeing the degrees, and computeSaveDamage
 * needs `riders` / `typeLabel` / `degrees` (per-degree multiplier overrides)
 * to derive per-target damage from a freshly-entered total. Without the
 * snapshot G2 would have to re-resolve the ability catalog on the caster's
 * client at result time and could not reproduce the rider choices the caster
 * made at cast time. `entered` is the GM-time total and stays for continuity;
 * G2 replaces it with the post-outcome roll.
 *
 * Caller supplies everything; `ts` is stamped here.
 */
export const makeSaveResolution = (resolution) => ({
  rank: null,
  basic: false,
  damage: null,
  casterEntryId: null,
  ...resolution,
  ts: Date.now(),
});

// Bound on `encounter.saveResolutions` (#1683): only the most recent N records
// are kept, oldest evicted first, so the synced encounter object can't grow
// without limit over a long fight. Ten is comfortably more than the handful a
// caster can have in flight at once (a save request resolves within a turn or
// two of being raised) while staying small enough to ride every encounter
// write. The whole list is also dropped by endEncounter, which resets the
// encounter to defaultEncounter().
export const SAVE_RESOLUTION_LIMIT = 10;

// Append a resolution and evict the oldest beyond the bound.
export const appendSaveResolution = (list, record) =>
  [...(list || []), record].slice(-SAVE_RESOLUTION_LIMIT);

// Armed payload (#987) — a cast's deferred damage/save, parked on the encounter
// until its authored trigger actually happens. Mirrors makeSaveRequest's id
// shape so the GM panel can key on it.
let _armedCounter = 0;

export const makeArmedPayload = (payload) => ({
  ...payload,
  id: `armed-${Date.now()}-${++_armedCounter}`,
  ts: Date.now(),
});

export const isPc = (entry) => !!entry && entry.kind === 'pc';

// The order entry whose turn it currently is. Single source for "who's acting"
// shared by the on-turn panel and the off-turn stage so they never disagree.
export const activeEntry = (encounter) =>
  (encounter?.order || [])[encounter?.currentTurnIndex ?? 0] || null;

// Whether the currently-acting entry is this character's PC turn.
export const isCharTurn = (encounter, charId) => {
  const entry = activeEntry(encounter);
  return !!entry && entry.kind === 'pc' && entry.charId === charId;
};

export const findEntry = (order, entryId) =>
  (order || []).find((e) => e && e.entryId === entryId) || null;

export const findEntryIndex = (order, entryId) =>
  (order || []).findIndex((e) => e && e.entryId === entryId);

// PF2e initiative orders highest first. Stable on ties (Array.sort is stable
// in modern engines; mirror that explicitly via index fallback for safety).
export const sortByInitiative = (order) =>
  [...(order || [])]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const ai = Number.isFinite(a.e?.initiative) ? a.e.initiative : -Infinity;
      const bi = Number.isFinite(b.e?.initiative) ? b.e.initiative : -Infinity;
      if (bi !== ai) return bi - ai;
      return a.i - b.i;
    })
    .map(({ e }) => e);

// Returns { currentTurnIndex, round } for the next turn. Wraps to index 0 and
// bumps the round when the order ends.
export const nextTurnIndex = (order, currentTurnIndex, round) => {
  const len = (order || []).length;
  if (len === 0) return { currentTurnIndex: 0, round };
  const next = currentTurnIndex + 1;
  if (next >= len) return { currentTurnIndex: 0, round: (round || 0) + 1 };
  return { currentTurnIndex: next, round };
};

export const makePcEntry = (character) => ({
  entryId: newEntryUid(),
  kind: 'pc',
  charId: character.id,
  name: character.name,
  initiative: null,
});

export const makeEnemyEntry = (name, initiative) => ({
  entryId: newEntryUid(),
  kind: 'enemy',
  name: String(name || '').trim() || 'Enemy',
  initiative:
    initiative === undefined || initiative === null || initiative === ''
      ? null
      : Number(initiative),
});

// True once every entry has a numeric initiative — gates beginRound1.
export const everyEntryHasInitiative = (order) =>
  (order || []).length > 0 &&
  (order || []).every((e) => Number.isFinite(e?.initiative));
