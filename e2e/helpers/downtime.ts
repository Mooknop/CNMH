/**
 * Downtime seeding — the three keys that make a usable Downtime tab (#1631,
 * part of epic #1589).
 *
 * Four specs (#1619 player + GM spine, #1620 crafting, #1621 earn income /
 * training) each derived the same recipe independently. It is three keys, seeded
 * through `mockSession` (#293):
 *
 *   cnmh_playmode_global      'downtime'   — what makes the play tab say "Downtime"
 *   cnmh_downtimeblock_global block(days)  — the GM's granted budget
 *   cnmh_downtime_<charId>    lockedPlan() — the PC's own plan for this period
 *
 * The mode key is left inline at every call site on purpose: it is one literal,
 * it is the thing a reader most needs to see, and half of these specs also seed
 * `cnmh_clock_global` / `cnmh_support_global` right beside it.
 *
 * The block and the per-character record are the parts with real shape and real
 * traps, and those are what live here.
 */

import { type Page } from '@playwright/test';

/**
 * The period stamp shared by `block()` and the plan builders.
 *
 * A real block carries the gameDate object as `startedAt`, but period identity
 * is compared by VALUE — `downtimeUtils.periodKey` JSON-stringifies both sides,
 * because the gameDate round-trips through JSON and is a fresh object on every
 * read. So any stable value works in a seed, and a plain `1` is the cheapest
 * one that reads honestly in an assertion (`expect(written.startedAt).toBe(PERIOD)`).
 *
 * The only rule is that the block and every per-character record AGREE: a
 * `cnmh_downtime_<id>` whose `periodStartedAt` doesn't match the open block's
 * `startedAt` reads as empty (`isCurrentPeriod` → false), so an unstamped seed
 * silently produces a tab with no plan on it rather than a visible failure.
 */
export const PERIOD = 1;

/**
 * `cnmh_downtimeblock_global` — the GM's open downtime period.
 *
 * Everything that turns days into hours is gated on `block.active`: no block
 * means no allocator, hence no `More <Activity>` steppers and no Lock in button.
 * (Crafting/Training PROJECTS still render without one — they are
 * period-independent state; only banking days needs a block.)
 *
 * `days` is the budget the allocator caps every plan against, and since #1624 it
 * is applied on READ: shrinking an open block re-clamps plans that were sized
 * against the larger one and drops them back to 'planning'.
 */
export const block = (days: number) => ({ active: true, days, startedAt: PERIOD });

/**
 * `cnmh_downtime_<charId>` at `status: 'ready'` — a plan its owner has sealed.
 *
 * `plan` is the whole seed: `periodState` derives `selected`/`ledger` from it
 * ({ Research: 3 } → three { day: 'Research', night: null } entries), so nothing
 * needs to be spelled out twice.
 *
 * `status: 'ready'` is a GATE, not a decoration. `DowntimeTab` renders
 * `EarnIncomeResolver` and the Retrain/Research `DowntimeCompletion` prompts
 * only when `planLocked` (status === 'ready') AND a block is open — seed
 * 'planning' and they are simply absent, which reads as "the feature is broken"
 * rather than "the seed was wrong". Crafting and Training panels are NOT gated
 * on it; they hang off `hasCrafting` / nothing at all.
 *
 * Two corollaries worth their own line:
 *   - ANY edit re-opens the plan. Tapping a stepper writes status 'planning'
 *     back and the completion prompt vanishes — a spec that edits a seeded
 *     locked plan has to press Lock in again before asserting on the prompt.
 *   - `EarnIncomeResolver` additionally needs Earn Income DAYS: it counts the
 *     ledger's 'Earn Income' entries and returns null at zero. `lockedPlan({
 *     'Earn Income': 2 })`, not `lockedPlan({ Research: 2 })`.
 *
 * GM-side trap for the same key: seeding an all-ready party against an OPEN
 * block fires `useDowntimePartyReady`'s auto-advance the moment /gm mounts —
 * the clock jumps, the block closes and the review queue unmounts underneath
 * the assertions. GM specs that want a surface to stay put seed no per-PC plan
 * at all.
 */
export const lockedPlan = (plan: Record<string, number>) => ({
  periodStartedAt: PERIOD,
  plan,
  status: 'ready',
});

// The mode-aware play-tab opener lives in helpers/sheet.ts now
// (`openPlayTab(page, 'Downtime')`) — including the reasoning for why clicking
// it doubles as the hydration gate (#1366).

/**
 * The allocator's running budget line — `<b>{used}</b> / {blockDays} planned ·
 * {free} free`.
 *
 * The cheapest proof that a plan write round-tripped into the UI: it derives
 * from the plan directly, so it moves on every stepper tap without waiting for a
 * lock-in or a committed ledger.
 *
 * Deliberately no `allocate()` / `lockIn()` helpers around it — the allocator's
 * own vocabulary is already plain and every spec drives it differently. What is
 * worth knowing before writing those calls:
 *
 *   - Days move via the `More <Activity>` / `Less <Activity>` steppers. Each row
 *     also has a range input (`getByRole('slider', { name: '<Activity> days' })`)
 *     but setting a slider is pixel geometry; the steppers are deterministic.
 *   - Lock in's accessible name is `✦ Lock in <FirstName>'s plan`, so specs match
 *     `getByRole('button', { name: /Lock in/ })` rather than spelling it out.
 *   - Hours reach craft projects and training tracks ONLY on lock-in. Planning a
 *     Crafting/Training day moves this line immediately and the project's `Nh /
 *     Mh` readout not at all until the plan is sealed.
 *   - Crafting is the one activity with a proficiency gate: it appears in the
 *     allocator (and the Crafting rail at all) only for a character seeded with
 *     `skills: { crafting: { proficiency: N } }`, N ≥ 1.
 */
export const budgetLine = (page: Page) => page.locator('.dta-budget');
