/**
 * GM flat-collection round-trip suite.
 *
 * Covers the four simple collection editors — Quests, Factions (Reputation),
 * Calendar events, and Lore — verifying that every create / edit / delete
 * action persists correctly in the DO, broadcasts to the client, and is
 * reflected in both the rendered UI and the /api/content snapshot.
 *
 * Also exercises:
 *  - typed-confirm delete (ConfirmDialog requireType path)
 *  - slug-collision overwrite confirm (ConfirmDialog plain path)
 *  - category / type tab filter (Lore + Calendar nav strips)
 *
 * Each test resets both DOs so data never bleeds between tests.
 * Tests that pre-need existing content use the `seed` fixture.
 *
 * Desktop-only: GM Tools has no responsive layout.
 */

import { test, expect } from '../../fixtures/gm';
import { fetchContent, findInCollection } from '../../helpers/content';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the green flash that confirms a GM save broadcast. */
async function expectSaved(page: import('@playwright/test').Page) {
  await expect(page.getByRole('status')).toContainText('Changes are live', { timeout: 10_000 });
}

/** Fill the ConfirmDialog typed-confirm input and click the confirm button. */
async function confirmTyped(page: import('@playwright/test').Page, typedValue: string, btnLabel: string) {
  await page.getByLabel('confirm-input').fill(typedValue);
  await page.getByRole('button', { name: btnLabel }).click();
}

// ---------------------------------------------------------------------------
// Quest: create → edit → delete
// ---------------------------------------------------------------------------

test.describe('Quest editor', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('create, edit, and delete a quest round-trips through the DO', async ({
    page,
    request,
  }) => {
    await page.goto('/gm/quests');

    // --- Create ---
    await page.getByRole('button', { name: '+ New quest' }).click();
    const form = page.getByTestId('quest-form-new');
    await form.getByLabel('title').fill('E2E Quest');
    await form.getByLabel('status').selectOption('active');
    await form.getByLabel('priority').selectOption('high');
    await form.getByLabel('location').fill('Sandpoint');
    await form.getByLabel('giver').fill('Mayor Deverin');
    await form.getByLabel('description').fill('A test quest created by E2E automation.');
    await form.getByRole('button', { name: 'Create quest' }).click();
    await expectSaved(page);

    // New form collapses; entry card appears
    await expect(page.getByTestId('quest-form-new')).not.toBeVisible();
    await expect(page.getByTestId('quest-form-e2e-quest')).toBeVisible();

    // /api/content reflects the new quest
    let payload = await fetchContent(request);
    let entry = findInCollection(payload, 'quest', 'e2e-quest');
    expect(entry).toMatchObject({
      id: 'e2e-quest',
      title: 'E2E Quest',
      status: 'active',
      priority: 'high',
      location: 'Sandpoint',
      giver: 'Mayor Deverin',
    });

    // --- Edit ---
    const savedForm = page.getByTestId('quest-form-e2e-quest');
    await savedForm.getByLabel('status').selectOption('completed');
    await savedForm.getByRole('button', { name: 'Save' }).click();
    await expectSaved(page);

    payload = await fetchContent(request);
    entry = findInCollection(payload, 'quest', 'e2e-quest');
    expect(entry).toMatchObject({ status: 'completed' });

    // --- Delete ---
    await savedForm.getByRole('button', { name: 'Delete' }).click();
    await confirmTyped(page, 'E2E Quest', 'Delete forever');
    await expectSaved(page);

    await expect(page.getByTestId('quest-form-e2e-quest')).not.toBeVisible();

    payload = await fetchContent(request);
    expect(findInCollection(payload, 'quest', 'e2e-quest')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Faction (Reputation): create with rank tier → edit reputation → delete
// ---------------------------------------------------------------------------

test.describe('Faction editor', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('create with rank tier, edit reputation score, and delete', async ({
    page,
    request,
  }) => {
    await page.goto('/gm/reputation');

    // --- Create ---
    await page.getByRole('button', { name: '+ New faction' }).click();
    const form = page.getByTestId('faction-form-new');
    await form.getByLabel('faction-name').fill('E2E Faction');
    await form.getByLabel('reputation').fill('5');
    await form.getByRole('button', { name: 'Add tier' }).click();
    await form.getByLabel('rank-0-name').fill('Neutral');
    await form.getByLabel('rank-0-min').fill('0');
    await form.getByLabel('rank-0-max').fill('10');
    await form.getByLabel('rank-0-effect').fill('No bonuses');
    await form.getByRole('button', { name: 'Create faction' }).click();
    await expectSaved(page);

    await expect(page.getByTestId('faction-form-new')).not.toBeVisible();
    await expect(page.getByTestId('faction-form-e2e-faction')).toBeVisible();

    let payload = await fetchContent(request);
    let entry = findInCollection(payload, 'faction', 'e2e-faction');
    expect(entry).toMatchObject({
      id: 'e2e-faction',
      name: 'E2E Faction',
      reputation: 5,
      ranks: [{ name: 'Neutral', min: 0, max: 10, effect: 'No bonuses' }],
    });

    // --- Edit ---
    const savedForm = page.getByTestId('faction-form-e2e-faction');
    await savedForm.getByLabel('reputation').fill('15');
    await savedForm.getByRole('button', { name: 'Save' }).click();
    await expectSaved(page);

    payload = await fetchContent(request);
    entry = findInCollection(payload, 'faction', 'e2e-faction');
    expect(entry).toMatchObject({ reputation: 15 });

    // --- Delete ---
    await savedForm.getByRole('button', { name: 'Delete' }).click();
    await confirmTyped(page, 'E2E Faction', 'Delete forever');
    await expectSaved(page);

    await expect(page.getByTestId('faction-form-e2e-faction')).not.toBeVisible();

    payload = await fetchContent(request);
    expect(findInCollection(payload, 'faction', 'e2e-faction')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Calendar events: fixed-date + recurring-rule, type tab filter, delete
// ---------------------------------------------------------------------------

test.describe('Calendar editor', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('create a fixed-date event and assert it appears in the type tab', async ({
    page,
    request,
  }) => {
    await page.goto('/gm/calendar');

    await page.getByRole('button', { name: '+ New event' }).click();
    const form = page.getByTestId('event-form-new');
    await form.getByLabel('title').fill('E2E Festival');
    await form.getByLabel('type').fill('festival');
    await form.getByLabel('month').fill('4');
    await form.getByLabel('day').fill('15');
    await form.getByLabel('description').fill('Annual E2E celebration.');
    await form.getByRole('button', { name: 'Create event' }).click();
    await expectSaved(page);

    await expect(page.getByTestId('event-form-new')).not.toBeVisible();
    await expect(page.getByTestId('event-form-e2e-festival')).toBeVisible();

    // Type tab "festival" appears and filters to this event
    const nav = page.getByRole('navigation', { name: 'event types' });
    await expect(nav.getByRole('button', { name: 'festival' })).toBeVisible();
    await nav.getByRole('button', { name: 'festival' }).click();
    await expect(page.getByTestId('event-form-e2e-festival')).toBeVisible();

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'calendar', 'e2e-festival');
    expect(entry).toMatchObject({
      id: 'e2e-festival',
      title: 'E2E Festival',
      type: 'festival',
      date: { month: 4, day: 15 },
    });
  });

  test('create a recurring-rule event (no fixed date required)', async ({
    page,
    request,
  }) => {
    await page.goto('/gm/calendar');

    await page.getByRole('button', { name: '+ New event' }).click();
    const form = page.getByTestId('event-form-new');
    await form.getByLabel('title').fill('E2E Moon');
    await form.getByLabel('type').fill('astronomical');
    await form.getByLabel('recurring').fill('every full moon');
    await form.getByLabel('description').fill('Recurring lunar event.');
    await form.getByRole('button', { name: 'Create event' }).click();
    await expectSaved(page);

    await expect(page.getByTestId('event-form-e2e-moon')).toBeVisible();

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'calendar', 'e2e-moon');
    expect(entry).toMatchObject({ recurring: 'every full moon' });
    // A recurring-only event has no `date` key
    expect(entry).not.toHaveProperty('date');
  });

  test('delete a calendar event with typed confirm', async ({ page, seed }) => {
    await seed({ calendar: [{ id: 'e2e-delete-me', title: 'E2E Delete Me', type: 'campaign', date: { month: 1, day: 1 } }] });

    await page.goto('/gm/calendar');
    await expect(page.getByTestId('event-form-e2e-delete-me')).toBeVisible();

    await page.getByTestId('event-form-e2e-delete-me').getByRole('button', { name: 'Delete' }).click();
    await confirmTyped(page, 'E2E Delete Me', 'Delete forever');
    await expectSaved(page);

    await expect(page.getByTestId('event-form-e2e-delete-me')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Lore entries: create, edit, delete, category tab filter, slug collision
// ---------------------------------------------------------------------------

test.describe('Lore editor', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('create, edit summary, and delete a lore entry round-trips', async ({
    page,
    request,
  }) => {
    await page.goto('/gm/lore');

    // --- Create ---
    await page.getByRole('button', { name: '+ New entry' }).click();
    const form = page.getByTestId('lore-form-new');
    await form.getByLabel('title').fill('E2E Location');
    await form.getByLabel('category').fill('Location');
    await form.getByLabel('summary').fill('A place for automated testing.');
    await form.getByLabel('content').fill('Detailed lore content goes here.');
    await form.getByLabel('related').fill('e2e-quest, some-npc');
    await form.getByLabel('tags').fill('testing, automation');
    await form.getByRole('button', { name: 'Create entry' }).click();
    await expectSaved(page);

    await expect(page.getByTestId('lore-form-new')).not.toBeVisible();
    await expect(page.getByTestId('lore-form-e2e-location')).toBeVisible();

    let payload = await fetchContent(request);
    let entry = findInCollection(payload, 'lore', 'e2e-location');
    expect(entry).toMatchObject({
      id: 'e2e-location',
      title: 'E2E Location',
      category: 'Location',
      summary: 'A place for automated testing.',
      related: ['e2e-quest', 'some-npc'],
      tags: ['testing', 'automation'],
    });

    // --- Edit ---
    const savedForm = page.getByTestId('lore-form-e2e-location');
    await savedForm.getByLabel('summary').fill('Updated summary for E2E Location.');
    await savedForm.getByRole('button', { name: 'Save' }).click();
    await expectSaved(page);

    payload = await fetchContent(request);
    entry = findInCollection(payload, 'lore', 'e2e-location');
    expect(entry).toMatchObject({ summary: 'Updated summary for E2E Location.' });

    // --- Delete ---
    await savedForm.getByRole('button', { name: 'Delete' }).click();
    await confirmTyped(page, 'E2E Location', 'Delete forever');
    await expectSaved(page);

    await expect(page.getByTestId('lore-form-e2e-location')).not.toBeVisible();

    payload = await fetchContent(request);
    expect(findInCollection(payload, 'lore', 'e2e-location')).toBeUndefined();
  });

  test('category tab filter shows only matching entries', async ({ page, seed }) => {
    await seed({
      lore: [
        { id: 'loc-one', title: 'Loc One', category: 'Location', summary: '', content: '', related: [], tags: [] },
        { id: 'npc-one', title: 'Npc One', category: 'NPC', summary: '', content: '', related: [], tags: [] },
      ],
    });

    await page.goto('/gm/lore');

    // "All" tab shows both
    const nav = page.getByRole('navigation', { name: 'lore categories' });
    await expect(page.getByTestId('lore-form-loc-one')).toBeVisible();
    await expect(page.getByTestId('lore-form-npc-one')).toBeVisible();

    // Switch to Location tab
    await nav.getByRole('button', { name: 'Location' }).click();
    await expect(page.getByTestId('lore-form-loc-one')).toBeVisible();
    await expect(page.getByTestId('lore-form-npc-one')).not.toBeVisible();

    // Switch to NPC tab
    await nav.getByRole('button', { name: 'NPC' }).click();
    await expect(page.getByTestId('lore-form-npc-one')).toBeVisible();
    await expect(page.getByTestId('lore-form-loc-one')).not.toBeVisible();
  });

  test('slug collision triggers overwrite confirm and saves successfully', async ({
    page,
    seed,
    request,
  }) => {
    // Pre-seed an entry with id "e2e-collision"
    await seed({
      lore: [{ id: 'e2e-collision', title: 'E2E Collision', category: 'Location', summary: 'Original', content: '', related: [], tags: [] }],
    });

    await page.goto('/gm/lore');
    await expect(page.getByTestId('lore-form-e2e-collision')).toBeVisible();

    // Click + New entry and fill the same title → same slug → collision
    await page.getByRole('button', { name: '+ New entry' }).click();
    const form = page.getByTestId('lore-form-new');
    await form.getByLabel('title').fill('E2E Collision');
    await form.getByLabel('category').fill('Location');
    await form.getByLabel('summary').fill('Replacement');
    await form.getByRole('button', { name: 'Create entry' }).click();

    // ConfirmDialog appears (no requireType for collision — plain confirm)
    await expect(page.getByRole('dialog')).toContainText('already exists');
    await page.getByRole('button', { name: 'Overwrite' }).click();
    await expectSaved(page);

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'lore', 'e2e-collision');
    expect(entry).toMatchObject({ summary: 'Replacement' });
  });
});
