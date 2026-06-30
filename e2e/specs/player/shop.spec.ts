/**
 * Player shop storefront — browse, cart, checkout (#941, part of the #519
 * coverage-gaps epic). Zero E2E existed for the ShopStorefront browse→buy
 * loop (epics #696 / #857) before this file.
 *
 * The storefront is reached two ways:
 *   - In town: Character sheet → Downtime tab → "Shop" button
 *     (`DowntimeTab`, shops = revealed+wares children of the party's current
 *     location, `cnmh_campaign_global.locationLoreId`).
 *   - Read-only: Dashboard → Location chip → lore drawer → a non-current
 *     location's "Shops" button (`LoreDrawer`, `readOnly` when the viewed
 *     entry isn't the party's current location).
 *
 * A shop is a lore entry that is a `parent`-child of a Location entry, with a
 * matching `cnmh_shops_global[loreId]` entry; both the location and the shop
 * lore entries need `visibility: 'revealed'` to be player-visible at all.
 * Checkout (`useShopCheckout`) debits `cnmh_gold_<charId>` and credits
 * `cnmh_acquired_<charId>` in one transaction.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectOnSheet } from '../../helpers/sheet';

const CHAR_ID = 'e2e-shopper';
const CHAR_NAME = 'E2E Shopper';
const LOC_ID = 'e2e-loc-townsquare';

const BASE_CHAR = { id: CHAR_ID, name: CHAR_NAME, level: 3 };

const location = (overrides = {}) => ({
  id: LOC_ID,
  title: 'Townsquare',
  category: 'Location',
  summary: '',
  content: '',
  related: [],
  tags: [],
  visibility: 'revealed',
  ...overrides,
});

const shopLore = (id: string, title: string, parent = LOC_ID) => ({
  id,
  title,
  category: 'Location',
  summary: '',
  content: '',
  related: [],
  tags: [],
  parent,
  visibility: 'revealed',
});

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

test.describe('Player shop storefront', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [BASE_CHAR] });
  });

  test('wares tab renders grouped wares with a multi-variant headline + per-form rows', async ({ page, seed }) => {
    await seed({
      lore: [location(), shopLore('e2e-shop-main', 'Mended Drum')],
      item: [
        { id: 'e2e-antidote', name: 'E2E Antidote', price: 3, level: 1, traits: ['Consumable'] },
        {
          id: 'e2e-tonic',
          name: 'E2E Tonic',
          price: 4,
          level: 1,
          traits: ['Consumable'],
          variants: [
            { level: 1, label: 'Minor', name: 'Minor E2E Tonic', price: 4 },
            { level: 3, label: 'Lesser', name: 'Lesser E2E Tonic', price: 12 },
          ],
        },
      ],
    });
    await mockSession(page, {
      seed: {
        cnmh_campaign_global: { location: 'Townsquare', locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_shops_global: {
          'e2e-shop-main': {
            revealed: true,
            open: true,
            wares: [
              { ref: 'e2e-antidote' },
              { ref: 'e2e-tonic', level: 1 },
              { ref: 'e2e-tonic', level: 3 },
            ],
          },
        },
        [`cnmh_gold_${CHAR_ID}`]: 100,
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page);
    await openDowntimeShop(page);

    await expect(page.getByTestId('ware-e2e-antidote')).toBeVisible();
    await expect(page.getByTestId('ware-e2e-antidote')).toContainText('3 gp');

    const tonicTile = page.getByTestId('ware-e2e-tonic');
    await expect(tonicTile).toBeVisible();
    await expect(tonicTile).toContainText('from 4 gp');
    await expect(tonicTile).toContainText('2 forms');

    await tonicTile.click();
    const preview = page.getByTestId('ware-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('Minor');
    await expect(preview).toContainText('Lesser');
    await expect(preview.getByRole('button', { name: 'add Minor' })).toBeVisible();
    await expect(preview.getByRole('button', { name: 'add Lesser' })).toBeVisible();
  });

  test('hidden and empty shops are excluded from the location list; a closed shop shows a closed notice', async ({ page, seed }) => {
    await seed({
      lore: [
        location(),
        shopLore('e2e-shop-open', 'Open Stall'),
        shopLore('e2e-shop-hidden', 'Hidden Stall'),
        shopLore('e2e-shop-empty', 'Empty Stall'),
      ],
      item: [{ id: 'e2e-antidote', name: 'E2E Antidote', price: 3, level: 1 }],
    });
    await mockSession(page, {
      seed: {
        cnmh_campaign_global: { location: 'Townsquare', locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_shops_global: {
          'e2e-shop-open': { revealed: true, open: false, wares: [{ ref: 'e2e-antidote' }] },
          'e2e-shop-hidden': { revealed: false, open: true, wares: [{ ref: 'e2e-antidote' }] },
          'e2e-shop-empty': { revealed: true, open: true, wares: [] },
        },
        [`cnmh_gold_${CHAR_ID}`]: 100,
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page);
    await page
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Downtime', exact: true })
      .click();

    // Only the open (but closed-for-trading) shop counts — hidden and
    // zero-ware shops never register as a shop at all (isShop/isShopRevealed).
    await expect(page.getByRole('button', { name: /Shop/ })).toContainText('1');
    await page.getByRole('button', { name: /Shop/ }).click();

    await expect(page.getByTestId('shop-closed')).toBeVisible();
    await expect(page.getByTestId('shop-closed')).toContainText('trading right now');
    await expect(page.getByTestId('cart-bar')).toHaveCount(0);
  });

  test('cart → checkout debits gold and lands the item in the buyer\'s inventory; a stock cap disables Add', async ({ page, seed }) => {
    await seed({
      lore: [location(), shopLore('e2e-shop-main', 'Mended Drum')],
      item: [{ id: 'e2e-antidote', name: 'E2E Antidote', price: 3, level: 1 }],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_campaign_global: { location: 'Townsquare', locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_shops_global: {
          'e2e-shop-main': { revealed: true, open: true, wares: [{ ref: 'e2e-antidote', stock: 1 }] },
        },
        [`cnmh_gold_${CHAR_ID}`]: 50,
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page);
    await openDowntimeShop(page);

    // Tap-add the single-form tile.
    await page.getByRole('button', { name: 'add E2E Antidote' }).click();
    await expect(page.getByTestId('incart-e2e-antidote')).toContainText('×1');
    // Stock cap of 1 means no further quick-add control remains.
    await expect(page.getByRole('button', { name: 'add E2E Antidote' })).toHaveCount(0);

    await page.getByTestId('cart-bar').click();
    const tray = page.getByTestId('cart-tray');
    await expect(tray).toContainText('3 gp');
    await expect(tray.getByRole('button', { name: 'increase E2E Antidote' })).toBeDisabled();

    await page.getByTestId('checkout').click();
    await expect(page.getByTestId('shop-toast')).toBeVisible();

    const newGold = await session.expectSent(`cnmh_gold_${CHAR_ID}`, (v) => v === 47);
    expect(newGold).toBe(47);

    // Checkout closes the cart tray but not the storefront overlay itself —
    // back out (Escape) so the bottom rail's Inventory tab is clickable again.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shop-storefront')).toHaveCount(0);
    await page
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Inventory', exact: true })
      .click();
    await expect(page.getByText('E2E Antidote')).toBeVisible();
  });

  test('an over-budget cart blocks checkout', async ({ page, seed }) => {
    await seed({
      lore: [location(), shopLore('e2e-shop-main', 'Mended Drum')],
      item: [{ id: 'e2e-pricey', name: 'E2E Pricey Relic', price: 25, level: 5 }],
    });
    await mockSession(page, {
      seed: {
        cnmh_campaign_global: { location: 'Townsquare', locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_shops_global: {
          'e2e-shop-main': { revealed: true, open: true, wares: [{ ref: 'e2e-pricey' }] },
        },
        [`cnmh_gold_${CHAR_ID}`]: 10,
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page);
    await openDowntimeShop(page);

    await page.getByRole('button', { name: 'add E2E Pricey Relic' }).click();
    await page.getByTestId('cart-bar').click();

    const checkout = page.getByTestId('checkout');
    await expect(checkout).toBeDisabled();
    await expect(checkout).toContainText('Need');
  });

  test('a non-current location\'s shop opens read-only from the lore drawer', async ({ page, seed }) => {
    const LOC_B = 'e2e-loc-faraway';
    await seed({
      lore: [
        location(),
        { ...location({ id: LOC_B, title: 'Faraway Village' }), parent: LOC_ID },
        shopLore('e2e-shop-faraway', 'Faraway Stall', LOC_B),
      ],
      item: [{ id: 'e2e-antidote', name: 'E2E Antidote', price: 3, level: 1 }],
    });
    await mockSession(page, {
      seed: {
        // Party is at LOC_ID — LOC_B is a place they're merely recalling.
        cnmh_campaign_global: { location: 'Townsquare', locationLoreId: LOC_ID },
        cnmh_shops_global: {
          'e2e-shop-faraway': { revealed: true, open: true, wares: [{ ref: 'e2e-antidote' }] },
        },
      },
    });

    await page.goto('/');
    await page.getByRole('button', { name: /Location/ }).click();
    await expect(page.getByRole('heading', { name: 'Townsquare' })).toBeVisible();
    await page.getByRole('button', { name: 'Faraway Village' }).click();
    await expect(page.getByRole('heading', { name: 'Faraway Village' })).toBeVisible();

    await expect(page.getByTestId('lore-shops-button')).toContainText('1');
    await page.getByTestId('lore-shops-button').click();
    await expect(page.getByTestId('shop-storefront')).toBeVisible();
    await expect(page.getByTestId('ps-lore-banner')).toBeVisible();
    await expect(page.getByTestId('cart-bar')).toHaveCount(0);

    await page.getByTestId('ware-e2e-antidote').click();
    await expect(page.getByTestId('ware-preview')).toContainText('Recalled from a lore entry — not here to buy.');
  });
});
