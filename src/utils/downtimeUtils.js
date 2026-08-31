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
// Budget scoping (#1624): the block's day count can SHRINK under plans that were
// sized against a bigger one (the GM's Update button, a relay push, a seeded
// block). periodState/stampPeriod therefore take an optional `budget` — the
// block's current day count — and every reader that has the block in hand passes
// it. The plan comes back clamped to that budget, and a plan the clamp actually
// changed drops out of 'ready' (it is no longer the schedule its owner sealed),
// which keeps useDowntimePartyReady from auto-advancing a week nobody agreed to.
// Same lazy, declarative shape as the period reset above: the guard lives where
// plans are READ, so it holds no matter who wrote the block. The stored value is
// only rewritten when its owner next touches the plan — and stampPeriod clamps
// on the way out, so no write can persist an over-budget plan.
//
// Allocation model (Party Ledger): `plan` is the source of truth —
//   { [activityName]: days }, e.g. { Research: 3, 'Earn Income': 2 }.
// `status` is 'planning' | 'ready' (explicit lock-in); `paired` is a
// { [activityName]: true } map of Follow-the-Expert links. To keep every
// downstream reader working unchanged, `selected`/`ledger` are *derived* from
// `plan` whenever a plan is present (a plan of `d` days for activity X becomes
// `d` ledger entries of { day: X, night: null }). State written by the legacy
// picker/commit-bar (no `plan`) keeps its explicit `selected`/`ledger` instead.

import { totalDaysSince4700 } from './gameTime';

// Period identity is compared by value, not reference: block.startedAt is the
// gameDate object, which round-trips through JSON (WebSocket/localStorage) and
// is a fresh object on every read, so === would never match.
const periodKey = (v) => (v == null ? null : JSON.stringify(v));

// A { day, month, year } we can actually do calendar math on. The block's
// startedAt is whatever the clock was when the GM started the period, and it
// round-trips through JSON, so a partial/corrupt value has to read as "unknown"
// rather than throw inside a render.
const isDate = (d) =>
  !!d && typeof d.day === 'number' && typeof d.month === 'number' && typeof d.year === 'number';

// Which day of the block the party is currently living, 1-based and clamped to
// [1, days] (#1853). The dock header and the Period rail both read "Day 3 / 7"
// off this; it is derived at render time from the clock vs the block's stamp —
// never stored — so a GM clock nudge moves it immediately and the number can't
// drift out of sync with the calendar. Golarion month lengths / leap years come
// from gameTime's totalDaysSince4700, the same walk GameDateContext uses.
// An unknown stamp or a non-positive budget reads as day 1.
export function periodDayNumber(startedAt, current, days) {
  const budget = Math.floor(Number(days) || 0);
  if (budget <= 0) return 1;
  if (!isDate(startedAt) || !isDate(current)) return 1;
  const elapsed = totalDaysSince4700(current) - totalDaysSince4700(startedAt);
  if (!Number.isFinite(elapsed)) return 1;
  return Math.min(budget, Math.max(1, elapsed + 1));
}

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

// True when two plans allocate the same days to the same activities. Numeric
// comparison, so a stored "3" matches clampPlan's normalized 3 — only a real
// reduction counts as a change.
function samePlan(a, b) {
  const keys = Object.keys(a || {});
  if (keys.length !== Object.keys(b || {}).length) return false;
  return keys.every((name) => (Number(a[name]) || 0) === (Number((b || {})[name]) || 0));
}

// Period-scoped view of the stored state. For the active period this returns the
// full allocation view — { plan, status, paired, selected, ledger, clamped } —
// deriving selected/ledger from the plan when one is present, else falling back
// to the legacy explicit selected/ledger. A stale (prior-period) or unstamped
// state reads as empty (the prior period is forgotten).
//
// `budget` (optional) is the block's current day count; pass it wherever the
// block is in hand. It clamps the plan and reopens a plan the clamp changed —
// `clamped` reports that, for readers that want to say so out loud. Omitting it
// returns the stored plan verbatim.
export function periodState(downtime, startedAt, budget) {
  if (isCurrentPeriod(downtime, startedAt)) {
    const stored = downtime.plan || {};
    const plan = budget == null ? stored : clampPlan(stored, budget);
    const clamped = budget != null && !samePlan(stored, plan);
    const hasPlan = Object.keys(plan).length > 0;
    const status = downtime.status || 'planning';
    return {
      plan,
      // A trimmed plan is not the one its owner locked in, so it goes back to
      // 'planning' until they re-confirm the shorter week.
      status: clamped && status === 'ready' ? 'planning' : status,
      clamped,
      paired: downtime.paired || {},
      // craftApplied / trainApplied track the hours already banked into each
      // crafting project / training track this period, so re-locking an
      // edited plan banks only the new delta.
      craftApplied: downtime.craftApplied || {},
      trainApplied: downtime.trainApplied || {},
      selected: hasPlan ? planSelected(plan) : (downtime.selected || []),
      ledger: hasPlan ? planToLedger(plan) : (downtime.ledger || []),
    };
  }
  return {
    plan: {}, status: 'planning', clamped: false, paired: {},
    craftApplied: {}, trainApplied: {}, selected: [], ledger: [],
  };
}

// Builds the next stored value for a write, stamping the active period and
// starting from a fresh base whenever the prior state is from another period.
// When the result carries a plan, selected/ledger are re-derived from it so the
// stored value stays internally consistent for every reader; legacy writes (no
// plan) keep their explicit selected/ledger.
//
// `budget` (optional, as periodState) is applied on both sides: the base is read
// through it, and the merged plan is clamped on the way out, so a write can
// never persist a plan that no longer fits the block.
export function stampPeriod(downtime, startedAt, patch, budget) {
  const base = periodState(downtime, startedAt, budget);
  const merged = { ...base, ...patch };
  const plan = budget == null ? (merged.plan || {}) : clampPlan(merged.plan || {}, budget);
  const hasPlan = Object.keys(plan).length > 0;
  return {
    periodStartedAt: startedAt ?? null,
    plan,
    status: merged.status || 'planning',
    paired: merged.paired || {},
    craftApplied: merged.craftApplied || {},
    trainApplied: merged.trainApplied || {},
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
