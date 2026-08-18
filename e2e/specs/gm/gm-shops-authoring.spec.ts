/**
 * GM Shops authoring — declare, stock, spell/rune offerings (#944, part of the
 * #519 coverage-gaps epic). Zero E2E existed for the GmShops authoring surface
 * (epic #822 Find→Declare→Stock, #819/#884 spell-item offerings, #982 G2 rune
 * offerings) before this file.
 *
 * The page is `/gm/world/shops`: a Command finder (search any Location lore
 * entry, quick-chips for existing shops) ⇄ a per-location Workspace (declare via
 * "Set up as shop", meta toggles, catalog→shelf stocking, generative offering
 * sections, one "Save & publish" writer). Everything persists in the synced
 * `cnmh_shops_global` store via useShops — app-managed state, NOT vault content
 * — so specs assert the store through `mockSession.expectSent` and exercise
 * round-trips by leaving and re-entering the workspace within the SPA session
 * (the mock relay replays only its seed on reconnect, so no full-page reloads
 * after a save).
 *
 * Surface drift from the issue text (#944 predates the #884 unification):
 *  - `offering-summary-*` testids are gone; the live coverage summaries are
 *    `spell-summary-<scroll|wand>` and `rune-summary` today.
 *  - Scrolls and wands share ONE by-tradition config (#884), not a row per kind.
 *  - Rune targets now include `shield` alongside weapon/armor/ring/accessory.
 *
 * Desktop-only: GM Tools has no responsive layout.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectOnSheet, expectSheet, openPlayTab } from '../../helpers/sheet';

const LOC_ID = 'e2e-loc-brackwater';
const LOC_TITLE = 'E2E Brackwater Market';

const location = (overrides: Record<string, unknown> = {}) => ({
  id: LOC_ID,
  title: LOC_TITLE,
  category: 'Location',
  summary: '',
  content: '',
  related: [],
  tags: [],
  visibility: 'revealed',
  ...overrides,
});

const LANTERN = { id: 'e2e-lantern', name: 'E2E Lantern', price: 12, level: 1, traits: ['Adventuring Gear'] };
const TONIC = {
  id: 'e2e-tonic',
  name: 'E2E Tonic',
  price: 4,
  level: 1,
  traits: ['Consumable'],
  variants: [
    { level: 1, label: 'Minor', name: 'Minor E2E Tonic', price: 4 },
    { level: 3, label: 'Lesser', name: 'Lesser E2E Tonic', price: 12 },
  ],
};
const RUNE = {
  id: 'e2e-keenedge',
  name: 'E2E Keenedge',
  type: 'property',
  target: 'weapon',
  level: 8,
  price: 500,
  description: 'E2E-only weapon property rune.',
};

// A shop entry as saved: shape helpers to keep matchers readable. `value` in
// expectSent is the WHOLE cnmh_shops_global map, keyed by lore id.
type ShopsMap = Record<string, { keeper?: string; open?: boolean; revealed?: boolean; wares?: unknown[] }>;
const entryOf = (v: unknown, loreId = LOC_ID) => (v as ShopsMap | null | undefined)?.[loreId];

// Find the location in the Command finder and open its workspace.
async function openWorkspace(page: import('@playwright/test').Page, title = LOC_TITLE, loreId = LOC_ID) {
  await page.getByLabel('location search').fill(title.replace(/^E2E /, ''));
  await page.getByRole('option', { name: title }).click();
  await expect(page.getByTestId(`shop-workspace-${loreId}`)).toBeVisible();
}

// Reopen an existing shop via its "Your shops" quick-chip.
async function reopenViaQuickChip(page: import('@playwright/test').Page, title = LOC_TITLE, loreId = LOC_ID) {
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByLabel('location search')).toBeVisible();
  await page.getByRole('button', { name: title }).click();
  await expect(page.getByTestId(`shop-workspace-${loreId}`)).toBeVisible();
}

async function saveAndPublish(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Save & publish' }).click();
  await expect(page.getByText('Saved — live for players')).toBeVisible();
}

const segButton = (page: import('@playwright/test').Page, group: string, label: string) =>
  page.getByRole('group', { name: group }).getByRole('button', { name: label, exact: true });

test.describe('GM Shops authoring', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  // ---------------------------------------------------------------------------
  // Find → Declare: locate a Location, "Set up as shop", meta (keeper /
  // revealed / open), and the meta round-trip on reopen.
  // ---------------------------------------------------------------------------

  test('declare a shop, set keeper + revealed/closed, reopen shows the same meta', async ({ page, seed }) => {
    await seed({ lore: [location()] });
    const session = await mockSession(page, { seed: {} });

    await page.goto('/gm/world/shops');
    await expect(page.getByLabel('location search')).toBeVisible();
    // No shops yet — the quick-chip row says so.
    await expect(page.getByText('No shops yet — search above to set the first one up.')).toBeVisible();

    await openWorkspace(page);
    await expect(page.getByTestId(`shop-workspace-${LOC_ID}`)).toContainText('Not a shop');
    await expect(page.getByTestId('shop-setup')).toBeVisible();

    // Declaring commits immediately (no Save needed): the entry's presence is
    // what makes the location a shop.
    await page.getByRole('button', { name: 'Set up as shop' }).click();
    const declared = await session.expectSent('cnmh_shops_global', (v) => !!entryOf(v));
    expect(entryOf(declared)).toEqual({ keeper: '', open: true, revealed: false, wares: [] });
    await expect(page.getByTestId(`shop-workspace-${LOC_ID}`)).toContainText('Shop');

    // Meta: keeper line + Revealed + Closed, then Save & publish.
    const KEEPER = 'Old Marta — trinkets and gossip.';
    await page.getByLabel('keeper').fill(KEEPER);
    await segButton(page, 'Players can see it', 'Revealed').click();
    await segButton(page, 'Trading', 'Closed').click();
    await saveAndPublish(page);

    const saved = await session.expectSent('cnmh_shops_global', (v) => entryOf(v)?.keeper === KEEPER);
    expect(entryOf(saved)).toEqual({
      keeper: KEEPER,
      open: false,
      revealed: true,
      offersSpellcasting: false,
      offersRunes: false,
      wares: [],
    });

    // Round-trip: back to the finder (the shop now has a quick-chip), reopen,
    // and the workspace re-derives the same meta from the store.
    await reopenViaQuickChip(page);
    await expect(page.getByLabel('keeper')).toHaveValue(KEEPER);
    await expect(segButton(page, 'Players can see it', 'Revealed')).toHaveAttribute('aria-pressed', 'true');
    await expect(segButton(page, 'Trading', 'Closed')).toHaveAttribute('aria-pressed', 'true');
  });

  // ---------------------------------------------------------------------------
  // Stock wares: flat item, multi-variant item (one row, per-form price/stock),
  // and a runestone; price/stock overrides; exact stored shapes; shelf
  // round-trip on reopen.
  // ---------------------------------------------------------------------------

  test('stock flat + multi-variant + runestone wares with overrides; rows round-trip', async ({ page, seed }) => {
    await seed({ lore: [location()], item: [LANTERN, TONIC], rune: [RUNE] });
    const session = await mockSession(page, {
      seed: {
        cnmh_shops_global: { [LOC_ID]: { keeper: '', open: true, revealed: true, wares: [] } },
      },
    });

    await page.goto('/gm/world/shops');
    await openWorkspace(page);

    // Catalog → shelf: search narrows the unified catalog (items + runestones).
    await page.getByLabel('catalog search').fill('E2E');
    await page.getByTestId('cat-e2e-lantern').click();
    await page.getByTestId('cat-e2e-tonic').click();
    await page.getByTestId('cat-runestone@e2e-keenedge').click();

    // A shelved card goes "In shop" and can't be added twice.
    await expect(page.getByTestId('cat-e2e-lantern')).toBeDisabled();
    await expect(page.getByTestId('cat-e2e-lantern')).toContainText('In shop');

    // Flat item: price + stock overrides.
    await page.getByLabel('price-e2e-lantern').fill('10');
    await page.getByLabel('stock-e2e-lantern').fill('2');

    // Multi-variant item (#889): one row, first variant pre-selected; opt into
    // the second and give it a price override (the first stays catalog-priced).
    await expect(page.getByLabel('variant-e2e-tonic@1')).toBeChecked();
    await page.getByLabel('variant-e2e-tonic@3').check();
    await page.getByLabel('price-e2e-tonic@3').fill('10');

    await saveAndPublish(page);
    const saved = await session.expectSent(
      'cnmh_shops_global',
      (v) => (entryOf(v)?.wares || []).length === 4,
    );
    // Exact stored shapes: blanks fall back (omitted), a variant row expands to
    // one { ref, level } ware per selected form, a runestone keeps its runeRef.
    expect(entryOf(saved)?.wares).toEqual([
      { ref: 'e2e-lantern', price: 10, stock: 2 },
      { ref: 'e2e-tonic', level: 1 },
      { ref: 'e2e-tonic', level: 3, price: 10 },
      { ref: 'runestone', runeRef: 'e2e-keenedge' },
    ]);

    // Round-trip: reopen re-derives the same rows and values from the store.
    await reopenViaQuickChip(page);
    await expect(page.getByRole('list', { name: 'wares' }).getByRole('listitem')).toHaveCount(3);
    await expect(page.getByLabel('price-e2e-lantern')).toHaveValue('10');
    await expect(page.getByLabel('stock-e2e-lantern')).toHaveValue('2');
    await expect(page.getByLabel('variant-e2e-tonic@1')).toBeChecked();
    await expect(page.getByLabel('variant-e2e-tonic@3')).toBeChecked();
    await expect(page.getByLabel('price-e2e-tonic@3')).toHaveValue('10');
    await expect(page.getByLabel('catalog search')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Spell-item offerings (#819/#884): one config for scrolls + wands, live
  // coverage summaries, filters stored explicitly, defaults OMITTED on save.
  // ---------------------------------------------------------------------------

  test('spellcasting services store filters explicitly and omit defaults', async ({ page, seed }) => {
    await seed({ lore: [location()] });
    const session = await mockSession(page, {
      seed: {
        cnmh_shops_global: { [LOC_ID]: { keeper: '', open: true, revealed: true, wares: [] } },
      },
    });

    await page.goto('/gm/world/shops');
    await openWorkspace(page);

    const offers = page.getByTestId('shop-offerings');
    await expect(offers).toContainText('Not selling scrolls or wands');

    // Enable both kinds; each gets its own live coverage summary.
    await page.getByLabel('spell-kind-scroll').click();
    await page.getByLabel('spell-kind-wand').click();
    await expect(page.getByTestId('spell-summary-scroll')).toContainText('Scrolls · all traditions · common');
    await expect(page.getByTestId('spell-summary-wand')).toContainText('Wands · all traditions · common');

    // Non-default filters: max item level, one tradition, uncommon-only, price ×1.5.
    await page.getByLabel('spell-maxlevel').fill('5');
    await page.getByLabel('spell-trad-arcane').click();
    await page.getByLabel('spell-rarity-uncommon').click();
    await page.getByLabel('spell-pricemod').fill('1.5');
    await expect(page.getByTestId('spell-summary-scroll')).toContainText(
      'Scrolls · arcane · uncommon · up to item level 5',
    );

    await saveAndPublish(page);
    const saved = await session.expectSent(
      'cnmh_shops_global',
      (v) => (entryOf(v)?.wares || []).length === 2,
    );
    expect(entryOf(saved)?.wares).toEqual([
      { spellItem: 'scroll', maxLevel: 5, traditions: ['arcane'], rarities: ['uncommon'], priceMod: 1.5 },
      { spellItem: 'wand', maxLevel: 5, traditions: ['arcane'], rarities: ['uncommon'], priceMod: 1.5 },
    ]);

    // Back to defaults: all-traditions / common-only / no priceMod are OMITTED
    // from the stored spec so it stays clean and round-trips.
    await page.getByLabel('spell-trad-arcane').click();
    await page.getByLabel('spell-rarity-uncommon').click();
    await page.getByLabel('spell-pricemod').fill('');
    await page.getByLabel('spell-maxlevel').fill('3');
    await saveAndPublish(page);
    const defaults = await session.expectSent(
      'cnmh_shops_global',
      (v) => (entryOf(v)?.wares || []).some((w) => (w as { maxLevel?: number }).maxLevel === 3),
    );
    expect(entryOf(defaults)?.wares).toEqual([
      { spellItem: 'scroll', maxLevel: 3 },
      { spellItem: 'wand', maxLevel: 3 },
    ]);

    // Round-trip: reopen re-derives the unified config from the stored wares.
    await reopenViaQuickChip(page);
    await expect(page.getByLabel('spell-kind-scroll')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('spell-kind-wand')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('spell-maxlevel')).toHaveValue('3');
    await expect(page.getByLabel('spell-trad-arcane')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByLabel('spell-rarity-uncommon')).toHaveAttribute('aria-pressed', 'false');
  });

  // ---------------------------------------------------------------------------
  // Rune offerings (#982 G2): targets + per-target level caps + rarities, live
  // summary, exact stored ware, and the editor round-trip.
  // ---------------------------------------------------------------------------

  test('runesmithing services store targets, per-target caps, and rarities', async ({ page, seed }) => {
    await seed({ lore: [location()], rune: [RUNE] });
    const session = await mockSession(page, {
      seed: {
        cnmh_shops_global: { [LOC_ID]: { keeper: '', open: true, revealed: true, wares: [] } },
      },
    });

    await page.goto('/gm/world/shops');
    await openWorkspace(page);

    const runeOffers = page.getByTestId('rune-offerings');
    await expect(runeOffers).toContainText('Not selling runes');

    // Two targets with DIFFERENT caps (stores as a per-target maxLevel object),
    // plus an uncommon-only rarity filter.
    await page.getByLabel('rune-target-weapon').click();
    await page.getByLabel('rune-maxlevel-weapon').fill('8');
    await page.getByLabel('rune-target-armor').click();
    await page.getByLabel('rune-maxlevel-armor').fill('4');
    await expect(page.getByTestId('rune-summary')).toContainText('Runes · weapon/armor · common');
    await expect(page.getByTestId('rune-summary')).toContainText('weapon ≤8, armor ≤4');

    await page.getByLabel('rune-rarity-uncommon').click();
    await expect(page.getByTestId('rune-summary')).toContainText('· uncommon ·');

    await saveAndPublish(page);
    const saved = await session.expectSent(
      'cnmh_shops_global',
      (v) => (entryOf(v)?.wares || []).length === 1,
    );
    expect(entryOf(saved)?.wares).toEqual([
      {
        runeService: true,
        targets: ['weapon', 'armor'],
        maxLevel: { weapon: 8, armor: 4 },
        rarities: ['uncommon'],
      },
    ]);

    // Round-trip: reopen re-derives targets, caps, and rarities.
    await reopenViaQuickChip(page);
    await expect(page.getByLabel('rune-target-weapon')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('rune-target-armor')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('rune-target-ring')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByLabel('rune-maxlevel-weapon')).toHaveValue('8');
    await expect(page.getByLabel('rune-maxlevel-armor')).toHaveValue('4');
    await expect(page.getByLabel('rune-rarity-uncommon')).toHaveAttribute('aria-pressed', 'true');
  });

  // ---------------------------------------------------------------------------
  // The GM-authored shop is what a player session sees: author + publish on the
  // GM page, then seed a player session with exactly the published store and
  // assert the storefront shows the authored ware at the authored price.
  // ---------------------------------------------------------------------------

  test('a player session sees the published shop with the authored wares', async ({ page, context, seed }) => {
    const CHAR_ID = 'e2e-shop-author-buyer';
    const CHAR_NAME = 'E2E Author Buyer';
    const SHOP_ID = 'e2e-shop-drum';
    const SHOP_TITLE = 'E2E Mended Drum';

    // The player storefront model: the SHOP is a lore entry that is a
    // parent-child of the party's current Location, both revealed.
    await seed({
      lore: [location(), location({ id: SHOP_ID, title: SHOP_TITLE, parent: LOC_ID })],
      item: [LANTERN],
      character: [{ id: CHAR_ID, name: CHAR_NAME, level: 3 }],
    });

    const gmSession = await mockSession(page, { seed: {} });
    await page.goto('/gm/world/shops');
    await openWorkspace(page, SHOP_TITLE, SHOP_ID);

    await page.getByRole('button', { name: 'Set up as shop' }).click();
    await segButton(page, 'Players can see it', 'Revealed').click();
    await page.getByLabel('catalog search').fill('Lantern');
    await page.getByTestId('cat-e2e-lantern').click();
    await page.getByLabel('price-e2e-lantern').fill('10');
    await saveAndPublish(page);

    const published = await gmSession.expectSent(
      'cnmh_shops_global',
      (v) => entryOf(v, SHOP_ID)?.revealed === true && (entryOf(v, SHOP_ID)?.wares || []).length === 1,
    );

    // A player session hydrated with the published store (the mock relay plays
    // the DO: what the GM sent is what every other peer receives on connect).
    const playerPage = await context.newPage();
    await mockSession(playerPage, {
      seed: {
        cnmh_campaign_global: { location: LOC_TITLE, locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_shops_global: published,
        [`cnmh_gold_${CHAR_ID}`]: 50,
      },
    });

    await playerPage.goto(`/character/${CHAR_ID}`);
    await expectOnSheet(playerPage, CHAR_ID);
    await expectSheet(playerPage, CHAR_NAME);
    await openPlayTab(playerPage, 'Downtime');
    await playerPage.getByRole('button', { name: /Shop/ }).click();
    await expect(playerPage.getByTestId('shop-storefront')).toBeVisible();

    await expect(playerPage.getByTestId('ware-e2e-lantern')).toBeVisible();
    await expect(playerPage.getByTestId('ware-e2e-lantern')).toContainText('10 gp');

    await playerPage.close();
  });
});
