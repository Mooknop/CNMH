/**
 * Sale Shelf purchase loop (#1138, epic #1134). The GM-rolled Sale Shelf lands
 * as concrete wares on a shop entry (S1 engine); this spec drives the PLAYER
 * side end-to-end: browse the discounted goods, buy a runed item + a scroll
 * pack, and confirm gold is debited by the discounted total, the inventory
 * gains the runed weapon + four loose scrolls, and the one-of-a-kind deals are
 * struck from the shelf so a second browse can't buy them again.
 *
 * The shelf is seeded directly (a deterministic pre-rolled shelf) rather than
 * driven through the GM roll UI — the roll itself is unit-tested (S1/S2); this
 * spec owns the purchase-landing + decrement path (S4). The runed item uses
 * only fundamental runes (potency/striking), which are code-defined, so the
 * spec needs no rune content seeding.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectOnSheet } from '../../helpers/sheet';

const CHAR_ID = 'e2e-sale-shopper';
const CHAR_NAME = 'E2E Sale Shopper';
const LOC_ID = 'e2e-loc-forge-square';
const SHOP_ID = 'e2e-shop-forge';

const BASE_CHAR = { id: CHAR_ID, name: CHAR_NAME, level: 5 };

const location = () => ({
  id: LOC_ID, title: 'Forge Square', category: 'Location', summary: '', content: '',
  related: [], tags: [], visibility: 'revealed',
});
const shopLore = () => ({
  id: SHOP_ID, title: 'The Discount Forge', category: 'Location', summary: '', content: '',
  related: [], tags: [], parent: LOC_ID, visibility: 'revealed',
});

const RUNED_NAME = '+1 Striking E2E Longsword';
const PACK_NAME = 'Scroll Pack (Rank 1)';

async function waitForSheet(page: import('@playwright/test').Page) {
  await expectOnSheet(page, CHAR_ID);
  await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });
}
async function openDowntimeShop(page: import('@playwright/test').Page) {
  await page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Downtime', exact: true })
    .click();
  await page.getByRole('button', { name: /Shop/ }).click();
  await expect(page.getByTestId('shop-storefront')).toBeVisible();
}

test.describe('Sale Shelf purchase', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [BASE_CHAR] });
  });

  test('buys a runed item + scroll pack: debits the discounted total, lands them, and empties the shelf', async ({ page, seed }) => {
    await seed({
      lore: [location(), shopLore()],
      item: [
        { id: 'e2e-longsword', name: 'E2E Longsword', price: 15, level: 1, traits: ['Weapon'], strikes: { type: 'melee', damage: '1d8' } },
      ],
      spell: [
        { id: 'e2e-heal', name: 'E2E Heal', level: 1, traditions: ['divine', 'primal'] },
      ],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_campaign_global: { location: 'Forge Square', locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_shops_global: {
          [SHOP_ID]: {
            revealed: true,
            open: true,
            // The shelf sits alongside a rune-service + scroll offering (that's
            // where rolled goods come from).
            wares: [
              { runeService: true, targets: ['weapon'], maxLevel: 20 },
              { spellItem: 'scroll', maxLevel: 3 },
            ],
            saleShelf: [
              { sale: 'rune', saleId: 'w1', ref: 'e2e-longsword', runes: { potency: 1, striking: 'striking' }, fullPrice: 1000, price: 800 },
              { sale: 'scrollpack', saleId: 'p1', rank: 1, scrolls: [{ spellRef: 'e2e-heal' }, { spellRef: 'e2e-heal' }, { spellRef: 'e2e-heal' }, { spellRef: 'e2e-heal' }], fullPrice: 16, price: 12 },
            ],
          },
        },
        [`cnmh_gold_${CHAR_ID}`]: 2000,
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page);
    await openDowntimeShop(page);

    // Both sale wares show, badged, with the struck-through full price.
    const runedTile = page.getByTestId('ware-sale-w1');
    await expect(runedTile).toBeVisible();
    await expect(runedTile).toContainText(RUNED_NAME);
    await expect(runedTile).toContainText('Sale');
    await expect(runedTile).toContainText('800 gp');
    await expect(runedTile).toContainText('1000 gp');

    const packTile = page.getByTestId('ware-sale-p1');
    await expect(packTile).toContainText(PACK_NAME);
    await expect(packTile).toContainText('12 gp');

    // Buy both.
    await page.getByRole('button', { name: `add ${RUNED_NAME}` }).click();
    await page.getByRole('button', { name: `add ${PACK_NAME}` }).click();
    await page.getByTestId('cart-bar').click();
    const tray = page.getByTestId('cart-tray');
    await expect(tray).toContainText('812 gp'); // 800 + 12 discounted total
    await page.getByTestId('checkout').click();
    await expect(page.getByTestId('shop-toast')).toBeVisible();

    // Gold debited by the discounted total; the shelf is emptied of both deals.
    const newGold = await session.expectSent(`cnmh_gold_${CHAR_ID}`, (v) => v === 1188);
    expect(newGold).toBe(1188);
    await session.expectSent(
      'cnmh_shops_global',
      (v) => Array.isArray(v?.[SHOP_ID]?.saleShelf) && v[SHOP_ID].saleShelf.length === 0
    );

    // Second browse: the one-of-a-kind deals are gone from the shelf.
    await expect(page.getByTestId('ware-sale-w1')).toHaveCount(0);
    await expect(page.getByTestId('ware-sale-p1')).toHaveCount(0);

    // Inventory gained the runed weapon + the four loose scrolls. The grid shows
    // base names; the runed weapon lands as its base item (name "E2E Longsword")
    // and the pack as loose "Scroll of E2E Heal" entries.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shop-storefront')).toHaveCount(0);
    await page
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Inventory', exact: true })
      .click();
    const weaponCell = page.getByRole('button', { name: /E2E Longsword/ }).first();
    await expect(weaponCell).toBeVisible();
    await expect(page.getByText(/Scroll of E2E Heal/i).first()).toBeVisible();

    // Open the weapon: its detail derives the runed name, proving the runes
    // landed (the grid only shows the base name).
    await weaponCell.click();
    await expect(page.getByText(RUNED_NAME)).toBeVisible();
  });
});
