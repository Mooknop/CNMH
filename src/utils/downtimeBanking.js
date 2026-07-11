// Shared hour-banking math for accumulate-type downtime activities that split
// planned hours across parallel targets (#1191 S1). Extracted from the
// Crafting bank in DowntimeAllocator so Training reuses the identical
// delta-bank instead of a second copy.
//
// Model: a plan allocates whole days (8h each) to an activity. On lock-in the
// activity's hours are banked into its targets (craft projects / training
// tracks) and recorded per-target in an `applied` map ({ [targetId]: hours })
// kept on the period-scoped downtime state. Banked hours are IRREVERSIBLE
// within the period — re-locking an edited plan banks only the new delta, and
// the activity's slider can't drop below the banked floor.
//
// Targets are anything with { id, hours }. All functions are pure.

// Total hours already banked this period (the applied map's sum).
export function appliedHours(applied) {
  return Object.values(applied || {}).reduce((s, h) => s + (Number(h) || 0), 0);
}

// The lowest day-count the activity's slider may show: days whose hours are
// already spent on targets can't be un-planned.
export function bankedFloorDays(applied) {
  return Math.ceil(appliedHours(applied) / 8);
}

// Hours planned but not yet banked into any target.
export function availableToBankHours(planDaysCount, applied) {
  return Math.max(0, (Number(planDaysCount) || 0) * 8 - appliedHours(applied));
}

// Default split of the un-banked hours: everything on the furthest-along
// target (ported from DowntimeCommitBar). Returns { [targetId]: hours }.
export function defaultAllocations(targets, available) {
  if (!targets?.length || available <= 0) return {};
  const furthest = targets.reduce((a, b) => ((a.hours || 0) >= (b.hours || 0) ? a : b));
  const alloc = Object.fromEntries(targets.map((t) => [t.id, 0]));
  alloc[furthest.id] = available;
  return alloc;
}

// Sum of a manual allocation across the given targets.
export function allocationsTotal(targets, allocations) {
  return (targets || []).reduce((s, t) => s + ((allocations || {})[t.id] ?? 0), 0);
}

// A plan can lock in only when every un-banked hour has a target (or there is
// nothing to distribute).
export function allocationsBalanced(targets, allocations, available) {
  return available === 0 || !targets?.length || allocationsTotal(targets, allocations) === available;
}

// The next applied map after banking `allocations` — existing per-target
// entries accumulate so later re-locks only bank further deltas.
export function recordApplied(applied, targets, allocations) {
  const next = { ...(applied || {}) };
  for (const t of targets || []) {
    const add = (allocations || {})[t.id] ?? 0;
    if (add > 0) next[t.id] = (next[t.id] || 0) + add;
  }
  return next;
}
