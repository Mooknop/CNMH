/**
 * Take 10 — coordinated party 10-minute activities (#948, epic #536).
 *
 * `exploration-activities.spec.ts` owns the exploration ACTIVITY pick and its
 * knock-ons; this file owns the other coordinated beat on the same tab: the
 * party-wide "Take 10" block, from a player opening it through the GM closing it.
 *
 * Keys under test (grep-verified writers, not inferred from the feature name):
 *   cnmh_take10_global          — useTake10 `start`/`clear`:
 *                                 { active, openedAt, startedBy }. `openedAt` is
 *                                 the beat stamp that scopes every allocation.
 *   cnmh_take10alloc_<charId>   — useTake10 per-player allocation:
 *                                 { beatAt, ready, activities:[{id,label,minutes}] }
 *   cnmh_focus_<charId>         — take10Resolve: Refocus restores ALL Focus
 *                                 Points (stored as points SPENT, so restore = 0).
 *   cnmh_clock_global           — the GM advance: one central bump by the block
 *                                 length on resolution, and ONLY on resolution.
 *   cnmh_sessionlog_global      — per-player block summaries + the time entry.
 *
 * The block length is DERIVED (party-max of everyone's total allocation, floored
 * at 10 min) — every client computes it from the synced allocs, so the tests
 * assert it as rendered text on BOTH seats rather than looking for a wire write
 * that deliberately does not exist.
 *
 * GM-side coverage drives the real PlayModeControl on /gm (readout, Resolve now,
 * Cancel, the all-ready auto-resolve, the encounter interrupt). Those effects are
 * GM-only-mounted, which is exactly why they belong in this spec's scope: the
 * player tests above prove no player seat can fire them.
 *
 * Take 10 has NO bridge-protocol gate (useTake10/Take10Prompt never read
 * cnmh_bridgehello_global), so no bridgeHello is seeded anywhere here — keeping
 * protocol rails hidden and locators unambiguous.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { activeEncounter } from '../../helpers/encounter';
import { expectSheet, openPlayTab } from '../../helpers/sheet';

const ALLY = { id: 'e2e-t10-ally', name: 'E2E Ally' };
const BUDDY = { id: 'e2e-t10-buddy', name: 'E2E Buddy' };

// A pinned beat stamp for seeded-open blocks (any Date.now()-ish number works —
// only equality with each alloc's beatAt matters).
const BEAT = 1_726_000_000_000;

// Pin the clock so the resolution's one central advance is deterministic.
const CLOCK = { day: 5, month: 2, year: 4725, hour: 8, minute: 0, second: 0 };

// Allocation entries in the exact shape useTake10.addActivity stores (matching
// take10Activities.js ids — resolveTake10 keys Refocus off id === 'refocus').
const REFOCUS = { id: 'refocus', label: 'Refocus', minutes: 10 };
const OTHER = { id: 'other', label: 'Other activity', minutes: 10 };

const openBlock = { active: true, openedAt: BEAT, startedBy: ALLY.id };
const allocOf = (activities: Array<typeof OTHER>, ready = true) => ({
  beatAt: BEAT,
  ready,
  activities,
});

// The player-side fly-up (Take10Prompt's labelled region).
const prompt = (page: Page) => page.getByRole('region', { name: 'Take 10 in progress' });

// The GM console's Take 10 row inside PlayModeControl's exploration context.
const gmRow = (page: Page) => page.locator('.pmc-row--take10');

// Forward one synced key between two mocked pages' relays, the way the real
// CampaignSession DO fans a client UPDATE out to every OTHER peer (same local
// helper as exploration-activities.spec.ts — still only two call sites, so it
// stays in-file rather than growing a shared fixture).
function bridgeKey(from: MockSession, to: MockSession, cnmhKey: string) {
  from.onSent(cnmhKey, (value) => to.push(cnmhKey, value));
}

async function gotoExploration(page: Page, char: { id: string; name: string }) {
  await page.goto(`/character/${char.id}`);
  await expectSheet(page, char.name);
  await openPlayTab(page, 'Exploration');
}

test.describe('Take 10', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      character: [
        // Flagless and untrained on purpose: of the static catalog only the
        // ungated "Other activity" is eligible, so the picker is deterministic
        // (and Refocus's absence proves the hasFocusSpells gate).
        { id: ALLY.id, name: ALLY.name, level: 5 },
        { id: BUDDY.id, name: BUDDY.name, level: 5 },
      ],
    });
  });

  test('a player opens a beat and stacks a block: cnmh_take10_global + cnmh_take10alloc_<id>', async ({ page }) => {
    const session = await mockSession(page, { seed: { cnmh_playmode_global: 'exploration' } });
    await gotoExploration(page, ALLY);

    // Idle: the start toggle is offered, the fly-up is not.
    await expect(prompt(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Take 10', exact: true }).click();

    // Starting broadcasts the beat: active, a fresh openedAt stamp, and who.
    const opened = await session.expectSent('cnmh_take10_global', (v) => v?.active === true);
    expect(opened.startedBy).toBe(ALLY.id);
    expect(opened.openedAt).toBeGreaterThan(0);

    const p = prompt(page);
    await expect(p).toBeVisible();
    // Empty block: the 10-minute floor, nothing allocated.
    await expect(p.locator('.t10-minutes')).toHaveText('10 min block');
    await expect(p.locator('.t10-budget-label')).toHaveText('0 / 10 min allocated');
    // Eligibility gates hold: no focus spells → no Refocus; untrained → no
    // Treat Wounds; only the ungated activity is offered.
    await expect(p.locator('.t10-add')).toHaveCount(1);
    await expect(p.locator('.t10-add').filter({ hasText: 'Refocus' })).toHaveCount(0);

    // Allocating writes the beat-stamped per-player key.
    await p.locator('.t10-add').filter({ hasText: 'Other activity' }).click();
    const first = await session.expectSent(
      `cnmh_take10alloc_${ALLY.id}`,
      (v) => v?.activities?.length === 1,
    );
    expect(first.beatAt).toBe(opened.openedAt);
    expect(first.ready).toBe(false);
    expect(first.activities[0]).toMatchObject({ id: 'other', label: 'Other activity', minutes: 10 });
    await expect(p.locator('.t10-budget-label')).toHaveText('10 / 10 min allocated');

    // Stacking past the floor widens the DERIVED block length (party-max).
    await p.locator('.t10-add').filter({ hasText: 'Other activity' }).click();
    await expect(p.locator('.t10-minutes')).toHaveText('20 min block');
    await expect(p.locator('.t10-budget-label')).toHaveText('20 / 20 min allocated');

    // Removing narrows it back to the floor.
    await p.getByRole('button', { name: 'Remove Other activity' }).first().click();
    await expect(p.locator('.t10-minutes')).toHaveText('10 min block');
    await expect(p.locator('.t10-budget-label')).toHaveText('10 / 10 min allocated');

    // Ready rides the same alloc key, still scoped to the live beat.
    await p.getByRole('button', { name: 'Ready' }).click();
    const readied = await session.expectSent(`cnmh_take10alloc_${ALLY.id}`, (v) => v?.ready === true);
    expect(readied.beatAt).toBe(opened.openedAt);
    expect(readied.activities).toHaveLength(1);
    await expect(p.getByLabel('players ready')).toHaveText('1 / 2 ready');
    // One of two is not everyone: no "waiting for the GM" banner yet.
    await expect(p.locator('.t10-waiting')).toHaveCount(0);
  });

  test('the party coordinates across sessions: one start opens every seat, the block widens to the party max, ready counts converge', async ({ page, context }) => {
    // Two seats, each with its own mocked relay; `bridgeKey` is the DO fan-out
    // between them. The buddy's seat is loaded FIRST so its idle state (start
    // toggle, no fly-up) is asserted before any take10 write exists anywhere.
    const buddySession = await mockSession(page, { seed: { cnmh_playmode_global: 'exploration' } });
    await gotoExploration(page, BUDDY);
    await expect(page.getByRole('button', { name: 'Take 10', exact: true })).toBeVisible();
    await expect(prompt(page)).toHaveCount(0);

    const allyPage = await context.newPage();
    const allySession = await mockSession(allyPage, { seed: { cnmh_playmode_global: 'exploration' } });
    await gotoExploration(allyPage, ALLY);

    // Wire the relay only once both sockets are live (`push` throws otherwise).
    bridgeKey(allySession, buddySession, 'cnmh_take10_global');
    bridgeKey(allySession, buddySession, `cnmh_take10alloc_${ALLY.id}`);
    bridgeKey(buddySession, allySession, `cnmh_take10alloc_${BUDDY.id}`);

    // The ally starts the beat — and the BUDDY's seat flips into it too.
    await allyPage.getByRole('button', { name: 'Take 10', exact: true }).click();
    await expect(prompt(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take 10', exact: true })).toHaveCount(0);
    await expect(prompt(page).getByLabel('players ready')).toHaveText('0 / 2 ready');

    // The ally stacks 20 minutes; the buddy's budget meter widens to the
    // party-max WITHOUT the buddy allocating anything — the block length is
    // derived from everyone's synced allocs, not broadcast as its own key.
    await prompt(allyPage).locator('.t10-add').filter({ hasText: 'Other activity' }).click();
    await prompt(allyPage).locator('.t10-add').filter({ hasText: 'Other activity' }).click();
    await expect(prompt(allyPage).locator('.t10-minutes')).toHaveText('20 min block');
    await expect(prompt(page).locator('.t10-minutes')).toHaveText('20 min block');
    await expect(prompt(page).locator('.t10-budget-label')).toHaveText('0 / 20 min allocated');

    // Ready converges on both seats as each player flips.
    await prompt(allyPage).getByRole('button', { name: 'Ready' }).click();
    await expect(prompt(allyPage).getByLabel('players ready')).toHaveText('1 / 2 ready');
    await expect(prompt(page).getByLabel('players ready')).toHaveText('1 / 2 ready');

    await prompt(page).locator('.t10-add').filter({ hasText: 'Other activity' }).click();
    await expect(prompt(page).locator('.t10-budget-label')).toHaveText('10 / 20 min allocated');
    await prompt(page).getByRole('button', { name: 'Ready' }).click();

    // All-ready is derived on every client; with no GM seat mounted nothing
    // resolves — both seats hold at "waiting for the GM".
    await expect(prompt(page).getByLabel('players ready')).toHaveText('2 / 2 ready');
    await expect(prompt(allyPage).getByLabel('players ready')).toHaveText('2 / 2 ready');
    await expect(prompt(page).locator('.t10-waiting')).toBeVisible();
    await expect(prompt(allyPage).locator('.t10-waiting')).toBeVisible();

    await allyPage.close();
  });

  test('GM Resolve now: Refocus restores ALL Focus Points, the clock advances once by the block, the beat closes', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_clock_global: CLOCK,
        cnmh_take10_global: openBlock,
        // One of two ready — so the GM mounts into a LIVE beat (no auto-resolve)
        // and the override path is what fires the resolution.
        [`cnmh_take10alloc_${ALLY.id}`]: allocOf([REFOCUS]),
        // Focus is stored as points SPENT (0 = full): 2 spent going in.
        [`cnmh_focus_${ALLY.id}`]: 2,
      },
    });
    await page.goto('/gm');

    const row = gmRow(page);
    await expect(row).toContainText('Take 10 · 1 / 2 ready');
    const resolveNow = row.getByRole('button', { name: 'Resolve now' });
    await expect(resolveNow).toBeEnabled();
    await resolveNow.click();

    // The house rule the whole flow exists for: Refocus restores ALL Focus
    // Points (out-of-combat auto-refill was removed) — spent snaps to 0.
    expect(await session.expectSent(`cnmh_focus_${ALLY.id}`, (v) => v === 0)).toBe(0);

    // One central clock advance by the derived block length (10-min floor here).
    await session.expectSent(
      'cnmh_clock_global',
      (v) => v?.hour === 8 && v?.minute === 10 && v?.day === CLOCK.day,
    );

    // The beat closes and the console row retires.
    await session.expectSent('cnmh_take10_global', (v) => v?.active === false);
    await expect(row).toHaveCount(0);

    // The table record: a per-player block summary plus the time entry.
    await session.expectSent('cnmh_sessionlog_global', (v) =>
      (v || []).some((e: any) => e.text === `${ALLY.name} (10 min): Refocus`));
    await session.expectSent('cnmh_sessionlog_global', (v) =>
      (v || []).some((e: any) => e.text === 'Take 10 — advanced 10 min'));
  });

  test('the moment every PC is ready the GM seat auto-resolves — no button pressed', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_clock_global: CLOCK,
        cnmh_take10_global: openBlock,
        [`cnmh_take10alloc_${ALLY.id}`]: allocOf([REFOCUS]),
        [`cnmh_take10alloc_${BUDDY.id}`]: allocOf([OTHER]),
        [`cnmh_focus_${ALLY.id}`]: 3,
      },
    });
    await page.goto('/gm');

    // No interaction at all: mounting into an all-ready beat fires the same
    // resolution (PlayModeControl's all-ready effect — GM is the single writer).
    await session.expectSent(`cnmh_focus_${ALLY.id}`, (v) => v === 0, { timeout: 15_000 });
    await session.expectSent('cnmh_clock_global', (v) => v?.hour === 8 && v?.minute === 10);
    await session.expectSent('cnmh_take10_global', (v) => v?.active === false);
    // The buddy's non-mechanical activity resolves to a log record, not a write.
    await session.expectSent('cnmh_sessionlog_global', (v) =>
      (v || []).some((e: any) => e.text === `${BUDDY.name} (10 min): Other activity`));
    await expect(gmRow(page)).toHaveCount(0);
  });

  test('GM Cancel closes the beat with NO time advance and NO resolution', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_clock_global: CLOCK,
        cnmh_take10_global: openBlock,
        [`cnmh_take10alloc_${ALLY.id}`]: allocOf([REFOCUS]),
        [`cnmh_focus_${ALLY.id}`]: 2,
      },
    });
    await page.goto('/gm');

    const row = gmRow(page);
    await expect(row).toContainText('1 / 2 ready');
    await row.getByRole('button', { name: 'Cancel' }).click();

    await session.expectSent('cnmh_take10_global', (v) => v?.active === false);
    await session.expectSent('cnmh_sessionlog_global', (v) =>
      (v || []).some((e: any) => e.text === 'Take 10 cancelled'));
    await expect(row).toHaveCount(0);

    // Cancel is not a resolve: the clock never moved and no allocation resolved
    // (the ally's spent Focus stays spent).
    expect(session.sent.filter((m) => m.stateType === 'clock')).toHaveLength(0);
    expect(session.sent.filter((m) => m.stateType === 'focus')).toHaveLength(0);
  });

  test('an encounter starting mid-beat cancels the Take 10 (#563)', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_clock_global: CLOCK,
        cnmh_take10_global: openBlock,
        // Deliberately no ready allocs: an all-ready beat would race the
        // interrupt with the auto-resolve and muddy the no-clock assertion.
        cnmh_encounter_global: activeEncounter(ALLY.id, ALLY.name),
      },
    });
    await page.goto('/gm');

    // The interrupt effect closes the beat as soon as the GM seat sees both
    // states at once, so exploration can't resume into a stale block…
    await session.expectSent('cnmh_take10_global', (v) => v?.active === false, { timeout: 15_000 });
    await session.expectSent('cnmh_sessionlog_global', (v) =>
      (v || []).some((e: any) => e.text === 'Take 10 interrupted by encounter'));

    // …and an interrupted beat is a cancel, not a resolve: no time advance.
    expect(session.sent.filter((m) => m.stateType === 'clock')).toHaveLength(0);
    // During the encounter the exploration context strip (and its Take 10 row)
    // is not rendered at all — the initiative panel owns the screen.
    await expect(gmRow(page)).toHaveCount(0);
  });
});
