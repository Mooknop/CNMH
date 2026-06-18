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
