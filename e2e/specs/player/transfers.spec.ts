/**
 * Player-to-player transfers — gold & item gifting (#945, epic #654).
 *
 * The two writers under test:
 *   - `useGiveGold` (#655): giver's balance is `cnmh_gold_<giverId>`; the
 *     recipient is credited straight through the session (`sendUpdate`), with
 *     their doc gold as the fallback baseline. Credit lands BEFORE the debit so
 *     a mid-transfer failure can only duplicate, never destroy.
 *   - `useGiveItem` (#656/#657): the recipient receives a fresh-uid inline copy
 *     on `cnmh_acquired_<recipientId>`; the giver loses the entry via
 *     `cnmh_removed_<giverId>` (authored gear), a splice of their own acquired
 *     overlay, or — for a stack split — the uid-keyed `cnmh_consumed_<giverId>`
 *     ledger (#1659).
 *
 * Division of labour with `item-removal.spec.ts` (per #1656's de-dupe note):
 * that file owns the removed LEDGER itself (write shape, masking, durability);
 * this one owns the TRANSFER — above all the recipient's side of the wire,
 * which nothing else covers.
 *
 * Mode gating: both give surfaces (`InventoryTab`'s Give-gold button and
 * `ItemModal`'s Give-to block) render only in exploration/downtime — giving in
 * an encounter would be an Interact action and is deliberately absent.
 *
 * NOT covered — gifting a whole container: `useGiveItem.give` walks the
 * container subtree (fresh uids for contents, every uid leaves the giver), but
 * the sheet has no UI entry point to it — `BagGrid` renders containers as bag
 * TABS and only grid cells / hands / attuned tiles open the ItemModal, so
 * `doGive` can never receive a container today. The reachable container flow —
 * gifting a stowed item OUT of one — is covered below.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectOnSheet, expectSheet, openPlayTab } from '../../helpers/sheet';
import { activeEncounter } from '../../helpers/encounter';

const GIVER_ID = 'e2e-gifter';
const GIVER_NAME = 'E2E Gifter';
const FRIEND_ID = 'e2e-giftee';
const FRIEND_NAME = 'E2E Giftee';

const IDOL_UID = 'uid-gift-idol';
const TONIC_UID = 'uid-gift-tonic';
const PACK_UID = 'uid-gift-pack';
const FLASK_UID = 'uid-gift-flask';

// Plain worn gear — the whole-item gift vehicle.
const IDOL_ITEM = { id: 'e2e-gift-idol', name: 'E2E Gift Idol', weight: 1, price: 10 };
// A metadata-tagged consumable — `consumableMeta` is what turns the give block
// into the stack-split flow (quantity picker + the consumed-ledger debit).
const TONIC_ITEM = {
  id: 'e2e-gift-tonic',
  name: 'E2E Gift Tonic',
  weight: 0.1,
  price: 5,
  traits: ['Consumable', 'Potion'],
  consumable: { kind: 'healing', formula: '1d8' },
};
// `container` on the CATALOG doc is what makes the resolver read the entry's
// contents (same trick as item-removal.spec.ts).
const PACK_ITEM = {
  id: 'e2e-gift-pack',
  name: 'E2E Gift Pack',
  weight: 1,
  price: 2,
  container: { capacity: 4, ignored: 2 },
};
const FLASK_ITEM = { id: 'e2e-gift-flask', name: 'E2E Gift Flask', weight: 0.1, price: 3 };

// Doc gold is the committed baseline both live balances default to (#670) —
// the transfer maths below (100 → 60, 25 → 65) start from these.
const GIVER = {
  id: GIVER_ID,
  name: GIVER_NAME,
  level: 3,
  gold: 100,
  inventory: [
    { ref: IDOL_ITEM.id, quantity: 1, uid: IDOL_UID },
    { ref: TONIC_ITEM.id, quantity: 3, uid: TONIC_UID },
    {
      ref: PACK_ITEM.id,
      quantity: 1,
      uid: PACK_UID,
      container: { contents: [{ ref: FLASK_ITEM.id, quantity: 1, uid: FLASK_UID }] },
    },
  ],
};
const FRIEND = { id: FRIEND_ID, name: FRIEND_NAME, level: 3, gold: 25 };

const CATALOG = {
  item: [IDOL_ITEM, TONIC_ITEM, PACK_ITEM, FLASK_ITEM],
  character: [GIVER, FRIEND],
};

// ── Navigation (same barriers as item-removal.spec.ts) ──────────────────────

async function gotoSheet(page: Page, charId: string, charName: string) {
  await page.goto(`/character/${charId}`);
  await expectOnSheet(page, charId);
  await expectSheet(page, charName);
}

/** Inventory tab, hydrated — `bag-tab-worn` mounts only once the effective
 * inventory exists, so it is the barrier every overlay assertion needs. */
async function openInventory(page: Page) {
  await openPlayTab(page, 'Inventory');
  await expect(page.getByTestId('bag-tab-worn')).toBeVisible({ timeout: 15_000 });
}

/** Grid tiles carrying a given item name — the "how many copies" probe (the
 * recipient's gifted copy lands under a uid minted at give time, so name is
 * the only stable handle on their side). */
const cellsNamed = (page: Page, name: string) => page.locator('.cell-name', { hasText: name });

test.describe('Player transfers — gold & item gifting', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed(CATALOG);
  });

  test('gold: the modal guards the balance, credits the recipient before the debit, and both purses move', async ({
    page,
  }) => {
    const session = await mockSession(page, {
      seed: { cnmh_playmode_global: 'exploration' },
    });

    await gotoSheet(page, GIVER_ID, GIVER_NAME);
    await openInventory(page);

    // Baseline: the header shows the giver's doc gold through the unset overlay.
    await expect(page.locator('.inventory-gold')).toHaveText(/\b100 gp\b/);

    await page.getByTestId('give-gold-open').click();
    const dialog = page.getByRole('dialog', { name: 'Give Gold' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.give-gold-balance')).toContainText('100 gp');

    // Insufficient-funds guard: amount > balance keeps Give disabled…
    await dialog.getByRole('button', { name: FRIEND_NAME, exact: true }).click();
    const amount = dialog.getByLabel('Amount to give');
    await amount.fill('250');
    await expect(page.getByTestId('give-gold-submit')).toBeDisabled();

    // …a legal amount unlocks it.
    await amount.fill('40');
    await expect(page.getByTestId('give-gold-submit')).toBeEnabled();
    await page.getByTestId('give-gold-submit').click();

    // Both ledgers on the wire: recipient = their doc gold (25) + 40; giver =
    // 100 − 40 through their own synced overlay.
    await session.expectSent(`cnmh_gold_${FRIEND_ID}`, (v) => v === 65);
    await session.expectSent(`cnmh_gold_${GIVER_ID}`, (v) => v === 60);

    // Credit-before-debit is the transfer's loss-safety invariant — assert the
    // order the two UPDATEs actually left in, not just that both exist.
    const goldWrites = session.sent.filter((m) => m.stateType === 'gold');
    expect(goldWrites[0]).toMatchObject({ characterId: FRIEND_ID, value: 65 });
    expect(goldWrites[1]).toMatchObject({ characterId: GIVER_ID, value: 60 });

    // The giver's header follows the debit.
    await expect(page.locator('.inventory-gold')).toHaveText(/\b60 gp\b/);
  });

  test('item: a gift lands in the recipient inventory and leaves the giver — through the real relay', async ({
    page,
  }) => {
    // Deliberately NO mockSession: the recipient's acquired overlay is written
    // by the GIVER's device, so the only honest proof it arrives is the round
    // trip through the CampaignSession DO into the friend's own FULL_STATE.
    // (The local --env e2e stack reports Foundry present, so the offline
    // write-gate does not freeze these per-character writes.)
    // Three sheet mounts against a cold wrangler dev — give the default 30s
    // some headroom.
    test.setTimeout(90_000);

    await gotoSheet(page, GIVER_ID, GIVER_NAME);
    await openInventory(page);

    await page.getByTestId(`grid-cell-${IDOL_UID}`).click();
    await expect(page.getByTestId('item-give')).toBeVisible();
    await page.getByTestId(`give-item-${FRIEND_ID}`).click();

    // The modal closes on give; the giver's tile is masked immediately.
    await expect(page.getByTestId('item-give')).toHaveCount(0);
    await expect(page.getByTestId(`grid-cell-${IDOL_UID}`)).toHaveCount(0);

    // The recipient's sheet — with this origin's write-through cache cleared,
    // so the idol can only come from the DO's FULL_STATE, not localStorage.
    await page.evaluate(() => window.localStorage.clear());
    await gotoSheet(page, FRIEND_ID, FRIEND_NAME);
    await openInventory(page);
    await expect(cellsNamed(page, IDOL_ITEM.name)).toHaveCount(1);

    // And back on the giver: the authored doc still lists the idol — only the
    // removed ledger (also DO-held now) says otherwise.
    await gotoSheet(page, GIVER_ID, GIVER_NAME);
    await openInventory(page);
    await expect(page.getByTestId(`grid-cell-${TONIC_UID}`)).toBeVisible(); // grid anchor
    await expect(page.getByTestId(`grid-cell-${IDOL_UID}`)).toHaveCount(0);
  });

  test('consumable stack split: the recipient gets a fresh-uid copy of the split count, the giver depletes via the consumed ledger', async ({
    page,
  }) => {
    const session = await mockSession(page, {
      seed: { cnmh_playmode_global: 'exploration' },
    });

    await gotoSheet(page, GIVER_ID, GIVER_NAME);
    await openInventory(page);

    // The full stack renders with its quantity badge.
    const tonicCell = page.getByTestId(`grid-cell-${TONIC_UID}`);
    await expect(tonicCell.locator('.icon-tile-qty')).toHaveText('3');
    await tonicCell.click();

    // consumableMeta + quantity > 1 → the split picker renders.
    await expect(page.getByTestId('item-give')).toBeVisible();
    await expect(page.locator('.item-give-qty-of')).toHaveText('of 3');
    await page.getByLabel('Quantity to give').fill('2');
    await page.getByTestId(`give-item-${FRIEND_ID}`).click();

    // Recipient ledger: one acquired entry, quantity 2, minted under a FRESH
    // uid (a gift must never collide with an entry the recipient already owns).
    const acquired = await session.expectSent(
      `cnmh_acquired_${FRIEND_ID}`,
      (v) => Array.isArray(v) && v.length === 1 && v[0]?.quantity === 2,
    );
    expect(acquired[0].name).toBe(TONIC_ITEM.name);
    expect(acquired[0].uid).not.toBe(TONIC_UID);

    // Giver ledger: the split depletes through the uid-keyed consumed overlay
    // (#1659) — scoped to the stack that was given from, not the item name.
    const consumed = await session.expectSent(
      `cnmh_consumed_${GIVER_ID}`,
      (v) => v && typeof v === 'object' && v[TONIC_UID] === 2,
    );
    expect(consumed).toEqual({ [TONIC_UID]: 2 });

    // The giver's stack re-renders at 1 — the badge only shows above 1, so its
    // disappearance (with the tile still standing) IS quantity 3 → 1.
    await expect(tonicCell).toBeVisible();
    await expect(tonicCell.locator('.icon-tile-qty')).toHaveCount(0);
  });

  test('container: a stowed item gifted out of a bag reaches the recipient un-placed and leaves the bag', async ({
    page,
  }) => {
    const session = await mockSession(page, {
      seed: { cnmh_playmode_global: 'exploration' },
    });

    await gotoSheet(page, GIVER_ID, GIVER_NAME);
    await openInventory(page);

    // Into the pack's bag, give the flask away.
    await page.getByTestId(`bag-tab-${PACK_UID}`).click();
    await expect(page.getByTestId(`grid-cell-${FLASK_UID}`)).toBeVisible();
    await page.getByTestId(`grid-cell-${FLASK_UID}`).click();
    await expect(page.getByTestId('item-give')).toBeVisible();
    await page.getByTestId(`give-item-${FRIEND_ID}`).click();

    // Recipient ledger: the copy arrives fresh-uid'd and with its live
    // placement STRIPPED (`reuid` drops state/hand) — the recipient's own
    // effective tree re-derives where it lives, rather than inheriting
    // "stowed in a bag they don't have".
    const acquired = await session.expectSent(
      `cnmh_acquired_${FRIEND_ID}`,
      (v) => Array.isArray(v) && v.length === 1,
    );
    expect(acquired[0].name).toBe(FLASK_ITEM.name);
    expect(acquired[0].uid).not.toBe(FLASK_UID);
    expect(acquired[0].state).toBeUndefined();

    // Giver ledger: the authored stowed entry is masked by uid — and only it;
    // the pack itself stays.
    const removed = await session.expectSent(
      `cnmh_removed_${GIVER_ID}`,
      (v) => Array.isArray(v) && v.includes(FLASK_UID),
    );
    expect(removed).toEqual([FLASK_UID]);

    // The bag empties; the pack tab is still there.
    await expect(page.getByTestId(`grid-cell-${FLASK_UID}`)).toHaveCount(0);
    await expect(page.getByTestId(`bag-tab-${PACK_UID}`)).toBeVisible();
  });

  test('encounter mode hides both give surfaces', async ({ page }) => {
    await mockSession(page, {
      seed: { cnmh_encounter_global: activeEncounter(GIVER_ID, GIVER_NAME) },
    });

    await gotoSheet(page, GIVER_ID, GIVER_NAME);

    // Hydration gate: the mode-aware play tab reads "Encounter" only once the
    // synced encounter has landed — assert it before reading gated UI, or the
    // give button could be "absent" merely because exploration hasn't yielded.
    await expect(
      page
        .getByRole('navigation', { name: 'Character sheet sections' })
        .getByRole('button', { name: 'Encounter', exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    await openInventory(page);

    // Gold still shows (anchor) — the Give button does not.
    await expect(page.locator('.inventory-gold')).toHaveText(/\b100 gp\b/);
    await expect(page.getByTestId('give-gold-open')).toHaveCount(0);

    // The ItemModal opens (anchor: its dialog) — the Give-to block does not.
    await page.getByTestId(`grid-cell-${IDOL_UID}`).click();
    await expect(page.getByRole('dialog', { name: IDOL_ITEM.name })).toBeVisible();
    await expect(page.getByTestId('item-give')).toHaveCount(0);
  });
});
