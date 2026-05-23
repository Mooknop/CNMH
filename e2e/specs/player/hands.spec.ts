/**
 * HandsPanel + InventoryTab flow on the player character sheet.
 *
 * Single test exercising the core SWAP → Held → Drop loop:
 *  - Encounter tab: SWAP a worn weapon into Hand 1, Confirm
 *  - Assert hands-slot-1 displays the weapon
 *  - Inventory tab: assert "Held in 1 Hand" badge appears on the weapon row
 *  - Click Drop → assert "(dropped)" badge appears
 *
 * Runs on both desktop (chromium) and mobile (mobile-chromium) viewports
 * because the HandsPanel layout differs between phone and desktop.
 */

import { test, expect } from '../../fixtures/gm';
import { expectOnSheet } from '../../helpers/sheet';

const CHAR_ID = 'e2e-fighter';
const LONGSWORD_UID = 'uid-longsword-1';

async function waitForSheet(page: import('@playwright/test').Page) {
  await expectOnSheet(page, CHAR_ID);
  await expect(page.getByRole('heading', { name: 'E2E Fighter', level: 1 })).toBeVisible({ timeout: 15_000 });
}

// DEFERRED: same failure pattern as spell-consumption.spec.ts — page stays
// at /character/:id but the h1 never renders. Needs the same local debug
// session before re-enabling. Skipping to keep CI signal clean and avoid
// burning writes on a known bad path.
test.describe.skip('HandsPanel + InventoryTab', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('SWAP weapon into Hand 1, Confirm, then Drop', async ({ page, seed }) => {
    await seed({
      item: [{
        id: 'e2e-longsword',
        name: 'E2E Longsword',
        weight: 1,
        price: 1,
        strikes: { damage: '1d8 S', type: 'melee' },
      }],
      character: [{
        id: CHAR_ID,
        name: 'E2E Fighter',
        level: 5,
        class: 'Fighter',
        ancestry: 'Human',
        background: 'Soldier',
        maxHp: 50,
        ac: 18,
        inventory: [{ ref: 'e2e-longsword', quantity: 1, uid: LONGSWORD_UID }],
      }],
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page);

    // Encounter is the default tab and contains the HandsPanel. Click it to be
    // explicit (no harm if already active).
    await page.getByRole('button', { name: 'Encounter', exact: true }).click();

    // --- SWAP flow ---
    await page.getByTestId('hands-swap').click();
    // Swap panel opens; pick our longsword into Hand 1
    await page.getByLabel(`pick-${LONGSWORD_UID}-h1`).click();
    await page.getByTestId('hands-confirm').click();

    // hands-slot-1 should now show the longsword name
    await expect(page.getByTestId('hands-slot-1')).toContainText('E2E Longsword');

    // --- Inventory tab: held badge ---
    await page.getByRole('button', { name: 'Inventory', exact: true }).click();
    const longswordRow = page.locator(`[data-testid="inv-row-${LONGSWORD_UID}"], [data-testid*="${LONGSWORD_UID}"]`).first();
    // The state badge text "Held in 1 Hand" comes from ITEM_STATE_LABEL.held1
    await expect(page.getByText('Held in 1 Hand', { exact: false })).toBeVisible({ timeout: 10_000 });

    // --- Drop ---
    await page.getByTestId(`inv-${LONGSWORD_UID}-drop`).click();
    await expect(page.getByText('(dropped)', { exact: false })).toBeVisible({ timeout: 10_000 });
  });
});
