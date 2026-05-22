/**
 * GM spell catalog round-trip suite.
 *
 * Covers the full lifecycle of the spell catalog editor: create with all
 * scalar fields + traits + heightened entries, edit a field, delete with
 * typed confirm. Also verifies the raw-JSON extra-fields box round-trips
 * without stomping managed scalars.
 *
 * Desktop-only: GM Tools has no responsive layout.
 */

import { test, expect } from '../../fixtures/gm';
import { fetchContent, findInCollection } from '../../helpers/content';

async function expectSaved(page: import('@playwright/test').Page) {
  await expect(page.getByRole('status')).toContainText('Changes are live', { timeout: 10_000 });
}

async function confirmTyped(page: import('@playwright/test').Page, typedValue: string, btnLabel: string) {
  await page.getByLabel('confirm-input').fill(typedValue);
  await page.getByRole('button', { name: btnLabel }).click();
}

test.describe('Spell catalog editor', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  // ---------------------------------------------------------------------------
  // 1. Create, edit, and delete a spell (full CRUD)
  // ---------------------------------------------------------------------------

  test('create, edit range, and delete a spell round-trips', async ({ page, request }) => {
    await page.goto('/gm/spells');
    await page.getByRole('button', { name: '+ New spell' }).click();
    const form = page.getByTestId('spell-form-new');

    await form.getByLabel('name').fill('E2E Fireball');
    await form.getByLabel('level').fill('3');
    await form.getByLabel('traits').fill('Fire, Evocation');
    await form.getByLabel('range').fill('500 feet');
    await form.getByLabel('area').fill('20-foot burst');
    await form.getByLabel('targets').fill('all creatures');
    await form.getByLabel('description').fill('A ball of fire that explodes on impact.');
    await form.getByRole('button', { name: 'Create spell' }).click();
    await expectSaved(page);

    await expect(page.getByTestId('spell-form-new')).not.toBeVisible();
    await expect(page.getByTestId('spell-form-e2e-fireball')).toBeVisible();

    let payload = await fetchContent(request);
    let entry = findInCollection(payload, 'spell', 'e2e-fireball');
    expect(entry).toMatchObject({
      id: 'e2e-fireball',
      name: 'E2E Fireball',
      level: 3,
      traits: ['Fire', 'Evocation'],
      range: '500 feet',
      area: '20-foot burst',
    });

    // Edit range
    const savedForm = page.getByTestId('spell-form-e2e-fireball');
    await savedForm.getByLabel('range').fill('120 feet');
    await savedForm.getByRole('button', { name: 'Save' }).click();
    await expectSaved(page);

    payload = await fetchContent(request);
    entry = findInCollection(payload, 'spell', 'e2e-fireball');
    expect(entry).toMatchObject({ range: '120 feet' });

    // Delete
    await savedForm.getByRole('button', { name: 'Delete' }).click();
    await confirmTyped(page, 'E2E Fireball', 'Delete forever');
    await expectSaved(page);

    await expect(page.getByTestId('spell-form-e2e-fireball')).not.toBeVisible();
    payload = await fetchContent(request);
    expect(findInCollection(payload, 'spell', 'e2e-fireball')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // 2. Heightened entries persist across a round-trip
  // ---------------------------------------------------------------------------

  test('heightened entry map round-trips', async ({ page, request }) => {
    await page.goto('/gm/spells');
    await page.getByRole('button', { name: '+ New spell' }).click();
    const form = page.getByTestId('spell-form-new');

    await form.getByLabel('name').fill('E2E Heal');
    await form.getByLabel('level').fill('1');

    await form.getByRole('button', { name: 'Add heightened' }).click();
    await form.getByLabel('heightened-0-key').fill('+1');
    await form.getByLabel('heightened-0-text').fill('Adds 1d8 per additional rank.');

    await form.getByRole('button', { name: 'Add heightened' }).click();
    await form.getByLabel('heightened-1-key').fill('3rd');
    await form.getByLabel('heightened-1-text').fill('Target two creatures.');

    await form.getByRole('button', { name: 'Create spell' }).click();
    await expectSaved(page);

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'spell', 'e2e-heal') as any;
    expect(entry.heightened).toMatchObject({
      '+1': 'Adds 1d8 per additional rank.',
      '3rd': 'Target two creatures.',
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Extra-fields JSON box survives alongside managed scalars
  // ---------------------------------------------------------------------------

  test('restJson extra fields merge with managed scalars on save', async ({ page, request }) => {
    await page.goto('/gm/spells');
    await page.getByRole('button', { name: '+ New spell' }).click();
    const form = page.getByTestId('spell-form-new');

    await form.getByLabel('name').fill('E2E Dispel Magic');
    await form.getByLabel('level').fill('3');
    await form.getByLabel('range').fill('120 feet');

    // Add a bespoke flag via the raw-JSON box
    await form.getByLabel('rest-json').fill(JSON.stringify({ counteract: true, bloodline: 'arcane' }));

    await form.getByRole('button', { name: 'Create spell' }).click();
    await expectSaved(page);

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'spell', 'e2e-dispel-magic') as any;
    // Managed scalars survive
    expect(entry).toMatchObject({ name: 'E2E Dispel Magic', level: 3, range: '120 feet' });
    // Extra-JSON fields also present
    expect(entry.counteract).toBe(true);
    expect(entry.bloodline).toBe('arcane');
  });
});
