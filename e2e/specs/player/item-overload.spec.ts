/**
 * Item Overload lifecycle (#1654) — the scepter `broken` overlay
 * (`cnmh_itembroken_<charId>`), NOT the durability engine.
 *
 * `src/utils/itemBroken.js` is explicit that this is a lightweight
 * player-writable overlay keyed by item uid, separate from `cnmh_itemhp`
 * (#539). It has zero encounter presence — `buildActionCatalog` grows no
 * `actuated` tile — so its only surface is the ItemModal activation card
 * driven by `hooks/useItemActivation.jsx`.
 *
 * Two tests, split so neither runs long:
 *
 *  1. BREAK — activate the once/day actuated ability (spends a slot + records
 *     the freq ledger), then Overload the spent use. The item breaks either way
 *     (DC 10 flat check, success or failure), writing
 *     `{ [uid]: { repairable: false } }`. The card then refuses: no Activate, no
 *     Overload, and the GM-ruling hint "Can't be repaired until your next daily
 *     preparations" instead of a Repair button. A second copy of the same item
 *     (different uid) is untouched — the overlay is uid-scoped.
 *
 *  2. UNLOCK + REPAIR — seed a freshly-broken (locked) overlay, run Daily
 *     Preparations (`utils/dailyPrep.js`), and watch it flip `repairable: true`
 *     WITHOUT clearing the entry. Repair (action) then deletes the uid and the
 *     activation card comes back.
 *
 * Runs on both chromium and mobile-chromium (player surface).
 *
 * NOTE (factor-out candidates): `waitForSheet`, `openInventory`, `openItem` and
 * `closeItemModal` below are local on purpose — sibling agents are editing
 * `e2e/helpers/*` in parallel. `openItem`/`closeItemModal` in particular would
 * suit `helpers/sheet.ts` once the dust settles.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { expectOnSheet, expectSheet, openPlayTab } from '../../helpers/sheet';
import { snapshotItems } from '../../helpers/spellcasting';
import { mockSession } from '../../fixtures/session';

const CHAR_ID = 'e2e-sceptrist';
const CHAR_NAME = 'E2E Sceptrist';
const SCEPTER_REF = 'e2e-scepter-of-overload';
const UID_A = 'uid-scepter-a';
const UID_B = 'uid-scepter-b';
const BROKEN_KEY = `cnmh_itembroken_${CHAR_ID}`;
// The shared spell-slot ledger (#957): { [rank]: spent }. A slot sacrifice
// (#998) and a cast draw from the same pool, so the actuated activation and
// the Overload below must each land here too (#1046).
const SLOTS_KEY = `cnmh_slots_${CHAR_ID}`;

// A scepter-shaped catalog item: an `actuated` block with a `minRank` and NO
// `cost: 'none'`, which is what opens the slot-sacrifice + Overload surface
// (a cost-free accessory-rune activation deliberately has no Overload path).
const SCEPTER_DOC = {
  id: SCEPTER_REF,
  name: 'E2E Scepter of Overload',
  level: 6,
  price: 250,
  weight: 1,
  actuated: {
    name: 'Surge of Power',
    actionCount: 3,
    minRank: 1,
    frequency: 'once per day',
    traits: ['Manipulate'],
    description: 'A test actuated ability paid by sacrificing a rank 1+ spell slot.',
  },
};

const CHARACTER_DOC = {
  id: CHAR_ID,
  name: CHAR_NAME,
  level: 6,
  class: 'Wizard',
  ancestry: 'Human',
  background: 'Scholar',
  maxHp: 60,
  ac: 20,
  // Three rank-1 slots: one for the activation, one for the Overload, one left
  // over so the second copy still shows an Activate button.
  spellcasting: { spell_slots: { 1: 3 } },
  inventory: [
    { ref: SCEPTER_REF, quantity: 1, uid: UID_A },
    { ref: SCEPTER_REF, quantity: 1, uid: UID_B },
  ],
};

async function waitForSheet(page: Page) {
  await expectOnSheet(page, CHAR_ID);
  await expectSheet(page, CHAR_NAME);
}

async function openInventory(page: Page) {
  await openPlayTab(page, 'Inventory');
  await expect(page.getByTestId(`grid-cell-${UID_A}`)).toBeVisible({ timeout: 10_000 });
}

/** Tap a bag tile and wait for the actuated card inside the ItemModal. */
async function openItem(page: Page, uid: string) {
  await page.getByTestId(`grid-cell-${uid}`).click();
  await expect(page.getByTestId('item-actuated')).toBeVisible({ timeout: 10_000 });
}

/** ItemModal renders its own chrome (`hideHeader`) with an aria-label="Close" ×. */
async function closeItemModal(page: Page) {
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByTestId('item-actuated')).toBeHidden();
}

test.describe('Item Overload lifecycle (cnmh_itembroken)', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('Overload breaks the scepter, blocks re-activation, and locks Repair', async ({
    page,
    seed,
  }) => {
    await seed({ item: [SCEPTER_DOC], character: [CHARACTER_DOC] });

    const session = await mockSession(page);
    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page);
    await openInventory(page);

    // --- Fresh: the once/day actuated use is offered, nothing is broken ---
    await openItem(page, UID_A);
    await expect(page.getByTestId('actuated-activate-rank-1')).toBeVisible();
    await expect(page.getByTestId('item-actuated-broken')).toHaveCount(0);
    await expect(page.getByTestId('actuated-overload-rank-1')).toHaveCount(0);

    // Spend the daily use (sacrifices a rank-1 slot). doActuate closes the modal.
    await page.getByTestId('actuated-activate-rank-1').click();
    await expect(page.getByTestId('item-actuated')).toBeHidden();

    // BOX (#998): the sacrifice consumed a slot — the shared slot ledger
    // records 1 rank-1 slot spent, the same pool a cast would draw from.
    await session.expectSent(SLOTS_KEY, (v) => v?.['1'] === 1);

    // --- Daily use spent → Overload is the only way to fire it again ---
    await openItem(page, UID_A);
    // Anchor for the absence assertion: Overload appearing proves the freq gate
    // closed, so "no Activate button" is a real refusal and not a slow render.
    await expect(page.getByTestId('actuated-overload-rank-1')).toBeVisible();
    await expect(page.getByTestId('actuated-activate-rank-1')).toHaveCount(0);

    await page.getByTestId('actuated-overload-rank-1').click();
    await expect(page.getByTestId('item-actuated')).toBeHidden();

    // The Overload's slot cost is paid up front (#998): second spent slot.
    await session.expectSent(SLOTS_KEY, (v) => v?.['1'] === 2);

    // BOX: the Overload writes the uid into cnmh_itembroken_<charId>, locked.
    // The DC 10 flat check breaks the item on a success AND on a failure, so
    // this is deterministic without pinning the RNG.
    const overlay = await session.expectSent(
      BROKEN_KEY,
      (v) => !!v && v[UID_A] && v[UID_A].repairable === false,
    );
    expect(overlay[UID_B]).toBeUndefined();

    // --- BOX: broken blocks further activation, and Repair is unavailable ---
    await openItem(page, UID_A);
    // The broken block is the anchor: once it is on screen the card has fully
    // re-rendered, so the four absences below are refusals, not races.
    await expect(page.getByTestId('item-actuated-broken')).toBeVisible();
    await expect(page.getByTestId('actuated-repair-locked')).toHaveText(
      /Can.t be repaired until your next daily preparations\./,
    );
    await expect(page.getByTestId('actuated-activate-rank-1')).toHaveCount(0);
    await expect(page.getByTestId('actuated-overload-rank-1')).toHaveCount(0);
    await expect(page.getByTestId('actuated-repair-action')).toHaveCount(0);
    await expect(page.getByTestId('actuated-repair-slot')).toHaveCount(0);

    // --- BOX: scoped to the uid — the second copy is untouched ---
    await closeItemModal(page);
    await openItem(page, UID_B);
    await expect(page.getByTestId('actuated-activate-rank-1')).toBeVisible();
    await expect(page.getByTestId('item-actuated-broken')).toHaveCount(0);
  });

  test('Daily preparations unlock repair; Repair (action) clears the entry', async ({
    page,
    seed,
  }) => {
    await seed({ item: [SCEPTER_DOC], character: [CHARACTER_DOC] });

    // Seed the state the previous test produces: broken and NOT yet repairable.
    // No encounter is seeded — the Daily Preparations bar only renders while
    // mode !== 'encounter'.
    const session = await mockSession(page, {
      seed: { [BROKEN_KEY]: { [UID_A]: { repairable: false } } },
    });
    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page);

    // --- BOX: daily prep flips repairable without clearing the entry ---
    // The Stats tab is the default tab and carries the prep bar.
    await page.getByRole('button', { name: 'Daily Preparations' }).click();
    // dailyPrep.js's own label for this reset — the plan lists it because
    // hasLockedBroken() is true. Nothing else is dirty on this character.
    await expect(page.getByRole('dialog', { name: 'Daily Preparations' })).toContainText(
      'broken items (repair unlocked)',
    );
    await page.getByRole('button', { name: 'Prepare', exact: true }).click();

    const unlocked = await session.expectSent(
      BROKEN_KEY,
      (v) => !!v && v[UID_A] && v[UID_A].repairable === true,
    );
    // Unlock is not a repair: the uid is still present (still broken).
    expect(Object.keys(unlocked)).toEqual([UID_A]);

    // --- Still broken, but now repairable ---
    await openInventory(page);
    await openItem(page, UID_A);
    await expect(page.getByTestId('item-actuated-broken')).toBeVisible();
    await expect(page.getByTestId('actuated-repair-action')).toBeVisible();
    // The slot path is offered too — daily prep restored the rank-1 slots, and
    // minRank is 1.
    await expect(page.getByTestId('actuated-repair-slot')).toBeVisible();
    await expect(page.getByTestId('actuated-repair-locked')).toHaveCount(0);

    // --- BOX: Repair clears the entry and the activation card comes back ---
    await page.getByTestId('actuated-repair-action').click();
    await expect(page.getByTestId('item-actuated')).toBeHidden();

    await session.expectSent(BROKEN_KEY, (v) => !!v && !(UID_A in v));

    await openItem(page, UID_A);
    await expect(page.getByTestId('actuated-activate-rank-1')).toBeVisible();
    await expect(page.getByTestId('item-actuated-broken')).toHaveCount(0);
  });
});

/**
 * Catalog wiring (#1000, e2e per #1046): the tests above prove the actuated
 * MACHINERY on a synthetic doc; this proves a REAL shipped scepter's authored
 * `actuated` block drives it. `snapshotItems` seeds the production doc from
 * src/data/snapshot/item.json, so if the catalog block ever drifts (renamed
 * ability, changed minRank) this spec sees exactly what production sees.
 */
test.describe('Catalog scepter actuation (#1000)', () => {
  const CAT_REF = 'scepter-of-energy-ablation'; // actuated: "Energy Abjection", minRank 2
  const CAT_UID = 'uid-scepter-energy';

  const CATALOG_CHAR = {
    id: CHAR_ID,
    name: CHAR_NAME,
    level: 6,
    class: 'Wizard',
    ancestry: 'Human',
    background: 'Scholar',
    maxHp: 60,
    ac: 20,
    // Rank-2 slots only: minRank is 2, so these are the sole eligible pool —
    // the activation surface offers exactly one rank button.
    spellcasting: { spell_slots: { 2: 2 } },
    inventory: [{ ref: CAT_REF, quantity: 1, uid: CAT_UID }],
  };

  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test("a wired scepter's actuated ability appears and consumes a rank-2 slot", async ({
    page,
    seed,
  }) => {
    await seed({ item: snapshotItems(CAT_REF), character: [CATALOG_CHAR] });

    const session = await mockSession(page);
    await page.goto(`/character/${CHAR_ID}`);
    await waitForSheet(page);
    await openPlayTab(page, 'Inventory');
    await expect(page.getByTestId(`grid-cell-${CAT_UID}`)).toBeVisible({ timeout: 10_000 });
    await openItem(page, CAT_UID);

    // The authored block surfaces: ability name and the minRank-2 slot cost.
    const card = page.getByTestId('item-actuated');
    await expect(card).toContainText('Energy Abjection');
    await expect(card).toContainText('Cost: sacrifice a spell slot of rank 2+ · once per day');

    // One eligible pool → one activate button, showing the pool's remaining.
    const activate = page.getByTestId('actuated-activate-rank-2');
    await expect(activate).toHaveText('Rank 2 (2)');
    await activate.click();
    await expect(card).toBeHidden();

    // The activation consumed a rank-2 slot on the shared ledger…
    expect(await session.expectSent(SLOTS_KEY, (v) => v?.['2'] === 1)).toMatchObject({ '2': 1 });

    // …and closed the once/day gate: Overload is now the only path.
    await openItem(page, CAT_UID);
    await expect(page.getByTestId('actuated-overload-rank-2')).toBeVisible();
    await expect(page.getByTestId('actuated-activate-rank-2')).toHaveCount(0);
  });
});
