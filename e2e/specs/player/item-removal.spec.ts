/**
 * The item-removal overlay — `cnmh_removed_<charId>` (#1656, epic #1589).
 *
 * Authored inventory is immutable from the client, so "this character no longer
 * has that item" is expressed as a separate ledger of entry uids. `useCharacter`
 * subtracts it (`applyRemovedOverlay`) from `authored + acquired` BEFORE the
 * loadout layer runs, so the overlay is what makes the authored doc
 * non-authoritative. Seven non-test writers feed it — `ItemModal`,
 * `GmGearModal`, `AugmentGearProjects`, `useGiveItem`, `useShopCheckout`,
 * `useMoveRune`, `useRuneWork` — and nothing guarded the ledger itself.
 *
 * This file owns the LEDGER, not the seven flows. Per #1656's de-dupe section
 * #945 owns PC→PC gifting, #941 / `sale-shelf.spec.ts` own checkout and selling,
 * and #943 / #1050 own rune sockets and rune work. Where a removal has to be
 * *reached* rather than seeded, the cheapest vehicle is used and only the
 * overlay is asserted:
 *   - ItemModal's "Give to" (the `useGiveItem` path) for the player-side write;
 *   - GM Manage Gear's augmentation apply (the `GmGearModal` path) for the GM
 *     twin — its `applyGearEntry` mints a fresh-uid copy onto `acquired` and
 *     masks the original via `removed`, so the ledger is the ONLY reason the
 *     player doesn't end up holding two.
 *
 * Runs on both chromium and mobile-chromium (player surface). The one exception
 * is the GM-twin test, which drives GM Tools — desktop-only by design — and
 * skips itself on the phone project.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectMyTurnLive, expectOnSheet, expectSheet, openPlayTab } from '../../helpers/sheet';
import { activeEncounter, deckBody, readyTurnState } from '../../helpers/encounter';

const CHAR_ID = 'e2e-ledger-keeper';
const CHAR_NAME = 'E2E Ledger Keeper';
const FRIEND_ID = 'e2e-ledger-friend';
const FRIEND_NAME = 'E2E Ledger Friend';

// Two entries of the SAME catalog item — the uid-scoping probe. A removal names
// a uid, never a ref, so masking A must leave B standing.
const BLADE_A = 'uid-ledger-blade-a';
const BLADE_B = 'uid-ledger-blade-b';
// Held weapons: the pike is removed, the spear is the anchor that proves the
// Strikes segment rendered at all.
const PIKE_UID = 'uid-ledger-pike';
const SPEAR_UID = 'uid-ledger-spear';
// A container and two things inside it — the overlay walks into container
// contents (`applyRemovedOverlay` recurses), so a stowed item can be masked too.
const PACK_UID = 'uid-ledger-pack';
const POTION_X = 'uid-ledger-potion-x';
const POTION_Y = 'uid-ledger-potion-y';

const weapon = (id: string, name: string, strikeName: string) => ({
  id,
  name,
  weight: 1,
  price: 1,
  strikes: {
    name: strikeName,
    type: 'melee',
    damage: '1d8',
    damageType: 'slashing',
    traits: ['Attack', 'Melee'],
    actionCount: 1,
  },
});

const BLADE_ITEM = weapon('e2e-ledger-blade', 'E2E Ledger Blade', 'E2E Ledger Cut');
const PIKE_ITEM = weapon('e2e-ledger-pike', 'E2E Ledger Pike', 'E2E Ledger Thrust');
const SPEAR_ITEM = weapon('e2e-ledger-spear', 'E2E Ledger Spear', 'E2E Ledger Jab');

// `container` on the CATALOG doc is what makes resolveInventoryItem resolve the
// entry's `container.contents` (it reads `resolved.container`, not the entry's).
const PACK_ITEM = {
  id: 'e2e-ledger-pack',
  name: 'E2E Ledger Pack',
  weight: 1,
  price: 1,
  container: { capacity: 4, ignored: 2 },
};
const POTION_ITEM = { id: 'e2e-ledger-potion', name: 'E2E Ledger Potion', weight: 0.1, price: 1 };
const SALVE_ITEM = { id: 'e2e-ledger-salve', name: 'E2E Ledger Salve', weight: 0.1, price: 1 };

// An augmentation fits by `augTarget` + host type (weapon = has strikes), and it
// lives in the ITEM collection, so the seed fixture can supply it. That matters:
// the GM rune board reads the RUNE catalog, which `fixtures/gm.ts` cannot seed —
// so the augmentation slot is the only GmGearModal write reachable from an E2E
// seed, and it rides exactly the same `applyGearEntry` spine as a rune etch.
const AUGMENT_ITEM = {
  id: 'e2e-ledger-augment',
  name: 'E2E Ledger Augment',
  type: 'augmentation',
  augTarget: ['weapon'],
  weight: 0,
  price: 1,
  description: 'A test augmentation.',
};

const KEEPER = {
  id: CHAR_ID,
  name: CHAR_NAME,
  level: 5,
  class: 'Fighter',
  ancestry: 'Human',
  background: 'Soldier',
  maxHp: 50,
  ac: 18,
  abilities: { strength: 18 },
  inventory: [
    { ref: BLADE_ITEM.id, quantity: 1, uid: BLADE_A },
    { ref: BLADE_ITEM.id, quantity: 1, uid: BLADE_B },
    { ref: PIKE_ITEM.id, quantity: 1, uid: PIKE_UID },
    { ref: SPEAR_ITEM.id, quantity: 1, uid: SPEAR_UID },
    {
      ref: PACK_ITEM.id,
      quantity: 1,
      uid: PACK_UID,
      container: {
        contents: [
          { ref: POTION_ITEM.id, quantity: 1, uid: POTION_X },
          { ref: SALVE_ITEM.id, quantity: 1, uid: POTION_Y },
        ],
      },
    },
  ],
};

const FRIEND = { id: FRIEND_ID, name: FRIEND_NAME, level: 5 };

const CATALOG = {
  item: [BLADE_ITEM, PIKE_ITEM, SPEAR_ITEM, PACK_ITEM, POTION_ITEM, SALVE_ITEM, AUGMENT_ITEM],
  character: [KEEPER, FRIEND],
};

// ── Navigation ──────────────────────────────────────────────────────────────

/**
 * Wait out a sheet mount. `expectOnSheet` catches the CharacterSheet redirect to
 * '/' (the character not yet visible to ContentContext) with a real diagnosis
 * instead of a 15s "h1 not found"; the heading is the render barrier. Needed
 * after EVERY navigation in this file, reloads and second tabs included — the
 * redirect race doesn't care which page object it happens on.
 */
async function awaitSheet(page: Page) {
  await expectOnSheet(page, CHAR_ID);
  await expectSheet(page, CHAR_NAME);
}

async function gotoSheet(page: Page) {
  await page.goto(`/character/${CHAR_ID}`);
  await awaitSheet(page);
}

/**
 * The Inventory tab, hydrated. `bag-tab-worn` is the gate: BagGrid only mounts
 * once the effective inventory exists, so waiting on it is the "the overlay has
 * been applied" barrier every absence assertion below needs. Without an anchor
 * like this, a `toHaveCount(0)` passes trivially against a tab that has not
 * rendered yet.
 */
async function openInventory(page: Page) {
  await openPlayTab(page, 'Inventory');
  await expect(page.getByTestId('bag-tab-worn')).toBeVisible({ timeout: 15_000 });
}

/** Grid tiles carrying a given item name — the "how many copies are there" probe. */
const cellsNamed = (page: Page, name: string) =>
  page.locator('.cell-name', { hasText: name });

test.describe('Item removal overlay (cnmh_removed)', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed(CATALOG);
  });

  test('a seeded overlay masks its uids in the grid, inside a container, and on the encounter deck', async ({
    page,
  }) => {
    // Three surfaces, one ledger: the Worn grid, a container's bag, and the
    // Segmented Deck's Strikes segment. Each removed uid has a sibling that
    // stays, so every absence assertion has a positive anchor beside it.
    await mockSession(page, {
      seed: {
        [`cnmh_removed_${CHAR_ID}`]: [BLADE_A, POTION_X, PIKE_UID],
        // Both polearms in hand so the Strikes segment definitely lists them
        // when present — otherwise "the pike's strike is absent" could pass
        // because worn weapons never reach that segment at all.
        [`cnmh_loadout_${CHAR_ID}`]: {
          [PIKE_UID]: { state: 'held1', hand: 1 },
          [SPEAR_UID]: { state: 'held1', hand: 2 },
        },
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
      },
    });

    await gotoSheet(page);

    // ── Surface 1: the encounter deck ──────────────────────────────────────
    await openPlayTab(page, 'Encounter');
    await expectMyTurnLive(page);
    await page.getByRole('tab', { name: 'Strikes', exact: true }).click();

    const body = deckBody(page);
    // Anchor: the held spear's strike is here…
    await expect(body.getByRole('button', { name: 'E2E Ledger Jab', exact: true })).toBeVisible();
    // …the equally-held pike's is not, because its uid is in the ledger.
    await expect(body.getByRole('button', { name: 'E2E Ledger Thrust', exact: true })).toHaveCount(0);

    // ── Surface 2: the Worn grid, and the uid scoping ──────────────────────
    await openInventory(page);
    await expect(page.getByTestId(`grid-cell-${BLADE_B}`)).toBeVisible();
    await expect(page.getByTestId(`grid-cell-${BLADE_A}`)).toHaveCount(0);
    // The two blades are the same catalog item; removing one uid leaves exactly
    // one copy standing. This is the box the ledger is uid-keyed FOR.
    await expect(cellsNamed(page, 'E2E Ledger Blade')).toHaveCount(1);

    // ── Surface 3: inside the container ────────────────────────────────────
    // `applyRemovedOverlay` recurses into `container.contents`, so a stowed
    // entry is maskable without the container itself being touched.
    await page.getByTestId(`bag-tab-${PACK_UID}`).click();
    await expect(page.getByTestId(`grid-cell-${POTION_Y}`)).toBeVisible();
    await expect(page.getByTestId(`grid-cell-${POTION_X}`)).toHaveCount(0);
  });

  test("ItemModal's Give writes the uid to cnmh_removed and the tile leaves the grid", async ({
    page,
  }) => {
    // Vehicle: the "Give to" block (`useGiveItem`), the cheapest player-side
    // route to a removal. #945 owns the gifting flow itself — what is asserted
    // here is the LEDGER write and the masking it produces, not the transfer.
    const session = await mockSession(page, { seed: {} });

    await gotoSheet(page);
    await openInventory(page);

    await page.getByTestId(`grid-cell-${BLADE_A}`).click();
    await expect(page.getByTestId('item-give')).toBeVisible();
    await page.getByTestId(`give-item-${FRIEND_ID}`).click();

    // The ledger write itself: the given entry's uid, appended to the array.
    const ledger = await session.expectSent(
      `cnmh_removed_${CHAR_ID}`,
      (v) => Array.isArray(v) && v.includes(BLADE_A),
    );
    expect(ledger).toEqual([BLADE_A]);

    // …and the effective tree follows. The modal closing is the anchor that the
    // give actually fired before the counts are read.
    await expect(page.getByTestId('item-give')).toHaveCount(0);
    await expect(page.getByTestId(`grid-cell-${BLADE_A}`)).toHaveCount(0);
    await expect(page.getByTestId(`grid-cell-${BLADE_B}`)).toBeVisible();
    await expect(cellsNamed(page, 'E2E Ledger Blade')).toHaveCount(1);
  });

  test('the overlay survives a reload — from the Durable Object, not local storage', async ({
    page,
  }) => {
    // Four sheet mounts (the give, a second device, then two reloads) against a
    // cold `wrangler dev`; the 30s local default is not the subject and has been
    // seen to run out on a busy machine.
    test.setTimeout(90_000);

    // THE property the ledger exists for. Deliberately runs on the REAL relay:
    // `mockSession` replays its original seed on every reconnect, so a reload
    // against it would prove only that the fixture is deterministic. Here the
    // write has to make the round trip through `CampaignSession` and come back
    // in the next FULL_STATE. (The local `--env e2e` stack reports Foundry
    // present — `anyBridgeConnected` short-circuits on ENVIRONMENT — so the
    // offline write-gate doesn't freeze this per-character write.)
    await gotoSheet(page);
    await openInventory(page);

    await page.getByTestId(`grid-cell-${BLADE_A}`).click();
    await expect(page.getByTestId('item-give')).toBeVisible();
    await page.getByTestId(`give-item-${FRIEND_ID}`).click();
    await expect(page.getByTestId(`grid-cell-${BLADE_A}`)).toHaveCount(0);

    // Barrier before reloading: the DO broadcasts an UPDATE to other peers only
    // AFTER `storage.put` resolves, so a second device seeing the item gone is
    // proof the write is durable. Reloading straight off the local optimistic
    // state would race the persist and flake.
    const peer = await page.context().newPage();
    await peer.goto(`/character/${CHAR_ID}`);
    await awaitSheet(peer);
    await openInventory(peer);
    await expect(peer.getByTestId(`grid-cell-${BLADE_A}`)).toHaveCount(0);
    await expect(peer.getByTestId(`grid-cell-${BLADE_B}`)).toBeVisible();
    await peer.close();

    // Reload: the authored doc still lists both blades — only the overlay says
    // otherwise, so a lost ledger resurrects the item.
    await page.reload();
    await awaitSheet(page);
    await openInventory(page);
    await expect(page.getByTestId(`grid-cell-${BLADE_B}`)).toBeVisible();
    await expect(page.getByTestId(`grid-cell-${BLADE_A}`)).toHaveCount(0);

    // …and it is the DO carrying it, not the write-through cache. `useSyncedState`
    // mirrors every synced value into localStorage, so without this second pass a
    // reload could be satisfied entirely from this origin's storage and the test
    // would still pass with a DO that never stored anything.
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await awaitSheet(page);
    await openInventory(page);
    await expect(page.getByTestId(`grid-cell-${BLADE_B}`)).toBeVisible();
    await expect(page.getByTestId(`grid-cell-${BLADE_A}`)).toHaveCount(0);
  });

  test('a GM-side removal reaches an open player sheet live', async ({ page }) => {
    // The wire half of the GM twin, on both viewports: a peer writes the
    // acquired+removed PAIR that `applyGearEntry` produces (fresh-uid copy
    // credited, original uid masked) and the open sheet re-derives without a
    // reload. Whether GmGearModal's own UI emits that pair is the next test.
    const session = await mockSession(page, { seed: {} });

    await gotoSheet(page);
    await openInventory(page);
    await expect(page.getByTestId(`grid-cell-${BLADE_A}`)).toBeVisible();

    const REPLACEMENT = 'uid-ledger-blade-augmented';
    session.push(`cnmh_acquired_${CHAR_ID}`, [
      { ref: BLADE_ITEM.id, quantity: 1, uid: REPLACEMENT, augmentation: { ref: AUGMENT_ITEM.id } },
    ]);
    session.push(`cnmh_removed_${CHAR_ID}`, [BLADE_A]);

    // The replacement arriving is the anchor; the original leaving is the point.
    await expect(page.getByTestId(`grid-cell-${REPLACEMENT}`)).toBeVisible();
    await expect(page.getByTestId(`grid-cell-${BLADE_A}`)).toHaveCount(0);
    // Two blades before, two blades after — but only because the ledger masked
    // one. Drop `removed` from that pair and this count is 3.
    await expect(cellsNamed(page, 'E2E Ledger Blade')).toHaveCount(2);
  });

  test('GM Manage Gear routes its removal through the same ledger', async ({ page }, testInfo) => {
    // GM Tools has no responsive layout (see playwright.config.ts), so the modal
    // is driven on desktop only; the wire contract it produces is covered on both
    // projects by the test above.
    test.skip(testInfo.project.name !== 'chromium', 'GM Tools is desktop-only');

    // Real relay throughout: GmGearModal writes with `force: true` straight to the
    // DO, and the player sheet is loaded afterwards, so the ledger has to survive
    // the round trip for the assertion to hold.
    await page.goto('/gm');
    await page.getByRole('button', { name: 'Manage character gear' }).click();
    await page.getByLabel('select character').selectOption(CHAR_ID);

    // The spear is the host: its name is unique in this inventory, unlike the two
    // blade entries which would make the row's aria-label ambiguous.
    await page
      .getByLabel(`augmentation for ${SPEAR_ITEM.name}`)
      .selectOption(AUGMENT_ITEM.id);
    // The row re-renders showing the applied augmentation — the GM-side anchor.
    await expect(page.getByTestId(`aug-row-${SPEAR_ITEM.name}`)).toContainText(AUGMENT_ITEM.name);

    await gotoSheet(page);
    await openInventory(page);
    // The augmented copy landed under a FRESH uid, and the authored entry is
    // masked: exactly one spear, and not the one the character doc authored.
    await expect(cellsNamed(page, SPEAR_ITEM.name)).toHaveCount(1);
    await expect(page.getByTestId(`grid-cell-${SPEAR_UID}`)).toHaveCount(0);
  });
});
