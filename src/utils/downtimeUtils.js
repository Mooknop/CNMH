// Pure derivations from the downtime ledger and block state.
// None of these functions mutate state — safe to call from render.
//
// Ledger shape: Array<{ day: string, night: string | null }>
//   day   — activity name assigned to the 8h daytime block
//   night — activity name assigned to the extra 8h night block, or null (= rest)
//
// Period scoping: per-character downtime state (cnmh_downtime_<id>) is
// { periodStartedAt, plan, status, paired, selected, ledger }. A "period" is the
// active block, keyed by block.startedAt. State only counts toward the current
// period when its periodStartedAt matches — so stale state from a prior period
// reads as empty (a lazy, declarative reset). All writers must re-stamp via
// stampPeriod.
//
// Allocation model (Party Ledger): `plan` is the source of truth —
//   { [activityName]: days }, e.g. { Research: 3, 'Earn Income': 2 }.
// `status` is 'planning' | 'ready' (explicit lock-in); `paired` is a
// { [activityName]: true } map of Follow-the-Expert links. To keep every
// downstream reader working unchanged, `selected`/`ledger` are *derived* from
// `plan` whenever a plan is present (a plan of `d` days for activity X becomes
// `d` ledger entries of { day: X, night: null }). State written by the legacy
// picker/commit-bar (no `plan`) keeps its explicit `selected`/`ledger` instead.

// Period identity is compared by value, not reference: block.startedAt is the
// gameDate object, which round-trips through JSON (WebSocket/localStorage) and
// is a fresh object on every read, so === would never match.
const periodKey = (v) => (v == null ? null : JSON.stringify(v));

// True when the stored downtime state belongs to the active period.
export function isCurrentPeriod(downtime, startedAt) {
  if (startedAt == null || !downtime || downtime.periodStartedAt == null) return false;
  return periodKey(downtime.periodStartedAt) === periodKey(startedAt);
}

// Total days allocated across a plan.
export function planDays(plan) {
  return Object.values(plan || {}).reduce((sum, d) => sum + (Number(d) || 0), 0);
}

// The activities a plan is pursuing — the derived `selected` list (keys with
// at least one day), in the plan's own key order.
export function planSelected(plan) {
  return Object.keys(plan || {}).filter((name) => (Number(plan[name]) || 0) > 0);
}

// Expands a plan into a ledger: `d` whole-day entries per activity ({ day, night:
// null }), so the hours/rolls/days derivations read it identically to a committed
// ledger. Order follows the plan's keys (the allocator builds them in canonical
// activity order); ledger consumers count blocks, so order is not significant.
export function planToLedger(plan) {
  const ledger = [];
  for (const name of Object.keys(plan || {})) {
    const days = Math.max(0, Math.floor(Number(plan[name]) || 0));
    for (let i = 0; i < days; i++) ledger.push({ day: name, night: null });
  }
  return ledger;
}

// Clamps a plan so its total never exceeds `budget`: floors and drops
// non-positive day-counts, then greedily fills in key order, truncating the
// entry that would overflow and dropping everything past the budget.
export function clampPlan(plan, budget) {
  const cap = Math.max(0, Math.floor(Number(budget) || 0));
  const out = {};
  let used = 0;
  for (const [name, raw] of Object.entries(plan || {})) {
    const want = Math.max(0, Math.floor(Number(raw) || 0));
    if (want <= 0) continue;
    const give = Math.min(want, cap - used);
    if (give <= 0) continue;
    out[name] = give;
    used += give;
  }
  return out;
}

// Period-scoped view of the stored state. For the active period this returns the
// full allocation view — { plan, status, paired, selected, ledger } — deriving
// selected/ledger from the plan when one is present, else falling back to the
// legacy explicit selected/ledger. A stale (prior-period) or unstamped state
// reads as empty (the prior period is forgotten).
export function periodState(downtime, startedAt) {
  if (isCurrentPeriod(downtime, startedAt)) {
    const plan = downtime.plan || {};
    const hasPlan = Object.keys(plan).length > 0;
    return {
      plan,
      status: downtime.status || 'planning',
      paired: downtime.paired || {},
      // craftApplied tracks the crafting hours already banked into each project
      // this period, so re-locking an edited plan banks only the new delta.
      craftApplied: downtime.craftApplied || {},
      selected: hasPlan ? planSelected(plan) : (downtime.selected || []),
      ledger: hasPlan ? planToLedger(plan) : (downtime.ledger || []),
    };
  }
  return { plan: {}, status: 'planning', paired: {}, craftApplied: {}, selected: [], ledger: [] };
}

// Builds the next stored value for a write, stamping the active period and
// starting from a fresh base whenever the prior state is from another period.
// When the result carries a plan, selected/ledger are re-derived from it so the
// stored value stays internally consistent for every reader; legacy writes (no
// plan) keep their explicit selected/ledger.
export function stampPeriod(downtime, startedAt, patch) {
  const base = periodState(downtime, startedAt);
  const merged = { ...base, ...patch };
  const plan = merged.plan || {};
  const hasPlan = Object.keys(plan).length > 0;
  return {
    periodStartedAt: startedAt ?? null,
    plan,
    status: merged.status || 'planning',
    paired: merged.paired || {},
    craftApplied: merged.craftApplied || {},
    selected: hasPlan ? planSelected(plan) : (merged.selected || []),
    ledger: hasPlan ? planToLedger(plan) : (merged.ledger || []),
  };
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

// True once banked hours meet the GM-set benchmark (entered in days; 8h/day).
// A zero/unset benchmark is never "reached" — the GM hasn't assigned one yet.
export function benchmarkReached(hoursBanked, benchmarkDays) {
  const days = Number(benchmarkDays) || 0;
  if (days <= 0) return false;
  return (Number(hoursBanked) || 0) >= days * 8;
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
