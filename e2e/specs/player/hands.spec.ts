/**
 * Hand management (Items-segment HandsGroup + HandsGlance strip) + InventoryTab
 * flow on the player character sheet.
 *
 * Single test exercising the core Swap → Held → Drop loop:
 *  - Encounter tab: open the deck's Items segment, Swap the worn weapon into
 *    Hand 1 via the hand-setter, Confirm hands (one Interact)
 *  - Assert the at-a-glance strip shows the weapon in Hand 1
 *  - Inventory tab: the weapon shows in the Hands strip (Hand 1)
 *  - Open it → Release → it drops back into the Worn bag (Pick up offered)
 *
 * Runs on both desktop (chromium) and mobile (mobile-chromium) viewports
 * because the encounter surface layout differs between phone and desktop.
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

test.describe('Hand management + InventoryTab', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('Swap weapon into Hand 1, Confirm, then Drop', async ({ page, seed }) => {
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

    // The hands surfaces live on the encounter play tab, so put the sheet in
    // an active encounter via the mocked session (no Foundry / GM peer here).
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

    // --- Swap flow: deck Items segment → hand-setter → Confirm ---
    await page.getByRole('tab', { name: 'Items' }).click();
    await page.getByRole('button', { name: 'Swap E2E Longsword' }).click();
    // Hand-setter opens; place the longsword (both hands empty → Hand 1).
    await page.getByTestId(`hands-place-${LONGSWORD_UID}`).click();
    await page.getByTestId('hands-confirm').click();

    // The at-a-glance strip shows the longsword in Hand 1.
    await expect(page.getByTestId('hands-glance-slot-1')).toContainText('E2E Longsword');

    // --- Inventory tab: held indicator ---
    await page
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Inventory', exact: true })
      .click();
    // The held weapon now lives in the Hands strip (read-only in encounter), in
    // Hand 1 — not in the Worn bag.
    await expect(page.getByTestId('hands-strip-slot-1')).toContainText('E2E Longsword', {
      timeout: 10_000,
    });

    // --- Drop: loadout actions live in the ItemModal opened on tap ---
    await page.getByTestId(`hands-tile-${LONGSWORD_UID}`).click();
    // "Release" drops a held item.
    await page.getByTestId('item-action-release').click();

    // Released → dropped, so it falls back into the Worn bag; re-open offers Pick up.
    await page.getByTestId(`grid-cell-${LONGSWORD_UID}`).click();
    await expect(page.getByTestId('item-action-pickup')).toBeVisible({ timeout: 10_000 });
  });
});
