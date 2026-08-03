/**
 * GM Event Tracker (epic #1112) — the chapter-event browser, tracker controls,
 * and dashboard panel had no E2E before this file (#1126). Four surfaces:
 *
 *   1. World → Events (GmEvents): imported events render grouped by chapter in
 *      book order; selecting one shows its detail.
 *   2. EventTracker: status / steps / schedule / outcome / hide-unhide. Every
 *      control edits one draft persisted by "Save tracking" as a single content
 *      PUT on the event doc (saveDocument — no sync keys), so each write is
 *      asserted via /api/content (waitForContent).
 *   3. Dashboard EventsPanel: due-highlight vs the campaign clock. The clock is
 *      the synced global `cnmh_clock_global` ({ day, month(0-11), year, hour,
 *      minute, second } — see GameDateContext), so the relay is mocked and the
 *      date advanced with session.push. A truncated upcoming event surfaces
 *      when its scheduled date arrives (due events jump the UPCOMING_LIMIT).
 *   4. Batch show/hide in the rail (#1116): queued toggles land as one content
 *      PUT per changed event on Save.
 *
 * `event` is a capture-only collection the seed route refuses — docs go in via
 * the import route (helpers/content importDocs), the room pattern from #1125.
 * Desktop-only (GM Tools has no responsive layout).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { importDocs, waitForContent } from '../../helpers/content';

// Golarion month index for Rova (month 8, 0-based) — clock months are 0-11.
const ROVA = 8;
const clockOn = (day: number) => ({ day, month: ROVA, year: 4725, hour: 8, minute: 0, second: 0 });

test.describe('GM Event Tracker', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('World → Events: imported events render grouped by chapter in book order; selecting shows detail', async ({ page, request }) => {
    // Imported deliberately scrambled — the browser must impose book order
    // (chapter by earliest sort, events by sort within a chapter).
    await importDocs(request, 'event', [
      { id: 'e2e-ev-eclipse', name: 'E2E Sudden Eclipse', chapter: 'E2E Chapter Two', sort: 10 },
      { id: 'e2e-ev-banquet', name: 'E2E Mayoral Banquet', chapter: 'E2E Chapter One', sort: 2 },
      {
        id: 'e2e-ev-parade',
        name: 'E2E Founding Parade',
        chapter: 'E2E Chapter One',
        sort: 1,
        readAloud: '<p>Drums echo down the E2E high street.</p>',
      },
    ]);

    await page.goto('/gm/world/events');

    const rail = page.getByRole('complementary', { name: 'Events by chapter' });
    await expect(rail.locator('.gm-rooms-site-name')).toHaveText([
      'E2E Chapter One',
      'E2E Chapter Two',
    ]);
    await expect(rail.locator('.gm-rooms-name')).toHaveText([
      'E2E Founding Parade',
      'E2E Mayoral Banquet',
      'E2E Sudden Eclipse',
    ]);

    // First event in book order auto-selects; its detail (read-aloud) renders.
    await expect(page.getByRole('heading', { name: 'E2E Founding Parade' })).toBeVisible();
    await expect(page.getByText('Drums echo down the E2E high street.')).toBeVisible();

    // Selecting another event swaps the detail pane, chapter caption and all.
    await rail.getByRole('button', { name: 'E2E Sudden Eclipse' }).click();
    await expect(page.getByRole('heading', { name: 'E2E Sudden Eclipse' })).toBeVisible();
    await expect(page.locator('.gm-rooms-detail-site')).toHaveText('E2E Chapter Two');
    // Fresh import defaults to Upcoming (status pill in the detail bar).
    await expect(page.locator('.gm-rooms-detail-bar .gm-event-status')).toHaveText('Upcoming');
  });

  test('EventTracker: status, steps, schedule, outcome, hide/unhide each land as a content PUT', async ({ page, request }) => {
    const ID = 'e2e-ev-siege';
    await importDocs(request, 'event', [
      {
        id: ID,
        name: 'E2E Siege of the Gate',
        chapter: 'E2E Chapter One',
        sort: 1,
        steps: [
          { label: 'Man the walls', done: false },
          { label: 'Rally the militia', done: false },
        ],
      },
    ]);

    await page.goto('/gm/world/events');
    // Select explicitly (not just the book-order auto-selection): an explicit
    // selection survives the event dropping out of the default rail when the
    // hide step below lands, so the tracker stays mounted for the unhide.
    await page
      .getByRole('complementary', { name: 'Events by chapter' })
      .getByRole('button', { name: 'E2E Siege of the Gate' })
      .click();
    const tracker = page.getByRole('region', { name: 'Event tracking' });
    const save = tracker.getByRole('button', { name: 'Save tracking' });

    // Status: upcoming → active.
    const statusPicker = tracker.getByRole('group', { name: 'Event status' });
    await statusPicker.getByRole('button', { name: 'Active' }).click();
    await expect(statusPicker.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
    await save.click();
    await waitForContent(request, 'event', ID, (e) => e?.status === 'active');

    // Steps: tick one done, add a third beat.
    await tracker.getByRole('checkbox', { name: 'Step 1 done' }).check();
    await tracker.getByRole('button', { name: '+ Add step' }).click();
    await tracker.getByRole('textbox', { name: 'Step 3 label' }).fill('Report to the mayor');
    await save.click();
    await waitForContent(
      request,
      'event',
      ID,
      (e) =>
        Array.isArray(e?.steps) &&
        e.steps.length === 3 &&
        (e.steps[0] as { done?: boolean }).done === true &&
        (e.steps[2] as { label?: string }).label === 'Report to the mayor',
    );

    // Schedule to a game date (free text the due-engine parses).
    await tracker.getByLabel('Scheduled for').fill('Rova 12');
    await save.click();
    await waitForContent(request, 'event', ID, (e) => e?.scheduledFor === 'Rova 12');

    // Outcome.
    await tracker.getByLabel('Outcome').fill('The gate held; the party talked the captain down.');
    await save.click();
    await waitForContent(
      request,
      'event',
      ID,
      (e) => e?.outcome === 'The gate held; the party talked the captain down.',
    );

    // Hide, then unhide, via the tracker's own toggle.
    await tracker.getByRole('checkbox', { name: /Show in the tracker/ }).uncheck();
    await save.click();
    await waitForContent(request, 'event', ID, (e) => e?.tracked === false);

    await tracker.getByRole('checkbox', { name: /Show in the tracker/ }).check();
    await save.click();
    await waitForContent(request, 'event', ID, (e) => e?.tracked === true);
  });

  test('Dashboard EventsPanel: due-highlight tracks the game date; a scheduled event surfaces when its date arrives', async ({ page, request }) => {
    // One active event scheduled for Rova 12 with 1/2 steps done; five plain
    // upcoming events filling the UPCOMING_LIMIT=5 preview; a sixth upcoming
    // event sorted last and scheduled for Rova 12 (truncated until due); and a
    // hidden active event that must never appear.
    await importDocs(request, 'event', [
      {
        id: 'e2e-ev-siege',
        name: 'E2E Siege of the Gate',
        chapter: 'E2E Chapter Three',
        sort: 1,
        status: 'active',
        scheduledFor: 'Rova 12',
        steps: [
          { label: 'Man the walls', done: true },
          { label: 'Rally the militia', done: false },
        ],
      },
      ...['One', 'Two', 'Three', 'Four', 'Five'].map((n, i) => ({
        id: `e2e-ev-rumor-${n.toLowerCase()}`,
        name: `E2E Rumor ${n}`,
        chapter: 'E2E Chapter Three',
        sort: 2 + i,
      })),
      {
        id: 'e2e-ev-festival',
        name: 'E2E Harvest Festival',
        chapter: 'E2E Chapter Three',
        sort: 99,
        scheduledFor: 'Rova 12',
      },
      {
        id: 'e2e-ev-ghost',
        name: 'E2E Hidden Ghost',
        chapter: 'E2E Chapter Three',
        sort: 100,
        status: 'active',
        tracked: false,
      },
    ]);

    // Campaign clock at 5 Rova 4725 — a week before anything is due.
    const session = await mockSession(page, { seed: { cnmh_clock_global: clockOn(5) } });
    await page.goto('/gm');

    const panel = page.getByRole('region', { name: 'Events', exact: true });
    const siegeRow = panel.getByRole('listitem').filter({ hasText: 'E2E Siege of the Gate' });
    await expect(siegeRow).toBeVisible();
    await expect(siegeRow).toContainText('1/2'); // active-event step progress
    await expect(siegeRow).not.toContainText('Due');

    // Upcoming preview holds the five in book order; the festival (sorted last)
    // is truncated away by the limit; hidden events never appear.
    await expect(panel.getByRole('link', { name: 'E2E Rumor Five' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'E2E Harvest Festival' })).not.toBeVisible();
    await expect(panel.getByRole('link', { name: 'E2E Hidden Ghost' })).not.toBeVisible();

    // Advance the shared clock past the schedule (a peer's write replayed by
    // the relay) — both scheduled events light up, and the due upcoming event
    // jumps the truncation to surface in the preview.
    session.push('cnmh_clock_global', clockOn(12));
    await expect(siegeRow).toContainText('Due');
    const festivalRow = panel.getByRole('listitem').filter({ hasText: 'E2E Harvest Festival' });
    await expect(festivalRow).toBeVisible();
    await expect(festivalRow).toContainText('Due');

    // One-click resolve on the active row is a content PUT; the resolved event
    // leaves the panel (only active/upcoming render).
    await siegeRow.getByRole('button', { name: 'Resolve' }).click();
    await waitForContent(request, 'event', 'e2e-ev-siege', (e) => e?.status === 'resolved');
    await expect(panel.getByRole('link', { name: 'E2E Siege of the Gate' })).not.toBeVisible();
  });

  test('batch show/hide in the rail queues toggles and saves one content PUT per event (#1116)', async ({ page, request }) => {
    await importDocs(request, 'event', [
      { id: 'e2e-ev-watch', name: 'E2E Watch Rotation', chapter: 'E2E Chapter One', sort: 1 },
      { id: 'e2e-ev-levy', name: 'E2E Grain Levy', chapter: 'E2E Chapter One', sort: 2 },
      { id: 'e2e-ev-ledger', name: 'E2E Dull Ledger', chapter: 'E2E Chapter One', sort: 3, tracked: false },
    ]);

    await page.goto('/gm/world/events');
    const rail = page.getByRole('complementary', { name: 'Events by chapter' });

    // The pre-hidden import surfaces only the "Show hidden" toggle.
    await expect(rail.getByRole('checkbox', { name: 'Show hidden (1)' })).toBeVisible();
    await expect(rail.getByRole('button', { name: 'E2E Dull Ledger' })).not.toBeVisible();

    // Queue two hides — nothing is written until Save.
    await rail.getByRole('checkbox', { name: 'Show E2E Watch Rotation in tracker' }).uncheck();
    await rail.getByRole('checkbox', { name: 'Show E2E Grain Levy in tracker' }).uncheck();
    const bulkBar = rail.getByRole('group', { name: 'Save tracker changes' });
    await expect(bulkBar).toContainText('2 pending changes');

    await bulkBar.getByRole('button', { name: 'Save' }).click();
    await waitForContent(request, 'event', 'e2e-ev-watch', (e) => e?.tracked === false);
    await waitForContent(request, 'event', 'e2e-ev-levy', (e) => e?.tracked === false);

    // Saved hides drop out of the default view…
    await expect(rail.getByRole('button', { name: 'E2E Watch Rotation' })).not.toBeVisible();

    // …and come back under "Show hidden", where a batch unhide saves the same way.
    await rail.getByRole('checkbox', { name: 'Show hidden (3)' }).check();
    await expect(rail.getByRole('button', { name: 'E2E Watch Rotation' })).toBeVisible();
    await rail.getByRole('checkbox', { name: 'Show E2E Watch Rotation in tracker' }).check();
    await expect(bulkBar).toContainText('1 pending change');
    await bulkBar.getByRole('button', { name: 'Save' }).click();
    await waitForContent(request, 'event', 'e2e-ev-watch', (e) => e?.tracked === true);
  });
});
