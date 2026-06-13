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
import { mockSession } from '../../fixtures/session';
import { activeEncounter } from '../../helpers/encounter';

const CHAR_ID = 'e2e-fighter';
const LONGSWORD_UID = 'uid-longsword-1';

async function waitForSheet(page: import('@playwright/test').Page) {
  await expectOnSheet(page, CHAR_ID);
  await expect(page.getByRole('heading', { name: 'E2E Fighter', level: 1 })).toBeVisible({ timeout: 15_000 });
}

test.describe('HandsPanel + InventoryTab', () => {
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

    // HandsPanel lives in the encounter surface, so put the sheet in an active
    // encounter via the mocked session (no Foundry / GM peer in an E2E run).
    await mockSession(page, {
      seed: { cnmh_encounter_global: activeEncounter(CHAR_ID, 'E2E Fighter') },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page);

    // Default tab is Stats; switch to the mode-aware play tab (Encounter).
    await page
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Encounter', exact: true })
      .click();

    // --- SWAP flow ---
    await page.getByTestId('hands-swap').click();
    // Swap panel opens; pick our longsword into Hand 1
    await page.getByLabel(`pick-${LONGSWORD_UID}-h1`).click();
    await page.getByTestId('hands-confirm').click();

    // hands-slot-1 should now show the longsword name
    await expect(page.getByTestId('hands-slot-1')).toContainText('E2E Longsword');

    // --- Inventory tab: held indicator ---
    await page
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Inventory', exact: true })
      .click();
    // Held items show a ✊ indicator labelled from ITEM_STATE_LABEL.held1.
    await expect(page.getByRole('img', { name: 'Held in 1 Hand' })).toBeVisible({ timeout: 10_000 });

    // --- Drop: loadout actions live in the ItemModal opened on tap ---
    await page.getByTestId(`item-card-${LONGSWORD_UID}`).click();
    // "Release" drops a held item.
    await page.getByTestId('item-action-release').click();

    // Re-open the item: it's now dropped, so only "Pick up" is offered.
    await page.getByTestId(`item-card-${LONGSWORD_UID}`).click();
    await expect(page.getByTestId('item-action-pickup')).toBeVisible({ timeout: 10_000 });
  });
});
