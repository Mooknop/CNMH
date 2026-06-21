// Earn Income result-queue helpers (#231) — pure, React-free.
//
// The queue lives in `cnmh_downtimeresults_global`: a flat array of result
// entries the player submits (status 'pending') and the GM later confirms or
// rejects (Slice 3). Entries are scoped to the downtime period they belong to
// by `periodStartedAt`, compared by value (the gameDate object round-trips
// through JSON, so === never matches — same rule as downtimeUtils).

import { newEntryUid } from './uid';

const periodKey = (v) => (v == null ? null : JSON.stringify(v));

// Every result this character submitted in the given period.
export function resultsForCharPeriod(results, charId, startedAt) {
  return (results || []).filter(
    (r) => r.charId === charId && periodKey(r.periodStartedAt) === periodKey(startedAt),
  );
}

// How many committed Earn Income rolls this PC still owes a result for, this
// period: committed-roll count minus results already submitted (clamped to 0).
export function pendingRollSlots({ results, charId, startedAt, committedRolls }) {
  const resolved = resultsForCharPeriod(results, charId, startedAt).length;
  return Math.max(0, (committedRolls || 0) - resolved);
}

// The entries still awaiting GM action, newest last.
export function pendingResults(results) {
  return (results || []).filter((r) => r.status === 'pending');
}

// Flips a queued entry to 'confirmed' (it stays in the queue as a resolved
// record so the player's roll slot remains consumed and gold isn't re-credited).
export function markConfirmed(results, id) {
  return (results || []).map((r) => (r.id === id ? { ...r, status: 'confirmed' } : r));
}

// Drops a queued entry entirely. Used on Reject so the player's committed roll
// frees up again (pendingRollSlots stops counting it) and they can re-submit.
export function removeResult(results, id) {
  return (results || []).filter((r) => r.id !== id);
}

// Builds a pending Earn Income result entry to append to the queue.
export function buildEarnIncomeResult({
  charId, charName,
  taskLevel, dc,
  skillKey, skillLabel, rank,
  d20, total, degree, payoutCp,
  startedAt,
}) {
  return {
    id: newEntryUid(),
    kind: 'earn-income',
    charId,
    charName,
    taskLevel,
    dc,
    skillKey,
    skillLabel,
    rank,
    d20,
    total,
    degree,
    payoutCp,
    status: 'pending',
    periodStartedAt: startedAt ?? null,
    ts: Date.now(),
  };
}

// Builds a pending Crafting completion entry. The GM confirm grants the item
// into the character doc (applyCrafting.grantCraftedItem); the gold was already
// spent player-side, so this entry is item-only.
export function buildCraftingResult({
  charId, charName,
  ref, level, itemName,
  degree, paidCp,
  startedAt,
}) {
  return {
    id: newEntryUid(),
    kind: 'crafting',
    charId,
    charName,
    ref,
    level: level ?? null,
    itemName,
    degree,
    paidCp,
    status: 'pending',
    periodStartedAt: startedAt ?? null,
    ts: Date.now(),
  };
}

// Builds a pending Retrain completion entry. Records the structured intent
// (what is being swapped); the GM confirm just logs it — the actual sheet edit
// stays a manual change.
export function buildRetrainResult({
  charId, charName,
  retrainType, fromLabel, toLabel,
  startedAt,
}) {
  return {
    id: newEntryUid(),
    kind: 'retrain',
    charId,
    charName,
    retrainType,
    fromLabel: fromLabel ?? null,
    toLabel: toLabel ?? null,
    status: 'pending',
    periodStartedAt: startedAt ?? null,
    ts: Date.now(),
  };
}

// Builds a pending Research completion entry. The unlock content is resolved by
// the GM (Research Topics, #206); this only records that the benchmark was met.
export function buildResearchResult({ charId, charName, topic, startedAt }) {
  return {
    id: newEntryUid(),
    kind: 'research',
    charId,
    charName,
    topic,
    status: 'pending',
    periodStartedAt: startedAt ?? null,
    ts: Date.now(),
  };
}

// True if this PC already submitted a result of `kind` for the active period —
// used to keep an accumulate-completion prompt from re-firing once submitted.
export function hasAccumulateResult(results, charId, startedAt, kind) {
  return resultsForCharPeriod(results, charId, startedAt).some((r) => r.kind === kind);
}
