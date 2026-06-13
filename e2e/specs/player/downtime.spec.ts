/**
 * Downtime — GM-granted day budget surfaced to the player (#323, part of #295).
 * The GM starts a downtime period (cnmh_downtimeblock_global); in downtime mode
 * the player's sheet shows the budget + activity surface. Seeded via mockSession
 * (#293). The activity pick + multi-step commit flow is deferred to the downtime
 * follow-up.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';

test.describe('Downtime', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
  });

  test('GM-granted day budget shows on the player downtime tab', async ({ page }) => {
    await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'downtime',
        cnmh_downtimeblock_global: { active: true, days: 3, startedAt: 1 },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });

    // Open the mode-aware play tab (Downtime).
    await page
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Downtime', exact: true })
      .click();

    await expect(page.getByText('3 days available')).toBeVisible();
  });
});
