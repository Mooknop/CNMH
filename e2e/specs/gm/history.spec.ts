/**
 * GM history (HistoryModal) round-trip suite.
 *
 * Verifies the per-entity version browser for the shared ConfirmDialog
 * typed-restore flow. Lore is the test vehicle (smallest editor surface,
 * exercises the same archive/restore plumbing every collection uses).
 *
 * Flow:
 *  - Seed a lore entry at summary V1 (seed does NOT archive).
 *  - Edit via UI to V2 → archive captures V1.
 *  - Edit via UI to V3 → archive captures V2. History now [V2, V1] newest-first.
 *  - Open HistoryModal → assert 2 version cards visible.
 *  - Click "Restore" on the V1 card → typed-confirm with the entry title.
 *  - Assert: form summary now shows V1, /api/content reflects V1, and the
 *    pre-restore V3 was itself archived (history is now [V3, V2, V1]).
 *
 * Desktop-only: GM Tools has no responsive layout.
 */

import { test, expect } from '../../fixtures/gm';
import { fetchContent, findInCollection } from '../../helpers/content';

async function expectSaved(page: import('@playwright/test').Page) {
  await expect(page.getByRole('status')).toContainText('Changes are live', { timeout: 20_000 });
}

test.describe('Lore history', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('edit twice, list 2 versions, restore older, pre-restore archived', async ({
    page,
    seed,
    request,
  }) => {
    // Seed at V1 (seed path passes archive=false, so history starts empty)
    await seed({
      lore: [{
        id: 'e2e-hist',
        title: 'E2E Hist',
        category: 'Location',
        summary: 'V1',
        content: '',
        related: [],
        tags: [],
      }],
    });

    await page.goto('/gm/lore');
    const form = page.getByTestId('lore-form-e2e-hist');
    await expect(form).toBeVisible();

    // --- Edit V1 → V2 (archives V1) ---
    await form.getByLabel('summary').fill('V2');
    await form.getByRole('button', { name: 'Save' }).click();
    await expectSaved(page);

    // --- Edit V2 → V3 (archives V2) ---
    await form.getByLabel('summary').fill('V3');
    await form.getByRole('button', { name: 'Save' }).click();
    await expectSaved(page);

    // --- Open HistoryModal → assert 2 version cards ---
    await form.getByRole('button', { name: 'History' }).click();
    // Disambiguate from any ConfirmDialog (also .modal-container) by matching
    // the HistoryModal's title text "History — <name>".
    const historyModal = page.locator('.modal-container').filter({ hasText: 'History — E2E Hist' });
    await expect(historyModal).toBeVisible();
    // Each version card has data-testid="version-<archived_at>"; count them
    const versionCards = historyModal.locator('[data-testid^="version-"]');
    await expect(versionCards).toHaveCount(2);

    // Older version (V1) is at the bottom — newest-first ordering means it's
    // index 1. Click its "Restore this version" button.
    await versionCards.nth(1).getByRole('button', { name: 'Restore this version' }).click();

    // ConfirmDialog appears with requireType=<title>. Type the title and confirm.
    await page.getByLabel('confirm-input').fill('E2E Hist');
    await page.getByRole('button', { name: 'Restore', exact: true }).click();

    // Restore broadcasts "Changes are live" via the same flash
    await expectSaved(page);

    // --- Assert form reflects V1 ---
    // The form re-seeds from the restored data via onRestored(doc), so summary
    // should now display V1 again.
    await expect(form.getByLabel('summary')).toHaveValue('V1');

    // --- Assert /api/content reflects V1 ---
    const payload = await fetchContent(request);
    const entry = findInCollection(payload, 'lore', 'e2e-hist') as any;
    expect(entry).toMatchObject({ id: 'e2e-hist', summary: 'V1' });

    // --- Assert pre-restore (V3) was itself archived ---
    // The restore path archives the current row before overwriting, so opening
    // History again should now show 3 versions: [V3 (just archived), V2, V1].
    await form.getByRole('button', { name: 'History' }).click();
    await expect(historyModal).toBeVisible();
    await expect(versionCards).toHaveCount(3);
    // The newest archive is at index 0 and contains the pre-restore V3 data
    await expect(versionCards.nth(0)).toContainText('V3');
  });
});
