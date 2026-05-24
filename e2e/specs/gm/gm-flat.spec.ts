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
 * Reset-free: each test uses unique IDs so data never bleeds between tests.
 * Tests that pre-need existing content use the `seed` fixture.
 *
 * Desktop-only: GM Tools has no responsive layout.
 */

import { test, expect } from '../../fixtures/gm';
import { fetchContent, findInCollection } from '../../helpers/content';
import { testId, testTitle } from '../../helpers/ids';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the green flash that confirms a GM save broadcast. */
async function expectSaved(page: import('@playwright/test').Page) {
  await expect(page.getByRole('status')).toContainText('Changes are live', { timeout: 20_000 });
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
  test('create, edit, and delete a quest round-trips through the DO', async ({
    page,
    request,
  }) => {
    const id = testId('quest');
    const title = testTitle('quest', id);

    await page.goto('/gm/quests');

    // --- Create ---
    await page.getByRole('button', { name: '+ New quest' }).click();
    const form = page.getByTestId('quest-form-new');
    await form.getByLabel('title').fill(title);
    await form.getByLabel('status').selectOption('active');
    await form.getByLabel('priority').selectOption('high');
    await form.getByLabel('location').fill('Sandpoint');
    await form.getByLabel('giver').fill('Mayor Deverin');
    await form.getByLabel('description').fill('A test quest created by E2E automation.');
    await form.getByRole('button', { name: 'Create quest' }).click();
    await expectSaved(page);

    // New form collapses; entry card appears
    await expect(page.getByTestId('quest-form-new')).not.toBeVisible();
    await expect(page.getByTestId(`quest-form-${id}`)).toBeVisible();

    // /api/content reflects the new quest
    let payload = await fetchContent(request);
    let entry = findInCollection(payload, 'quest', id);
    expect(entry).toMatchObject({
      id,
      title,
      status: 'active',
      priority: 'high',
      location: 'Sandpoint',
      giver: 'Mayor Deverin',
    });

    // --- Edit ---
    const savedForm = page.getByTestId(`quest-form-${id}`);
    await savedForm.getByLabel('status').selectOption('completed');
    await savedForm.getByRole('button', { name: 'Save' }).click();
    await expectSaved(page);

    payload = await fetchContent(request);
    entry = findInCollection(payload, 'quest', id);
    expect(entry).toMatchObject({ status: 'completed' });

    // --- Delete ---
    await savedForm.getByRole('button', { name: 'Delete' }).click();
    await confirmTyped(page, title, 'Delete forever');
    await expectSaved(page);

    await expect(page.getByTestId(`quest-form-${id}`)).not.toBeVisible();

    payload = await fetchContent(request);
    expect(findInCollection(payload, 'quest', id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Faction (Reputation): create with rank tier → edit reputation → delete
// ---------------------------------------------------------------------------

test.describe('Faction editor', () => {
  test('create with rank tier, edit reputation score, and delete', async ({
    page,
    request,
  }) => {
    const id = testId('faction');
    const name = testTitle('faction', id);

    await page.goto('/gm/reputation');

    // --- Create ---
    await page.getByRole('button', { name: '+ New faction' }).click();
    const form = page.getByTestId('faction-form-new');
    await form.getByLabel('faction-name').fill(name);
    await form.getByLabel('reputation').fill('5');
    await form.getByRole('button', { name: 'Add tier' }).click();
    await form.getByLabel('rank-0-name').fill('Neutral');
    await form.getByLabel('rank-0-min').fill('0');
    await form.getByLabel('rank-0-max').fill('10');
    await form.getByLabel('rank-0-effect').fill('No bonuses');
    await form.getByRole('button', { name: 'Create faction' }).click();
    await expectSaved(page);

    await expect(page.getByTestId('faction-form-new')).not.toBeVisible();
    await expect(page.getByTestId(`faction-form-${id}`)).toBeVisible();

    let payload = await fetchContent(request);
    let entry = findInCollection(payload, 'faction', id);
    expect(entry).toMatchObject({
      id,
      name,
      reputation: 5,
      ranks: [{ name: 'Neutral', min: 0, max: 10, effect: 'No bonuses' }],
    });

    // --- Edit ---
    const savedForm = page.getByTestId(`faction-form-${id}`);
    await savedForm.getByLabel('reputation').fill('15');
    await savedForm.getByRole('button', { name: 'Save' }).click();
    await expectSaved(page);

    payload = await fetchContent(request);
    entry = findInCollection(payload, 'faction', id);
    expect(entry).toMatchObject({ reputation: 15 });

    // --- Delete ---
    await savedForm.getByRole('button', { name: 'Delete' }).click();
    await confirmTyped(page, name, 'Delete forever');
    await expectSaved(page);

    await expect(page.getByTestId(`faction-form-${id}`)).not.toBeVisible();

    payload = await fetchContent(request);
    expect(findInCollection(payload, 'faction', id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Calendar events: fixed-date + recurring-rule, type tab filter, delete
// ---------------------------------------------------------------------------

test.describe('Calendar editor', () => {
  test('create a fixed-date event and assert it appears in the type tab', async ({
    page,
    request,
  }) => {
    const id = testId('festival');
    const title = testTitle('festival', id);

    await page.goto('/gm/calendar');

    await page.getByRole('button', { name: '+ New event' }).click();
    const form = page.getByTestId('event-form-new');
    await form.getByLabel('title').fill(title);
    await form.getByLabel('type').fill('festival');
    await form.getByLabel('month').fill('4');
    await form.getByLabel('day').fill('15');
    await form.getByLabel('description').fill('Annual E2E celebration.');
    await form.getByRole('button', { name: 'Create event' }).click();
    await expectSaved(page);

    await expect(page.getByTestId('event-form-new')).not.toBeVisible();
    await expect(page.getByTestId(`event-form-${id}`)).toBeVisible();

    // Type tab "festival" appears and filters to this event
    const nav = page.getByRole('navigation', { name: 'event types' });
    await expect(nav.getByRole('button', { name: 'festival' })).toBeVisible();
    await nav.getByRole('button', { name: 'festival' }).click();
    await expect(page.getByTestId(`event-form-${id}`)).toBeVisible();

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'calendar', id);
    expect(entry).toMatchObject({
      id,
      title,
      type: 'festival',
      date: { month: 4, day: 15 },
    });
  });

  test('create a recurring-rule event (no fixed date required)', async ({
    page,
    request,
  }) => {
    const id = testId('moon');
    const title = testTitle('moon', id);

    await page.goto('/gm/calendar');

    await page.getByRole('button', { name: '+ New event' }).click();
    const form = page.getByTestId('event-form-new');
    await form.getByLabel('title').fill(title);
    await form.getByLabel('type').fill('astronomical');
    await form.getByLabel('recurring').fill('every full moon');
    await form.getByLabel('description').fill('Recurring lunar event.');
    await form.getByRole('button', { name: 'Create event' }).click();
    await expectSaved(page);

    await expect(page.getByTestId(`event-form-${id}`)).toBeVisible();

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'calendar', id);
    expect(entry).toMatchObject({ recurring: 'every full moon' });
    // A recurring-only event has no `date` key
    expect(entry).not.toHaveProperty('date');
  });

  test('delete a calendar event with typed confirm', async ({ page, seed }) => {
    const id = testId('del');
    const title = testTitle('del', id);

    await seed({ calendar: [{ id, title, type: 'campaign', date: { month: 1, day: 1 } }] });

    await page.goto('/gm/calendar');
    await expect(page.getByTestId(`event-form-${id}`)).toBeVisible();

    await page.getByTestId(`event-form-${id}`).getByRole('button', { name: 'Delete' }).click();
    await confirmTyped(page, title, 'Delete forever');
    await expectSaved(page);

    await expect(page.getByTestId(`event-form-${id}`)).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Lore entries: create, edit, delete, category tab filter, slug collision
// ---------------------------------------------------------------------------

test.describe('Lore editor', () => {
  test('create, edit summary, and delete a lore entry round-trips', async ({
    page,
    request,
  }) => {
    const id = testId('location');
    const title = testTitle('location', id);

    await page.goto('/gm/lore');

    // --- Create ---
    await page.getByRole('button', { name: '+ New entry' }).click();
    const form = page.getByTestId('lore-form-new');
    await form.getByLabel('title').fill(title);
    await form.getByLabel('category').fill('Location');
    await form.getByLabel('summary').fill('A place for automated testing.');
    await form.getByLabel('content').fill('Detailed lore content goes here.');
    await form.getByLabel('related').fill('e2e-quest, some-npc');
    await form.getByLabel('tags').fill('testing, automation');
    await form.getByRole('button', { name: 'Create entry' }).click();
    await expectSaved(page);

    await expect(page.getByTestId('lore-form-new')).not.toBeVisible();
    await expect(page.getByTestId(`lore-form-${id}`)).toBeVisible();

    let payload = await fetchContent(request);
    let entry = findInCollection(payload, 'lore', id);
    expect(entry).toMatchObject({
      id,
      title,
      category: 'Location',
      summary: 'A place for automated testing.',
      related: ['e2e-quest', 'some-npc'],
      tags: ['testing', 'automation'],
    });

    // --- Edit ---
    const savedForm = page.getByTestId(`lore-form-${id}`);
    await savedForm.getByLabel('summary').fill('Updated summary for E2E Location.');
    await savedForm.getByRole('button', { name: 'Save' }).click();
    await expectSaved(page);

    payload = await fetchContent(request);
    entry = findInCollection(payload, 'lore', id);
    expect(entry).toMatchObject({ summary: 'Updated summary for E2E Location.' });

    // --- Delete ---
    await savedForm.getByRole('button', { name: 'Delete' }).click();
    await confirmTyped(page, title, 'Delete forever');
    await expectSaved(page);

    await expect(page.getByTestId(`lore-form-${id}`)).not.toBeVisible();

    payload = await fetchContent(request);
    expect(findInCollection(payload, 'lore', id)).toBeUndefined();
  });

  test('category tab filter shows only matching entries', async ({ page, seed }) => {
    const locId = testId('loc');
    const npcId = testId('npc');
    const locTitle = testTitle('loc', locId);
    const npcTitle = testTitle('npc', npcId);

    await seed({
      lore: [
        { id: locId, title: locTitle, category: 'Location', summary: '', content: '', related: [], tags: [] },
        { id: npcId, title: npcTitle, category: 'NPC', summary: '', content: '', related: [], tags: [] },
      ],
    });

    await page.goto('/gm/lore');

    // "All" tab shows both
    const nav = page.getByRole('navigation', { name: 'lore categories' });
    await expect(page.getByTestId(`lore-form-${locId}`)).toBeVisible();
    await expect(page.getByTestId(`lore-form-${npcId}`)).toBeVisible();

    // Switch to Location tab
    await nav.getByRole('button', { name: 'Location' }).click();
    await expect(page.getByTestId(`lore-form-${locId}`)).toBeVisible();
    await expect(page.getByTestId(`lore-form-${npcId}`)).not.toBeVisible();

    // Switch to NPC tab
    await nav.getByRole('button', { name: 'NPC' }).click();
    await expect(page.getByTestId(`lore-form-${npcId}`)).toBeVisible();
    await expect(page.getByTestId(`lore-form-${locId}`)).not.toBeVisible();
  });

  test('slug collision triggers overwrite confirm and saves successfully', async ({
    page,
    seed,
    request,
  }) => {
    const baseId = testId('collision');
    const baseTitle = testTitle('collision', baseId);

    // Pre-seed an entry with the unique id
    await seed({
      lore: [{ id: baseId, title: baseTitle, category: 'Location', summary: 'Original', content: '', related: [], tags: [] }],
    });

    await page.goto('/gm/lore');
    await expect(page.getByTestId(`lore-form-${baseId}`)).toBeVisible();

    // Click + New entry and fill the same title → same slug → collision
    await page.getByRole('button', { name: '+ New entry' }).click();
    const form = page.getByTestId('lore-form-new');
    await form.getByLabel('title').fill(baseTitle);
    await form.getByLabel('category').fill('Location');
    await form.getByLabel('summary').fill('Replacement');
    await form.getByRole('button', { name: 'Create entry' }).click();

    // ConfirmDialog appears (no requireType for collision — plain confirm).
    // Modal renders as div.modal-container, not a role="dialog" element.
    await expect(page.locator('.modal-container')).toContainText('already exists');
    await page.getByRole('button', { name: 'Overwrite' }).click();
    await expectSaved(page);

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'lore', baseId);
    expect(entry).toMatchObject({ summary: 'Replacement' });
  });
});
