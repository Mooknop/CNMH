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

// Builds a pending result entry to append to the queue.
export function buildEarnIncomeResult({
  charId, charName,
  taskLevel, dc,
  skillKey, skillLabel, rank,
  d20, total, degree, payoutCp,
  startedAt,
}) {
  return {
    id: newEntryUid(),
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
