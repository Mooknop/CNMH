/**
 * Downtime spine — the GM half (#1619, part of epic #1589).
 *
 * The player half (allocate → lock in → submit) is in
 * `e2e/specs/player/downtime-spine.spec.ts`; this file covers the surfaces only
 * the GM has, all of them inside PlayModeControl → DowntimeControl:
 *
 *   - starting a period            → cnmh_downtimeblock_global
 *   - Retrain/Research benchmarks  → cnmh_downtimebench_global
 *   - the party-ready auto-advance → summary + clock + block close + mode flip
 *   - the review queue             → cnmh_downtimeresults_global (confirm/reject)
 *
 * Every control writes a synced key, so the relay is mocked (mockSession, #293)
 * and the write asserted via expectSent. Desktop-only (GM Tools has no
 * responsive layout), hence `specs/gm/**`.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';

const CHAR_ID = 'e2e-dt-planner';
const CHAR_NAME = 'E2E Planner';

// The GM stamps the block with the current gameDate, so pin the clock to keep
// startedAt deterministic. gameDate is the { day, month, year } slice of it.
const CLOCK = { day: 5, month: 2, year: 4725, hour: 8, minute: 0, second: 0 };

// Period identity is compared by value (downtimeUtils.periodKey → JSON), so a
// seeded block and a seeded per-PC period just have to agree with each other.
const STARTED_AT = 1;

// DowntimeControl's own panel — 'Start', 'Close block' and the per-PC inputs all
// live here, away from the dashboard's other controls of the same name.
const downtimePanel = (page: Page) => page.locator('.pmc-downtime');

const pendingResearch = (topic: string) => ({
  entries: [{
    id: 'e2e-dt-result-1',
    kind: 'research',
    charId: CHAR_ID,
    charName: CHAR_NAME,
    topic,
    status: 'pending',
    periodStartedAt: STARTED_AT,
    ts: 1,
  }],
});

test.describe('Downtime spine (GM)', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
  });

  test('starting a period grants the party a day budget', async ({ page }) => {
    const session = await mockSession(page, {
      seed: { cnmh_playmode_global: 'exploration', cnmh_clock_global: CLOCK },
    });
    await page.goto('/gm');

    // The downtime controls only exist in Downtime mode — the same global the
    // player's mode-aware play tab reads.
    await page.getByRole('group', { name: 'Play mode' }).getByRole('button', { name: 'Downtime' }).click();
    await session.expectSent('cnmh_playmode_global', (v) => v === 'downtime');

    const panel = downtimePanel(page);
    await panel.getByLabel('Downtime period in days').fill('3');
    await panel.getByRole('button', { name: 'Start', exact: true }).click();

    const written = await session.expectSent('cnmh_downtimeblock_global', (v) => v?.active === true);
    expect(written.days).toBe(3);
    // The block is stamped with the game date, which is what scopes every PC's
    // per-period state (stale state from a prior period reads as empty).
    expect(written.startedAt).toEqual({ day: CLOCK.day, month: CLOCK.month, year: CLOCK.year });

    await expect(panel).toContainText('3 days granted');
    // With a block open, nobody has locked in yet.
    await expect(panel).toContainText('0/1 ready');
  });

  test('a Retrain/Research benchmark is recorded per PC', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_clock_global: CLOCK,
        cnmh_downtimeblock_global: { active: true, days: 3, startedAt: STARTED_AT },
      },
    });
    await page.goto('/gm');

    // NB: despite the key name, cnmh_downtimebench_global is a BENCHMARK map —
    // { [charId]: { Retrain?: days, Research?: days } } — not a bench roster. It
    // has no bearing on the party-ready count; it gates the player's completion
    // prompt (see the player spec).
    await downtimePanel(page).getByLabel(`${CHAR_NAME} Research benchmark days`).fill('3');

    await session.expectSent(
      'cnmh_downtimebench_global',
      (v) => v?.[CHAR_ID]?.Research === 3,
    );
  });

  test('the last PC locking in closes the block, advances the clock and writes the summary', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_clock_global: CLOCK,
        cnmh_downtimeblock_global: { active: true, days: 3, startedAt: STARTED_AT },
        // The sole party member has already locked in, so the GM page mounts
        // straight into "all ready" and the auto-advance fires — no GM button
        // exists for this by design.
        [`cnmh_downtime_${CHAR_ID}`]: {
          periodStartedAt: STARTED_AT,
          plan: { Research: 2, 'Earn Income': 1 },
          status: 'ready',
        },
      },
    });
    await page.goto('/gm');

    const summary = await session.expectSent('cnmh_downtimesummary_global', (v) => !!v?.period);
    expect(summary.period).toEqual({ days: 3, startedAt: STARTED_AT });
    expect(summary.chars).toHaveLength(1);
    expect(summary.chars[0]).toMatchObject({ id: CHAR_ID, name: CHAR_NAME });
    expect(summary.chars[0].selected).toEqual(['Research', 'Earn Income']);
    expect(summary.chars[0].ledger).toHaveLength(3);

    // …then the clock jumps the full block, the block closes, and play returns
    // to Exploration.
    await session.expectSent('cnmh_clock_global', (v) => v?.day === CLOCK.day + 3);
    await session.expectSent('cnmh_downtimeblock_global', (v) => v?.active === false);
    await session.expectSent('cnmh_playmode_global', (v) => v === 'exploration');
  });

  test('confirming a submitted result resolves it in the review queue', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_clock_global: CLOCK,
        cnmh_downtimeblock_global: { active: true, days: 3, startedAt: STARTED_AT },
        cnmh_downtimeresults_global: pendingResearch('The Sihedron seals'),
        // Deliberately no per-PC downtime state: an all-ready party would
        // auto-advance and close the block, unmounting the review queue.
      },
    });
    await page.goto('/gm');

    const queue = page.getByRole('list', { name: 'Downtime results awaiting review' });
    await expect(queue).toContainText(CHAR_NAME);
    await expect(queue).toContainText('Research: The Sihedron seals — resolve via #206');
    await expect(downtimePanel(page)).toContainText('Downtime Results — Review (1)');

    await queue.getByRole('button', { name: `Confirm ${CHAR_NAME} research` }).click();

    // Confirm keeps the entry as a resolved record (so it can't be applied
    // twice) rather than dropping it.
    const after = await session.expectSent(
      'cnmh_downtimeresults_global',
      (v) => v?.entries?.[0]?.status === 'confirmed',
    );
    expect(after.entries).toHaveLength(1);
    await expect(queue).toBeHidden();
  });

  test('rejecting a submitted result drops it so the player can resubmit', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_clock_global: CLOCK,
        cnmh_downtimeblock_global: { active: true, days: 3, startedAt: STARTED_AT },
        cnmh_downtimeresults_global: pendingResearch('A dead end'),
      },
    });
    await page.goto('/gm');

    const queue = page.getByRole('list', { name: 'Downtime results awaiting review' });
    await expect(queue).toContainText(CHAR_NAME);

    await queue.getByRole('button', { name: `Reject ${CHAR_NAME} research` }).click();

    // Removed entirely — hasAccumulateResult stops matching, which is what
    // re-opens the player's completion prompt for another attempt.
    await session.expectSent('cnmh_downtimeresults_global', (v) => (v?.entries || []).length === 0);
    await expect(queue).toBeHidden();
  });
});
