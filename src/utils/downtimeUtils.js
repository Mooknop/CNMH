// Pure derivations from the downtime ledger and block state.
// None of these functions mutate state — safe to call from render.
//
// Ledger shape: Array<{ day: string, night: string | null }>
//   day   — activity name assigned to the 8h daytime block
//   night — activity name assigned to the extra 8h night block, or null (= rest)
//
// Period scoping: per-character downtime state (cnmh_downtime_<id>) is
// { periodStartedAt, selected, ledger }. A "period" is the active block, keyed
// by block.startedAt. State only counts toward the current period when its
// periodStartedAt matches — so stale state from a prior period reads as empty
// (a lazy, declarative reset). All writers must re-stamp via stampPeriod.

// Period identity is compared by value, not reference: block.startedAt is the
// gameDate object, which round-trips through JSON (WebSocket/localStorage) and
// is a fresh object on every read, so === would never match.
const periodKey = (v) => (v == null ? null : JSON.stringify(v));

// True when the stored downtime state belongs to the active period.
export function isCurrentPeriod(downtime, startedAt) {
  if (startedAt == null || !downtime || downtime.periodStartedAt == null) return false;
  return periodKey(downtime.periodStartedAt) === periodKey(startedAt);
}

// Period-scoped view of the stored state: the stored selected/ledger when they
// belong to the active period, otherwise empty (the prior period is forgotten).
export function periodState(downtime, startedAt) {
  if (isCurrentPeriod(downtime, startedAt)) {
    return { selected: downtime.selected || [], ledger: downtime.ledger || [] };
  }
  return { selected: [], ledger: [] };
}

// Builds the next stored value for a write, stamping the active period and
// starting from a fresh base whenever the prior state is from another period.
export function stampPeriod(downtime, startedAt, patch) {
  const base = periodState(downtime, startedAt);
  return { ...base, ...patch, periodStartedAt: startedAt ?? null };
}

// Returns the total number of 8h blocks assigned to a named activity.
function countBlocksFor(ledger, name) {
  let count = 0;
  for (const entry of (ledger || [])) {
    if (entry.day === name) count++;
    if (entry.night === name) count++;
  }
  return count;
}

// Hours banked for an accumulate-type activity (each block = 8h).
export function getHoursForActivity(ledger, name) {
  return countBlocksFor(ledger, name) * 8;
}

// Number of rolls accrued for an instant-type activity (1 roll per block).
export function getRollsForActivity(ledger, name) {
  return countBlocksFor(ledger, name);
}

// Number of whole days committed (each ledger entry represents one day).
export function getDaysCommitted(ledger) {
  return (ledger || []).length;
}

// Days still available in the block budget (clamped to 0).
export function getRemainingDays(ledger, blockDays) {
  return Math.max(0, (blockDays || 0) - getDaysCommitted(ledger));
}

// True when the most-recently committed day had a night block (Fatigued
// until the next rest day). An empty ledger is always well-rested.
export function isFatigued(ledger) {
  const list = ledger || [];
  if (list.length === 0) return false;
  return list[list.length - 1].night != null;
}
