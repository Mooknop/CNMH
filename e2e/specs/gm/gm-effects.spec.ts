/**
 * GM Effects catalog editor (#322, part of #295). The last PageEditorShell
 * editor without coverage; mirrors gm-flat — create / edit / delete round-trips
 * through the DO and the /api/content snapshot. Desktop-only (GM Tools).
 */

import { test, expect } from '../../fixtures/gm';
import { fetchContent, findInCollection } from '../../helpers/content';
import { testId } from '../../helpers/ids';

async function expectSaved(page: import('@playwright/test').Page) {
  await expect(page.getByRole('status')).toContainText('Changes are live', { timeout: 20_000 });
}

test.describe('Effect catalog editor', () => {
  test('create, edit, and delete an effect round-trips through the DO', async ({ page, request }) => {
    const id = testId('effect');
    const name = `E2E Effect ${id}`;

    await page.goto('/gm/catalog/effects');

    // --- Create ---
    await page.getByRole('button', { name: '+ New effect' }).click();
    const form = page.getByTestId('effect-form-new');
    await form.getByLabel('name').fill(name);
    await form.getByLabel('description').fill('An automated test effect.');
    await form.getByRole('button', { name: 'Create effect' }).click();
    await expectSaved(page);

    // The slug id derives from the name; reselect keeps the saved form open.
    const savedId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const savedForm = page.getByTestId(`effect-form-${savedId}`);
    await expect(savedForm).toBeVisible();

    let payload = await fetchContent(request);
    expect(findInCollection(payload, 'effect', savedId)).toMatchObject({ id: savedId, name });

    // --- Edit ---
    await savedForm.getByLabel('description').fill('Updated effect description.');
    await savedForm.getByRole('button', { name: 'Save', exact: true }).click();
    await expectSaved(page);
    payload = await fetchContent(request);
    expect(findInCollection(payload, 'effect', savedId)).toMatchObject({ description: 'Updated effect description.' });

    // --- Delete (typed confirm) ---
    await savedForm.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByLabel('confirm-input').fill(name);
    await page.getByRole('button', { name: 'Delete forever' }).click();
    await expectSaved(page);
    await expect(page.getByTestId(`effect-form-${savedId}`)).toBeHidden();

    payload = await fetchContent(request);
    expect(findInCollection(payload, 'effect', savedId)).toBeUndefined();
  });
});
