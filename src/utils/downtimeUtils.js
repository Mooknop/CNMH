// Pure derivations from the downtime ledger and block state.
// None of these functions mutate state — safe to call from render.
//
// Ledger shape: Array<{ day: string, night: string | null }>
//   day   — activity name assigned to the 8h daytime block
//   night — activity name assigned to the extra 8h night block, or null (= rest)

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
