/**
 * Player shop — Spellcasting Services: buy scrolls/wands (#942, part of the
 * #519 coverage-gaps epic). The generative #812 shop track lets a shop sell a
 * Scroll/Wand of ANY catalog spell up to an item-level cap via the compact
 * `{ spellItem:'scroll'|'wand', maxLevel, traditions?, rarities? }` ware;
 * `eligibleSpellItems` (src/utils/shopUtils.js) expands it on demand, priced
 * off the fixed rank tables in src/utils/spellItems.js (scroll r1=4gp/L1,
 * r2=12gp/L3; wand r1=60gp/L3).
 *
 * Covered here, complementing shop.spec.ts (plain-ware browse/cart/checkout)
 * and sale-shelf.spec.ts (pre-rolled shelf deals):
 *   - The Spells tab renders only when the shop authors a spell-item offering
 *     (`shopOffersSpellcasting`); a plain-ware shop shows no such tab.
 *   - Offering expansion: tradition intersection, common-only default rarity,
 *     item-level cap (scroll vs wand asymmetry), cantrip + focus exclusion.
 *   - Heightened ranks (#937): a `+N` spell groups one browse entry with a buy
 *     form per mechanically-distinct rank, named/priced off the table.
 *   - Preview card: full spell mechanics (description + heightening) and the
 *     base-item crest art inherited from the `magic-scroll` catalog item (#936).
 *   - Buy: checkout debits gold and lands minimal re-resolvable
 *     `{ scroll: { spellRef, rank? } }` entries on the acquired overlay; the
 *     inventory then shows the derived "Scroll of X (Rank N)" names.
 *   - An offering whose cap yields no sellable rank (wand maxLevel < 3) still
 *     shows the tab, with the empty-scribe notice.
 *
 * NOT covered (unit-owned or other specs' turf): the exact price-table math
 * beyond the seeded ranks, GM offering authoring (#944), the Runesmithing tab
 * (#943), auto-stocked catalysts (#1209 — Wares-tab surface), and the locked
 * "Spellcasting Services" hire-a-caster teaser (display-only).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectOnSheet, expectSheet, openPlayTab } from '../../helpers/sheet';

const CHAR_ID = 'e2e-scroll-buyer';
const CHAR_NAME = 'E2E Scroll Buyer';
const LOC_ID = 'e2e-loc-arcane-row';
const SHOP_ID = 'e2e-shop-scriptorium';

const BASE_CHAR = { id: CHAR_ID, name: CHAR_NAME, level: 3 };

const location = () => ({
  id: LOC_ID, title: 'Arcane Row', category: 'Location', summary: '', content: '',
  related: [], tags: [], visibility: 'revealed',
});
const shopLore = () => ({
  id: SHOP_ID, title: 'The Scriptorium', category: 'Location', summary: '', content: '',
  related: [], tags: [], parent: LOC_ID, visibility: 'revealed',
});

// The base Magic Scroll catalog item (#936): every generated "Scroll of X"
// inherits its crest art. A plain item — no scroll block — keyed by the fixed
// SPELL_ITEM_BASE_ID ('magic-scroll').
const SCROLL_BASE_ITEM = {
  id: 'magic-scroll', name: 'Magic Scroll', price: 0, level: 0,
  traits: ['Consumable', 'Magical', 'Scroll'], image: 'e2e-scroll-crest.png',
};

// Spell catalog exercising every eligibility filter at once.
const SPELLS = [
  // Eligible for scrolls (rank 1) AND wands (rank 1): arcane, common.
  { id: 'e2e-glimmer', name: 'E2E Glimmer', level: 1, traditions: ['arcane'], description: 'A mote of light dazzles one foe.' },
  // Eligible for scrolls only: rank 2 → scroll item level 3 (≤ cap 3), but a
  // rank-2 wand is item level 5 (> cap 3) — the scroll/wand asymmetry.
  { id: 'e2e-tide', name: 'E2E Tide', level: 2, traditions: ['arcane'], description: 'A wave crashes through the square.' },
  // Heightened (+1) rank-1 spell (#937): mechanically distinct at every rank;
  // the scroll cap (rank 2) keeps exactly two forms.
  {
    id: 'e2e-brine', name: 'E2E Brine Lash', level: 1, traditions: ['arcane', 'occult'],
    description: 'A lash of conjured brine scours the target.',
    heightened: { '+1': 'The damage increases by 1d8.' },
  },
  // Excluded: wrong tradition (offering filters to arcane/occult).
  { id: 'e2e-hymn', name: 'E2E Hymn', level: 1, traditions: ['divine'], description: 'A holy chord rings out.' },
  // Excluded: uncommon (a shop must opt in to non-common rarities).
  { id: 'e2e-shadowpact', name: 'E2E Shadowpact', level: 1, traditions: ['arcane'], traits: ['Uncommon'], description: 'A bargain struck in shadow.' },
  // Excluded: cantrip.
  { id: 'e2e-spark', name: 'E2E Spark', level: 1, traditions: ['arcane'], traits: ['Cantrip'], description: 'A harmless jolt.' },
  // Excluded: focus spell (no traditions ⇒ no scroll/wand pricing).
  { id: 'e2e-focusblast', name: 'E2E Focus Blast', level: 1, traditions: [], description: 'Inner power erupts.' },
  // Excluded: rank 3 → scroll item level 5, over the maxLevel 3 cap.
  { id: 'e2e-deepfreeze', name: 'E2E Deepfreeze', level: 3, traditions: ['arcane'], description: 'The air itself crystallizes.' },
];

async function waitForSheet(page: import('@playwright/test').Page) {
  await expectOnSheet(page, CHAR_ID);
  await expectSheet(page, CHAR_NAME);
}
async function openDowntimeShop(page: import('@playwright/test').Page) {
  await openPlayTab(page, 'Downtime');
  await page.getByRole('button', { name: /Shop/ }).click();
  await expect(page.getByTestId('shop-storefront')).toBeVisible();
}
const openSpellsTab = (page: import('@playwright/test').Page) =>
  page.getByRole('tab', { name: 'Spells' }).click();

test.describe('Player shop — Spellcasting Services', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [BASE_CHAR] });
  });

  test('a shop without a spell-item offering shows no Spells tab', async ({ page, seed }) => {
    await seed({
      lore: [location(), shopLore()],
      item: [{ id: 'e2e-antidote', name: 'E2E Antidote', price: 3, level: 1 }],
    });
    await mockSession(page, {
      seed: {
        cnmh_campaign_global: { location: 'Arcane Row', locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_shops_global: {
          [SHOP_ID]: { revealed: true, open: true, wares: [{ ref: 'e2e-antidote' }] },
        },
        [`cnmh_gold_${CHAR_ID}`]: 100,
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page);
    await openDowntimeShop(page);

    // The tab strip carries Wares but no Spells — the gate is the authored
    // offering (shopOffersSpellcasting), not the spell catalog.
    await expect(page.getByRole('tab', { name: 'Wares' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Spells' })).toHaveCount(0);
  });

  test('the offering expands to eligible scrolls/wands: tradition ∩, common-only, level cap, no cantrips/focus', async ({ page, seed }) => {
    await seed({
      lore: [location(), shopLore()],
      item: [SCROLL_BASE_ITEM],
      spell: SPELLS,
    });
    await mockSession(page, {
      seed: {
        cnmh_campaign_global: { location: 'Arcane Row', locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_shops_global: {
          [SHOP_ID]: {
            revealed: true,
            open: true,
            wares: [
              { spellItem: 'scroll', maxLevel: 3, traditions: ['arcane', 'occult'] },
              { spellItem: 'wand', maxLevel: 3, traditions: ['arcane', 'occult'] },
            ],
          },
        },
        [`cnmh_gold_${CHAR_ID}`]: 100,
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page);
    await openDowntimeShop(page);
    await openSpellsTab(page);

    // Eligible: Glimmer as scroll (r1 → 4 gp) and wand (r1 → 60 gp), Tide as
    // scroll only (r2 scroll = item level 3 ≤ cap; r2 wand = item level 5 > cap).
    const glimmerScroll = page.getByTestId('ware-scroll-of-e2e-glimmer');
    await expect(glimmerScroll).toBeVisible();
    await expect(glimmerScroll).toContainText('Scroll of E2E Glimmer');
    await expect(glimmerScroll).toContainText('4 gp');

    const glimmerWand = page.getByTestId('ware-wand-of-e2e-glimmer');
    await expect(glimmerWand).toBeVisible();
    await expect(glimmerWand).toContainText('Wand of E2E Glimmer');
    await expect(glimmerWand).toContainText('60 gp');

    await expect(page.getByTestId('ware-scroll-of-e2e-tide')).toBeVisible();
    await expect(page.getByTestId('ware-wand-of-e2e-tide')).toHaveCount(0);

    // Excluded across both kinds: tradition mismatch, uncommon (no opt-in),
    // cantrip, focus spell, over-cap rank.
    for (const id of ['e2e-hymn', 'e2e-shadowpact', 'e2e-spark', 'e2e-focusblast', 'e2e-deepfreeze']) {
      await expect(page.getByTestId(`ware-scroll-of-${id}`)).toHaveCount(0);
      await expect(page.getByTestId(`ware-wand-of-${id}`)).toHaveCount(0);
    }

    // The tab-local search narrows by spell name.
    await page.getByRole('textbox', { name: 'search scrolls and wands' }).fill('tide');
    await expect(page.getByTestId('ware-scroll-of-e2e-tide')).toBeVisible();
    await expect(page.getByTestId('ware-scroll-of-e2e-glimmer')).toHaveCount(0);
  });

  test('a heightened spell groups per-rank buy forms; checkout lands minimal spellRef entries and debits gold', async ({ page, seed }) => {
    await seed({
      lore: [location(), shopLore()],
      item: [SCROLL_BASE_ITEM],
      spell: SPELLS,
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_campaign_global: { location: 'Arcane Row', locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_shops_global: {
          [SHOP_ID]: {
            revealed: true,
            open: true,
            wares: [{ spellItem: 'scroll', maxLevel: 3, traditions: ['arcane', 'occult'] }],
          },
        },
        [`cnmh_gold_${CHAR_ID}`]: 100,
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page);
    await openDowntimeShop(page);
    await openSpellsTab(page);

    // One browse entry for the +1-heightened spell, two mechanically-distinct
    // rank forms inside the cap (rank 1 → 4 gp, rank 2 → item level 3, 12 gp).
    const brineTile = page.getByTestId('ware-scroll-of-e2e-brine');
    await expect(brineTile).toBeVisible();
    await expect(brineTile).toContainText('Scroll of E2E Brine Lash');
    await expect(brineTile).toContainText('from 4 gp');
    await expect(brineTile).toContainText('2 forms');

    await brineTile.click();
    const preview = page.getByTestId('ware-preview');
    await expect(preview).toBeVisible();
    // The preview shows the spell's own mechanics (#936 follow-up): the
    // description and the heightening entry the rank ladder derives from.
    await expect(preview).toContainText('A lash of conjured brine scours the target.');
    await expect(preview).toContainText('The damage increases by 1d8.');
    // Base-image inheritance (#936): the crest is the magic-scroll base art.
    await expect(preview.locator('img.ps-preview-img')).toHaveAttribute('src', '/api/images/e2e-scroll-crest.png');

    // Per-rank forms are labeled by derived item level and priced off the table.
    const rankOne = preview.locator('.ps-preview-form', { hasText: 'Lvl 1' });
    await expect(rankOne).toContainText('4 gp');
    const rankTwo = preview.locator('.ps-preview-form', { hasText: 'Lvl 3' });
    await expect(rankTwo).toContainText('12 gp');

    // Buy one of each rank.
    await preview.getByRole('button', { name: 'add Lvl 1' }).click();
    await preview.getByRole('button', { name: 'add Lvl 3' }).click();
    // Both rank forms are in the cart ("in cart ×1" replaces each Add button).
    await expect(preview.locator('.ps-preview-form-incart')).toHaveCount(2);

    // Back out of the takeover via its own Back button (#943: the app navbar
    // used to intercept this click; the overlay now portals above it) — it
    // overlays the cart bar, so it must close before that's reachable.
    await preview.getByRole('button', { name: 'Back' }).click();
    await expect(preview).toHaveCount(0);
    await page.getByTestId('cart-bar').click();

    const tray = page.getByTestId('cart-tray');
    await expect(tray).toContainText('Scroll of E2E Brine Lash');
    await expect(tray).toContainText('Scroll of E2E Brine Lash (Rank 2)');
    await expect(tray).toContainText('16 gp');

    await page.getByTestId('checkout').click();
    await expect(page.getByTestId('shop-toast')).toBeVisible();

    // Gold debited by the table total (4 + 12).
    const newGold = await session.expectSent(`cnmh_gold_${CHAR_ID}`, (v) => v === 84);
    expect(newGold).toBe(84);

    // The acquired overlay carries MINIMAL re-resolvable entries — the base rank
    // as a bare { spellRef }, the heightened rank with its rank override; the
    // browse-only spell block and wareKey never land (reuid strips them).
    const acquired = await session.expectSent(
      `cnmh_acquired_${CHAR_ID}`,
      (v) => Array.isArray(v) && v.length === 2,
    );
    const blocks = acquired.map((e: { scroll?: { spellRef?: string; rank?: number } }) => e.scroll);
    expect(blocks).toContainEqual({ spellRef: 'e2e-brine' });
    expect(blocks).toContainEqual({ spellRef: 'e2e-brine', rank: 2 });
    for (const entry of acquired) {
      expect(entry).not.toHaveProperty('spell');
      expect(entry).not.toHaveProperty('wareKey');
    }

    // Inventory re-resolves the minimal entries to their derived names. A
    // single shop here, so the header's Back chevron closes the storefront
    // directly (#943: no longer navbar-blocked).
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByTestId('shop-storefront')).toHaveCount(0);
    await openPlayTab(page, 'Inventory');
    await expect(page.getByText('Scroll of E2E Brine Lash (Rank 2)').first()).toBeVisible();
    await expect(page.getByText(/Scroll of E2E Brine Lash$/).first()).toBeVisible();
  });

  test('an offering below the wand minimum still shows the tab, with the empty-scribe notice', async ({ page, seed }) => {
    await seed({
      lore: [location(), shopLore()],
      spell: SPELLS,
    });
    await mockSession(page, {
      seed: {
        cnmh_campaign_global: { location: 'Arcane Row', locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_shops_global: {
          [SHOP_ID]: {
            revealed: true,
            open: true,
            // A rank-1 wand is item level 3, so maxLevel 2 yields NO wands —
            // but the authored offering alone gates the tab on.
            wares: [{ spellItem: 'wand', maxLevel: 2 }],
          },
        },
        [`cnmh_gold_${CHAR_ID}`]: 100,
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page);
    await openDowntimeShop(page);
    await openSpellsTab(page);

    await expect(page.getByText('The keeper scribes nothing to order right now.')).toBeVisible();
    await expect(page.locator('[data-testid^="ware-wand-of-"]')).toHaveCount(0);
  });
});
