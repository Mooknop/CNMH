/**
 * GM trait-catalog + campaign-theme round-trip suite (#517).
 *
 * Traits (/gm/catalog/traits — GmTraits + PageEditorShell):
 *  - Create / edit / delete a trait definition through the DO.
 *  - The trait-coverage report flags an orphan trait reference (an item whose
 *    `traits` list names a trait with no definition) until a matching
 *    definition is created.
 *
 * Theme (/gm/theme — GmTheme):
 *  - A palette-slot change saves to the `theme` collection (doc id "campaign"),
 *    flips the preset to "custom", and is re-applied on reload both to the
 *    editor and to the injected :root CSS custom properties.
 *  - Applying a colorblind preset + a per-character accent override persists.
 *
 * Every mutation is asserted via both the rendered DOM and /api/content —
 * theme persistence is content-API-backed (NOT a synced key), so it genuinely
 * round-trips across a full page reload.
 *
 * Reset-free: unique IDs per test. Desktop-only (GM Tools has no responsive
 * layout) — gm/ specs run on the chromium project only by config convention.
 */

import { test, expect } from '../../fixtures/gm';
import { fetchContent, findInCollection, waitForContent } from '../../helpers/content';
import { testId, testTitle } from '../../helpers/ids';

async function expectSaved(page: import('@playwright/test').Page) {
  await expect(page.getByRole('status')).toContainText('Changes are live', { timeout: 20_000 });
}

async function confirmTyped(page: import('@playwright/test').Page, typedValue: string, btnLabel: string) {
  await page.getByLabel('confirm-input').fill(typedValue);
  await page.getByRole('button', { name: btnLabel }).click();
}

test.describe('Trait catalog editor', () => {
  test('create, edit, and delete a trait definition', async ({ page, request }) => {
    const id = testId('trait');
    const name = testTitle('trait', id);

    await page.goto('/gm/catalog/traits');

    // Create
    await page.getByRole('button', { name: '+ New trait' }).click();
    const form = page.getByTestId('trait-form-new');
    await form.getByLabel('name', { exact: true }).fill(name);
    await form.getByLabel('description').fill('A trait definition authored by the E2E suite.');
    await form.getByRole('button', { name: 'Create trait' }).click();
    await expectSaved(page);

    await expect(page.getByTestId('trait-form-new')).not.toBeVisible();
    const savedForm = page.getByTestId(`trait-form-${id}`);
    await expect(savedForm).toBeVisible();

    let payload = await fetchContent(request);
    let entry = findInCollection(payload, 'trait', id);
    expect(entry).toMatchObject({
      id,
      name,
      description: 'A trait definition authored by the E2E suite.',
    });

    // A saved definition shows its reverse-reference view (this one is unused).
    await expect(savedForm).toContainText('Not referenced by any content.');

    // Edit
    await savedForm.getByLabel('description').fill('Updated by the E2E suite.');
    await savedForm.getByRole('button', { name: 'Save' }).click();
    await waitForContent(request, 'trait', id, (e) => e?.description === 'Updated by the E2E suite.');
    payload = await fetchContent(request);
    entry = findInCollection(payload, 'trait', id);
    expect(entry).toMatchObject({ description: 'Updated by the E2E suite.' });

    // Delete (typed confirmation)
    await savedForm.getByRole('button', { name: 'Delete' }).click();
    await confirmTyped(page, name, 'Delete forever');

    await expect(page.getByTestId(`trait-form-${id}`)).not.toBeVisible();
    await waitForContent(request, 'trait', id, (e) => !e);
  });

  test('coverage report flags an orphan reference until its definition exists', async ({
    page,
    request,
    seed,
  }) => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const traitName = `E2E Zephyr ${suffix}`;
    const traitId = `e2e-zephyr-${suffix}`; // editor slug of traitName
    const itemId = testId('relic');
    const itemName = testTitle('relic', itemId);

    // An item referencing a trait that has no definition anywhere.
    await seed({ item: [{ id: itemId, name: itemName, traits: [traitName] }] });

    await page.goto('/gm/catalog/traits');

    const coverage = page.getByRole('region', { name: 'Trait coverage' });
    await expect(coverage).toBeVisible();
    // The orphaned name is listed, along with the referencing item.
    await expect(coverage).toContainText(traitName);
    await expect(coverage).toContainText(itemName);

    // Define the trait — the orphan entry must disappear.
    await page.getByRole('button', { name: '+ New trait' }).click();
    const form = page.getByTestId('trait-form-new');
    await form.getByLabel('name', { exact: true }).fill(traitName);
    await form.getByLabel('description').fill('Definition created to resolve an orphan reference.');
    await form.getByRole('button', { name: 'Create trait' }).click();
    await expectSaved(page);

    await expect(coverage).not.toContainText(traitName);

    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'trait', traitId);
    expect(entry).toMatchObject({ id: traitId, name: traitName });

    // The definition's reverse view lists the referencing item.
    await expect(page.getByTestId(`trait-form-${traitId}`)).toContainText(itemName);
  });
});

test.describe('Campaign theme editor', () => {
  test('accent slot change persists and is re-applied on reload', async ({ page, request }) => {
    await page.goto('/gm/theme');
    await expect(page.getByRole('heading', { name: 'Campaign Theme' })).toBeVisible();

    // Change the accent color slot; touching a slot flips the preset to custom.
    await page.getByLabel('Accent / HP').fill('#3366cc');
    await page.getByRole('button', { name: 'Save & sync' }).click();
    await expect(page.getByText('Theme saved and synced to all players.')).toBeVisible();

    // Theme is a content doc (collection `theme`, id `campaign`) — not a synced
    // key — so it must round-trip through the DO.
    await waitForContent(
      request,
      'theme',
      'campaign',
      (e) => (e?.palette as Record<string, unknown> | undefined)?.accent === '#3366cc',
    );
    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'theme', 'campaign');
    expect(entry).toMatchObject({ id: 'campaign', preset: 'custom' });
    expect((entry as { palette: Record<string, unknown> }).palette).toMatchObject({
      accent: '#3366cc',
    });

    // Full reload: the editor re-hydrates from the DO and ContentContext
    // re-injects the themeable vars onto :root.
    await page.reload();
    await expect(page.getByLabel('Accent / HP')).toHaveValue('#3366cc');
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim(),
        ),
      )
      .toBe('#3366cc');
  });

  test('colorblind preset and per-character accent override persist', async ({ page, request }) => {
    await page.goto('/gm/theme');
    await expect(page.getByRole('heading', { name: 'Campaign Theme' })).toBeVisible();

    // Apply the Deuteranopia preset card (the sim toolbar also has a bare
    // "Deuteranopia" button — the tag suffix disambiguates the preset card).
    await page.getByRole('button', { name: 'Deuteranopia Red-green safe' }).click();
    await expect(page.getByLabel('Accent / HP')).toHaveValue('#1f6fb2');

    // Set the first character's accent override.
    const override = page.getByLabel(/^Accent color for /).first();
    await override.fill('#00aa88');

    await page.getByRole('button', { name: 'Save & sync' }).click();
    await expect(page.getByText('Theme saved and synced to all players.')).toBeVisible();

    await waitForContent(request, 'theme', 'campaign', (e) => e?.preset === 'deuter');
    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'theme', 'campaign');
    expect((entry as { palette: Record<string, unknown> }).palette).toMatchObject({
      accent: '#1f6fb2',
    });
    const overrides = (entry as { accentOverrides?: Record<string, string> }).accentOverrides ?? {};
    expect(Object.values(overrides)).toContain('#00aa88');

    // Reload: preset palette and the override both re-hydrate.
    await page.reload();
    await expect(page.getByLabel('Accent / HP')).toHaveValue('#1f6fb2');
    await expect(page.getByLabel(/^Accent color for /).first()).toHaveValue('#00aa88');
  });
});
