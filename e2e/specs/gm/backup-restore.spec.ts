/**
 * GM backup → reseed → restore round-trip suite.
 *
 * Single test exercising the full Disaster Recovery loop:
 *  1. Seed two collections (quest + lore) — our "original" state.
 *  2. Click Download backup → capture the file via Playwright's download event.
 *  3. Force reseed (typed RESEED) → assert our originals are gone (replaced by
 *     bundled defaults — Force reseed overwrites, doesn't empty).
 *  4. Restore from the captured backup file (typed RESTORE) → assert our
 *     original quest + lore are back.
 *
 * Desktop-only: GM Tools has no responsive layout.
 *
 * Heavier than typical tests because Force reseed dumps default content
 * (~150 rows) — still trivial against the 100k/day budget.
 */

import { test, expect } from '../../fixtures/gm';
import { fetchContent, findInCollection } from '../../helpers/content';

/** GmDashboard's status line uses a <pre class="gm-result">, not role=status. */
async function expectDashboardMsg(page: import('@playwright/test').Page, text: string) {
  await expect(page.locator('.gm-result')).toContainText(text, { timeout: 20_000 });
}

test.describe('Backup → reseed → restore', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('full disaster-recovery round-trip preserves seeded content', async ({
    page,
    seed,
    request,
  }) => {
    // --- 1. Seed our "original" state ---
    await seed({
      quest: [{
        id: 'e2e-backup-quest',
        title: 'E2E Backup Quest',
        status: 'active',
        priority: 'high',
        location: 'Sandpoint',
        giver: 'Mayor',
        description: 'Quest captured in the backup.',
      }],
      lore: [{
        id: 'e2e-backup-lore',
        title: 'E2E Backup Lore',
        category: 'Location',
        summary: 'Lore captured in the backup.',
        content: '',
        related: [],
        tags: [],
      }],
    });

    await page.goto('/gm');
    // Backup / reseed / restore live inside the collapsed "Maintenance" <details>.
    await page.locator('details.gm-dash-maintenance > summary').click();
    await expect(page.getByRole('button', { name: 'Download backup' })).toBeVisible();

    // --- 2. Capture backup download ---
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download backup' }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    await expectDashboardMsg(page, 'Backup downloaded.');

    // --- 3. Force reseed (overwrite) ---
    await page.getByRole('button', { name: 'Force reseed (overwrite)' }).click();
    await expect(page.locator('.modal-container')).toBeVisible();
    await page.getByLabel('confirm-input').fill('RESEED');
    await page.getByRole('button', { name: 'Reseed', exact: true }).click();
    await expectDashboardMsg(page, 'Done:');

    // Our seeded entries should be gone (replaced by bundled defaults)
    let payload = await fetchContent(request);
    expect(findInCollection(payload, 'quest', 'e2e-backup-quest')).toBeUndefined();
    expect(findInCollection(payload, 'lore', 'e2e-backup-lore')).toBeUndefined();

    // --- 4. Restore from the captured backup file ---
    // setInputFiles on the hidden <input type="file"> fires its onChange,
    // which opens the Restore ConfirmDialog. Bypasses the native file picker.
    await page.locator('[aria-label="restore-file"]').setInputFiles(downloadPath!);
    await expect(page.locator('.modal-container')).toBeVisible();
    await page.getByLabel('confirm-input').fill('RESTORE');
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expectDashboardMsg(page, 'Restored:');

    // Our originals are back, matching the seeded shape
    payload = await fetchContent(request);
    expect(findInCollection(payload, 'quest', 'e2e-backup-quest')).toMatchObject({
      id: 'e2e-backup-quest',
      title: 'E2E Backup Quest',
      status: 'active',
      priority: 'high',
    });
    expect(findInCollection(payload, 'lore', 'e2e-backup-lore')).toMatchObject({
      id: 'e2e-backup-lore',
      title: 'E2E Backup Lore',
      category: 'Location',
      summary: 'Lore captured in the backup.',
    });
  });
});
