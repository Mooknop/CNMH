/**
 * Downtime spine — the player half (#1619, part of epic #1589).
 *
 * `downtime.spec.ts` is read-only: it asserts a GM-granted budget renders. This
 * file drives the loop that makes Downtime a play mode rather than a label —
 * allocate days, lock the plan in, submit a completed activity for review, and
 * see the period's summary — and asserts every synced write it produces:
 *
 *   cnmh_downtime_<charId>        DowntimeAllocator (plan / status / paired)
 *   cnmh_downtimeresults_global   DowntimeCompletion (the GM review queue)
 *   cnmh_downtimesummary_global   DowntimeSummaryModal (dismiss clears it)
 *
 * The GM half — starting the block, setting the Retrain/Research benchmarks,
 * the party-ready auto-advance, and approving the review queue — is desktop-only
 * and lives in `e2e/specs/gm/downtime-spine.spec.ts`.
 *
 * Everything here rides synced globals, so the relay is mocked (mockSession,
 * #293) and each write asserted with expectSent.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectOnSheet } from '../../helpers/sheet';

const CHAR_ID = 'e2e-dt-planner';
const CHAR_NAME = 'E2E Planner';
const DOWNTIME_KEY = `cnmh_downtime_${CHAR_ID}`;

// Period identity is compared by VALUE, not reference (downtimeUtils.periodKey
// JSON-stringifies both sides) because the app's real startedAt is the gameDate
// object, which is a fresh object on every read. Any stable value works in a
// seed; `1` is what downtime.spec.ts already uses.
const STARTED_AT = 1;

const block = (days: number) => ({ active: true, days, startedAt: STARTED_AT });

// The stored shape DowntimeAllocator writes. `plan` is the source of truth —
// periodState derives selected/ledger from it — so a stamped plan is all a seed
// needs to stand in for a player who already allocated.
const period = (plan: Record<string, number>, status: 'planning' | 'ready' = 'planning') => ({
  periodStartedAt: STARTED_AT,
  plan,
  status,
});

const expectSheet = (page: Page) =>
  expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });

// The mode-aware play tab. It only carries the Downtime label once
// cnmh_playmode_global is 'downtime' and no encounter is active, so reaching it
// doubles as the hydration gate for every assertion below.
const openDowntimeTab = (page: Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Downtime', exact: true })
    .click();

// `<b>{used}</b> / {blockDays} planned · {free} free` — the allocator's running
// budget, and the cheapest proof that a write round-tripped into the UI.
const budgetLine = (page: Page) => page.locator('.dta-budget');

test.describe('Downtime spine (player)', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      character: [{
        id: CHAR_ID,
        name: CHAR_NAME,
        level: 5,
        // Deliberately NOT trained in Crafting: Crafting is the only activity
        // with a proficiency gate, and leaving it off keeps the crafting
        // projects surface (#1620's spec) out of this one.
        skills: { society: { proficiency: 1 } },
      }],
    });
  });

  test('the granted budget renders and allocating days writes the plan', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(5),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectOnSheet(page, CHAR_ID);
    await expectSheet(page);
    await openDowntimeTab(page);

    await expect(page.getByText('5 days available')).toBeVisible();

    // Nothing planned yet: the whole budget is free and lock-in is refused.
    await expect(budgetLine(page)).toHaveText('0 / 5 planned · 5 free');
    await expect(page.getByRole('button', { name: /Lock in/ })).toBeDisabled();
    await expect(page.getByText('Allocate at least one day to lock in.')).toBeVisible();

    // Three taps of the stepper = three days of Research.
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'More Research' }).click();
    }

    const dt = await session.expectSent(DOWNTIME_KEY, (v) => v?.plan?.Research === 3);
    expect(dt.status).toBe('planning');
    expect(dt.periodStartedAt).toBe(STARTED_AT);
    // selected/ledger are re-derived from the plan on every write (stampPeriod),
    // so the party ledger, the completion prompts and the GM summary all read
    // the same three days without the allocator writing them by hand.
    expect(dt.selected).toEqual(['Research']);
    expect(dt.ledger).toEqual([
      { day: 'Research', night: null },
      { day: 'Research', night: null },
      { day: 'Research', night: null },
    ]);

    // The remaining budget drops in lockstep.
    await expect(budgetLine(page)).toHaveText('3 / 5 planned · 2 free');
    await expect(page.getByText('2 days still unspent — leave them free or fill them in.')).toBeVisible();
  });

  test('the plan is structurally capped at the granted budget', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(2),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectOnSheet(page, CHAR_ID);
    await expectSheet(page);
    await openDowntimeTab(page);

    await page.getByRole('button', { name: 'More Research' }).click();
    await page.getByRole('button', { name: 'More Research' }).click();
    await session.expectSent(DOWNTIME_KEY, (v) => v?.plan?.Research === 2);
    await expect(budgetLine(page)).toHaveText('2 / 2 planned · 0 free');

    // Over-allocation is refused structurally, not clamped after the fact: every
    // activity's slider max is (its own days + free), so with 0 free the steppers
    // are disabled and each range input caps at what is already planned. There is
    // no UI path that can push the total past the block budget or take it negative.
    await expect(page.getByRole('button', { name: 'More Research' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'More Retrain' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'More Earn Income' })).toBeDisabled();
    await expect(page.getByRole('slider', { name: 'Research days' })).toHaveAttribute('max', '2');
    await expect(page.getByRole('slider', { name: 'Retrain days' })).toHaveAttribute('max', '0');
    // …and the floor: an untouched activity can't be stepped below zero.
    await expect(page.getByRole('button', { name: 'Less Retrain' })).toBeDisabled();

    // Absence assertion, anchored on the two writes above: exactly two downtime
    // writes happened, so nothing snuck a third allocation past the cap. The
    // filter drops the sheet's unprompted idle writes (combatsecs ticker, door probe).
    expect(session.sent.filter((m) => m.stateType === 'downtime')).toHaveLength(2);
  });

  // PRODUCT BUG — the one over-allocation route the allocator does NOT close.
  //
  // DowntimeControl's period button reads 'Update' while a block is open and
  // re-writes cnmh_downtimeblock_global with the new day count. Nothing re-clamps
  // the plans that were sized against the old budget: `used` is recomputed from
  // the stored plan, `free` floors at 0, and every PC's plan keeps its original
  // day count. Verified live — the allocator renders "5 / 2 planned · 0 free",
  // and the plan is still status 'ready', so useDowntimePartyReady still counts
  // that PC and the auto-advance moves the clock by the NEW (smaller) block while
  // the PC banked hours for the OLD one. Crafting/Training hours are already
  // irreversibly applied at lock-in (craftApplied/trainApplied), so this is not
  // cosmetic — it hands out free banked hours.
  //
  // The fix already exists and is wired to nothing: downtimeUtils.clampPlan is
  // exported and unit-tested but has ZERO production callers (grep clampPlan over
  // src/). Shrinking the block should clamp each PC's plan and reopen it
  // (status → 'planning') so they re-confirm the shorter week.
  //
  // Second branch of the same control, worth fixing together: startPeriod always
  // re-stamps startedAt with the current gameDate, so if the GM advanced the
  // clock before pressing Update the period key changes instead and the whole
  // party's locked plans silently read as empty (periodState's stale-period path).
  // An Update either over-budgets everyone or wipes everyone, depending on the clock.
  //
  // Unskip once the clamp lands; the assertions below are the desired behaviour.
  test.skip('shrinking an open block re-clamps an already-locked plan', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(5),
        [DOWNTIME_KEY]: period({ Research: 5 }, 'ready'),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectOnSheet(page, CHAR_ID);
    await expectSheet(page);
    await openDowntimeTab(page);
    await expect(budgetLine(page)).toHaveText('5 / 5 planned · 0 free');

    // The GM presses Update with a smaller number, same period (clock unmoved).
    session.push('cnmh_downtimeblock_global', { active: true, days: 2, startedAt: STARTED_AT });
    await expect(page.getByText('2 days available')).toBeVisible();

    // ACTUAL today: "5 / 2 planned · 0 free".
    await expect(budgetLine(page)).toHaveText('2 / 2 planned · 0 free');
    // …and the shortened week has to be re-confirmed rather than staying sealed.
    await expect(page.getByRole('button', { name: /Lock in/ })).toBeVisible();
  });

  test('lock-in seals the plan and editing it reopens the period', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(3),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectOnSheet(page, CHAR_ID);
    await expectSheet(page);
    await openDowntimeTab(page);

    await page.getByRole('button', { name: 'More Research' }).click();
    await page.getByRole('button', { name: 'More Research' }).click();
    await session.expectSent(DOWNTIME_KEY, (v) => v?.plan?.Research === 2);

    await page.getByRole('button', { name: /Lock in/ }).click();
    // status 'ready' is what useDowntimePartyReady counts on the GM side — the
    // single fact that lets the block close and time advance.
    await session.expectSent(DOWNTIME_KEY, (v) => v?.status === 'ready' && v?.plan?.Research === 2);
    await expect(page.getByRole('button', { name: 'Plan locked — tap to edit' })).toBeVisible();
    await expect(page.getByText('Your schedule is sealed. The party can see it on the ledger.')).toBeVisible();

    // Changing your mind always reopens the plan, so the GM's ready count drops
    // back rather than advancing time on a schedule the player has since edited.
    await page.getByRole('button', { name: 'More Research' }).click();
    await session.expectSent(DOWNTIME_KEY, (v) => v?.status === 'planning' && v?.plan?.Research === 3);
    await expect(page.getByRole('button', { name: /Lock in/ })).toBeEnabled();
  });

  test('a met GM benchmark surfaces the completion prompt and submitting queues a pending result', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: block(3),
        // cnmh_downtimebench_global is the GM's per-PC Retrain/Research
        // BENCHMARK map (in days, 8h each) — not a bench roster. DowntimeControl
        // is its only writer; see the GM spec.
        cnmh_downtimebench_global: { [CHAR_ID]: { Research: 3 } },
        [DOWNTIME_KEY]: period({ Research: 2 }, 'ready'),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectOnSheet(page, CHAR_ID);
    await expectSheet(page);
    await openDowntimeTab(page);

    // 2 days = 16h banked against a 3-day (24h) benchmark: not there yet. The
    // seeded lock is the anchor proving the surface hydrated before we assert
    // the prompt is absent.
    await expect(page.getByRole('button', { name: 'Plan locked — tap to edit' })).toBeVisible();
    await expect(page.getByText('Research — benchmark reached')).toBeHidden();

    // Spend the third day, then re-lock: editing reopened the plan, and the
    // completion prompt only rides a locked one.
    await page.getByRole('button', { name: 'More Research' }).click();
    await page.getByRole('button', { name: /Lock in/ }).click();
    await session.expectSent(DOWNTIME_KEY, (v) => v?.status === 'ready' && v?.plan?.Research === 3);

    await expect(page.getByText('Research — benchmark reached')).toBeVisible();
    await page.getByLabel('Research topic').fill('The Sihedron seals');
    await page.getByRole('button', { name: 'Submit for GM' }).click();

    const results = await session.expectSent(
      'cnmh_downtimeresults_global',
      (v) => (v?.entries || []).length === 1,
    );
    expect(results.entries[0]).toMatchObject({
      kind: 'research',
      charId: CHAR_ID,
      charName: CHAR_NAME,
      topic: 'The Sihedron seals',
      status: 'pending',
      periodStartedAt: STARTED_AT,
    });

    // Submitted → the prompt retires itself, so the player can't double-submit
    // while the entry sits in the GM's review queue. (This absence IS the
    // player-visible state of "awaiting the GM": Retrain/Research grant no
    // resources, so approval only logs — there is no player-side receipt.)
    await expect(page.getByText('Research — benchmark reached')).toBeHidden();
  });

  test('the summary modal reflects the committed period and dismissing clears it', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        // What DowntimeControl writes when the last PC locks in and the block
        // auto-closes: the period plus each PC's derived ledger.
        cnmh_downtimesummary_global: {
          period: { days: 3, startedAt: STARTED_AT },
          chars: [{
            id: CHAR_ID,
            name: CHAR_NAME,
            selected: ['Research', 'Earn Income'],
            ledger: [
              { day: 'Research', night: null },
              { day: 'Research', night: null },
              { day: 'Earn Income', night: null },
            ],
          }],
        },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectOnSheet(page, CHAR_ID);

    // A global overlay on the sheet — it needs no tab, and it reaches every
    // player at once because it rides a synced global.
    const modal = page.getByRole('dialog', { name: 'Downtime Complete' });
    await expect(modal).toBeVisible({ timeout: 15_000 });
    await expect(modal).toContainText('3 days elapsed');
    await expect(modal).toContainText(CHAR_NAME);
    // accumulate activities report banked hours, instant ones report rolls.
    await expect(modal).toContainText('16h / 8h');
    await expect(modal).toContainText('1 roll');

    await modal.getByRole('button', { name: 'Got it' }).click();

    // Dismissing clears the key for everyone, not just this client.
    await session.expectSent('cnmh_downtimesummary_global', (v) => v === null);
    await expect(modal).toBeHidden();
  });
});
