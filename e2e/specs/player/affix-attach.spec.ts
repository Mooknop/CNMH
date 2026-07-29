/**
 * Affix & attach — the WRITE side (#1655, part of epic #1589).
 *
 * `combat-item-state.spec.ts` (#1646) seeds both bindings and asserts what they
 * do in combat. This spec owns how a binding is CREATED and torn down from the
 * player surface — the two item→item overlays authored on an ItemModal card:
 *
 *   cnmh_affixed_<id>   talismanUid → hostUid   (utils/affix.js, 10-min activity)
 *   cnmh_attached_<id>  attachmentUid → shieldUid (utils/shieldAttach.js, 10-min)
 *
 * Both are per-character APP.* keys built by `syncKey(APP.AFFIXED|ATTACHED, id)`.
 *
 * Assertion policy (#1652 heads-up): #1652 makes `isConsumable` honour the
 * Consumable TRAIT, which flips talismans to consumable and puts them under the
 * `cnmh_consumed_*` ledger via `applyConsumedOverlay`. So the load-bearing
 * assertion in every box below is the OVERLAY WRITE, not a quantity. Where a box
 * does look at the bag it is only ever asking "does this item have its own tile,
 * or does it live on its host's card" — InventoryTab applies the consumed overlay
 * BEFORE the affixed/attached filter, and nothing here consumes anything, so a
 * never-used talisman keeps its tile either side of #1652. Those spots are marked
 * INVENTORY-PRESENCE below.
 *
 * Take 10's affix path (`utils/take10Resolve.js`) is NOT covered: it fires
 * GM-side out of PlayModeControl once every PC is ready, so it needs the whole
 * Take-10 beat, which #948 owns and no e2e spec builds yet.
 *
 * The GM twin (`components/gm/GmGearModal.jsx`) lives in
 * `specs/gm/gm-gear-bindings.spec.ts` — GM Tools is desktop-only.
 *
 * Runs on chromium and mobile-chromium.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectOnSheet, expectSheet, openPlayTab } from '../../helpers/sheet';

const CHAR_ID = 'e2e-affixer';
const CHAR_NAME = 'E2E Affixer';

const AFFIXED_KEY = `cnmh_affixed_${CHAR_ID}`;
const ATTACHED_KEY = `cnmh_attached_${CHAR_ID}`;

const PIN_UID = 'uid-aff-pin';
const CLASP_UID = 'uid-aff-clasp';
const SCALE_UID = 'uid-aff-scale';
const LEATHER_UID = 'uid-aff-leather';
const SWORD_UID = 'uid-aff-sword';
const SHIELD_UID = 'uid-aff-shield';
const SPIKES_UID = 'uid-aff-spikes';
const BOSS_UID = 'uid-aff-boss';

// ── Catalog content ──────────────────────────────────────────────────────────

// Two talismans that affix to the SAME type, so the occupancy boxes below can
// aim them at the same host without the type filter doing the refusing for us.
// `traits: ['Talisman']` is what isTalisman keys off; `talisman.affixTo` is what
// hostMatchesType scopes valid hosts by.
const talismanDoc = (n: number, name: string) => ({
  id: `e2e-aff-talisman-${n}`,
  name,
  weight: 0,
  price: 3,
  traits: ['Talisman', 'Consumable'],
  talisman: {
    affixTo: 'armor',
    activation: {
      cost: 'reaction',
      trigger: 'You attempt a save against a disease or poison.',
      effect: { kind: 'save-bonus', save: 'fortitude', bonus: 2, value: 'status' },
    },
  },
});
const PIN = talismanDoc(1, 'E2E Sanitizing Pin');
const CLASP = talismanDoc(2, 'E2E Mending Clasp');

// Two legal hosts (both carry an `armor` block) so "a second talisman on a
// DIFFERENT host" can be told apart from "a second talisman at all".
const SCALE = {
  id: 'e2e-aff-scale',
  name: 'E2E Scale Mail',
  weight: 2,
  price: 4,
  armor: { category: 'medium', acBonus: 4, dexCap: 2 },
};
const LEATHER = {
  id: 'e2e-aff-leather',
  name: 'E2E Leather Armor',
  weight: 1,
  price: 2,
  armor: { category: 'light', acBonus: 1, dexCap: 4 },
};

// Illegal hosts for an `affixTo: 'armor'` talisman: a weapon and a shield.
const SWORD = {
  id: 'e2e-aff-sword',
  name: 'E2E Test Sword',
  weight: 1,
  price: 1,
  strikes: {
    name: 'E2E Sword Strike',
    type: 'melee',
    damage: '1d8',
    damageType: 'slashing',
    traits: ['Attack', 'Melee'],
    actionCount: 1,
  },
};
const SHIELD = {
  id: 'e2e-aff-shield',
  name: 'E2E Steel Shield',
  weight: 1,
  price: 2,
  shield: { hp: 20, hardness: 5, bonus: 2, brokenThreshold: 10 },
};

// Shield attachments — their own weapons marked `attachment.to === 'shield'`,
// which is what isShieldAttachment keys off. Two of them, so the displacement
// rule in shieldAttach.attach has something to displace.
const attachmentDoc = (n: number, name: string, strikeName: string) => ({
  id: `e2e-aff-attachment-${n}`,
  name,
  weight: 0.1,
  price: 1,
  attachment: { to: 'shield' },
  strikes: {
    name: strikeName,
    type: 'melee',
    damage: '1d6',
    damageType: 'piercing',
    traits: ['Attack', 'Melee'],
    actionCount: 1,
  },
});
const SPIKES = attachmentDoc(1, 'E2E Shield Spikes', 'E2E Spike Strike');
const BOSS = attachmentDoc(2, 'E2E Shield Boss', 'E2E Boss Strike');

const ALL_ITEMS = [PIN, CLASP, SCALE, LEATHER, SWORD, SHIELD, SPIKES, BOSS];

// ── Character + navigation ───────────────────────────────────────────────────

type Slot = { ref: string; quantity: number; uid: string };

const character = (inventory: Slot[]) => ({
  id: CHAR_ID,
  name: CHAR_NAME,
  level: 5,
  class: 'Fighter',
  ancestry: 'Human',
  background: 'Soldier',
  maxHp: 50,
  ac: 18,
  abilities: { strength: 18, dexterity: 12, constitution: 14 },
  inventory,
});

// The full kit, in the order the boxes below expect to find it.
const FULL_KIT: Slot[] = [
  { ref: PIN.id, quantity: 1, uid: PIN_UID },
  { ref: CLASP.id, quantity: 1, uid: CLASP_UID },
  { ref: SCALE.id, quantity: 1, uid: SCALE_UID },
  { ref: LEATHER.id, quantity: 1, uid: LEATHER_UID },
  { ref: SWORD.id, quantity: 1, uid: SWORD_UID },
  { ref: SHIELD.id, quantity: 1, uid: SHIELD_UID },
  { ref: SPIKES.id, quantity: 1, uid: SPIKES_UID },
  { ref: BOSS.id, quantity: 1, uid: BOSS_UID },
];

/**
 * Sheet → Inventory. Every box here is a 10-minute activity, so none of them
 * wants an encounter: the ItemModal binding cards are the whole surface.
 */
async function gotoInventory(page: Page) {
  await page.goto(`/character/${CHAR_ID}`);
  await expectOnSheet(page, CHAR_ID);
  await expectSheet(page, CHAR_NAME);
  await openPlayTab(page, 'Inventory');
}

/** Open an item's card by its inventory uid. */
const openCard = (page: Page, uid: string) => page.getByTestId(`grid-cell-${uid}`).click();

// Local locators. The Affix block carries no testid of its own (the Attach block
// does — `item-attach`), so it is addressed by its heading; `exact` keeps it off
// the "Affixed Talismans" block, which shares the `.item-affix` class.
// FACTOR-OUT CANDIDATE: an `e2e/helpers/inventory.ts` for openCard/affixPanel.
const affixPanel = (page: Page) =>
  page.locator('.item-affix').filter({
    has: page.getByRole('heading', { name: 'Affix', exact: true }),
  });
const attachPanel = (page: Page) => page.getByTestId('item-attach');

/** A host offer button inside a binding panel. */
const hostOption = (panel: ReturnType<typeof affixPanel>, name: string) =>
  panel.getByRole('button', { name, exact: true });

test.describe('Affix & attach (write side)', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  // ── cnmh_affixed: create ───────────────────────────────────────────────────

  test('affix: only type-matching hosts are offered, and picking one writes the binding', async ({
    page,
    seed,
  }) => {
    await seed({ item: ALL_ITEMS, character: [character(FULL_KIT)] });
    const session = await mockSession(page);

    await gotoInventory(page);
    await openCard(page, PIN_UID);

    // `affixTo: 'armor'` → hostMatchesType offers only items with an `armor`
    // block. Both armors present is the anchor that makes the two absences
    // below real absences rather than an unrendered panel.
    const panel = affixPanel(page);
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(hostOption(panel, SCALE.name)).toBeVisible();
    await expect(hostOption(panel, LEATHER.name)).toBeVisible();
    await expect(hostOption(panel, SWORD.name)).toHaveCount(0);
    await expect(hostOption(panel, SHIELD.name)).toHaveCount(0);

    // The 10-minute activity: pick a host. THE assertion — the overlay is keyed
    // by the talisman's inventory uid and holds the host's uid.
    await hostOption(panel, SCALE.name).click();
    await session.expectSent(AFFIXED_KEY, (v) => v?.[PIN_UID] === SCALE_UID);

    // …and the binding is one-way: the OTHER armor is untouched, so the write is
    // a mapping rather than a flag on the character.
    await session.expectSent(AFFIXED_KEY, (v) => !Object.values(v || {}).includes(LEATHER_UID));

    // INVENTORY-PRESENCE (safe across #1652 — nothing was consumed): an affixed
    // talisman gives up its own tile and lives on its host's card instead.
    await expect(page.getByTestId(`grid-cell-${PIN_UID}`)).toHaveCount(0);
    const scaleTile = page.getByTestId(`grid-cell-${SCALE_UID}`);
    await expect(scaleTile).toBeVisible();
    await expect(scaleTile.getByRole('img', { name: 'Has an attachment' })).toBeVisible();

    await openCard(page, SCALE_UID);
    await expect(page.getByTestId('hosted-talismans')).toContainText(PIN.name);
  });

  test('host eligibility: a talisman with no matching host is refused, and a non-shield is never an attach host', async ({
    page,
    seed,
  }) => {
    // The same kit MINUS both armors, so the armor-talisman has nowhere legal to
    // go while a weapon and a shield sit right there in the bag.
    await seed({
      item: ALL_ITEMS,
      character: [
        character([
          { ref: PIN.id, quantity: 1, uid: PIN_UID },
          { ref: SWORD.id, quantity: 1, uid: SWORD_UID },
          { ref: SHIELD.id, quantity: 1, uid: SHIELD_UID },
          { ref: SPIKES.id, quantity: 1, uid: SPIKES_UID },
        ]),
      ],
    });
    const session = await mockSession(page);

    await gotoInventory(page);

    // Talisman side: the panel states the refusal in words rather than offering
    // the weapon or the shield. The message is the anchor — it only renders on
    // the `affixHosts.length === 0` branch, so it IS the "nothing to offer".
    await openCard(page, PIN_UID);
    const affix = affixPanel(page);
    await expect(affix).toBeVisible({ timeout: 10_000 });
    await expect(affix).toContainText('No valid armor to affix this to.');
    await expect(affix.getByRole('button')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close' }).click();

    // Attachment side: validAttachHosts filters on an `shield` block, so the
    // sword is not an option even though it is a perfectly good weapon.
    await openCard(page, SPIKES_UID);
    const attach = attachPanel(page);
    await expect(attach).toBeVisible({ timeout: 10_000 });
    await expect(hostOption(attach, SHIELD.name)).toBeVisible();
    await expect(hostOption(attach, SWORD.name)).toHaveCount(0);

    // Neither refusal wrote anything: an illegal pairing is not silently taken.
    expect(session.sent.some((m) => m.stateType === 'affixed' || m.stateType === 'attached')).toBe(false);
  });

  test('a second talisman goes onto a DIFFERENT host without disturbing the first', async ({
    page,
    seed,
  }) => {
    await seed({ item: ALL_ITEMS, character: [character(FULL_KIT)] });
    const session = await mockSession(page, {
      seed: { [AFFIXED_KEY]: { [PIN_UID]: SCALE_UID } },
    });

    await gotoInventory(page);
    await openCard(page, CLASP_UID);

    const panel = affixPanel(page);
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await hostOption(panel, LEATHER.name).click();

    // The cap the ruling describes is PER HOST, not per character: a second
    // talisman on a second host is legal and the first binding survives the
    // write (affix() spreads the previous overlay).
    await session.expectSent(
      AFFIXED_KEY,
      (v) => v?.[CLASP_UID] === LEATHER_UID && v?.[PIN_UID] === SCALE_UID,
    );

    // INVENTORY-PRESENCE (safe across #1652): both armors now carry a child.
    await expect(
      page.getByTestId(`grid-cell-${SCALE_UID}`).getByRole('img', { name: 'Has an attachment' }),
    ).toBeVisible();
    await expect(
      page.getByTestId(`grid-cell-${LEATHER_UID}`).getByRole('img', { name: 'Has an attachment' }),
    ).toBeVisible();
  });

  // #1657 (FIXED) — the ruling is "an item carries ONE talisman at a time";
  // affixing to an occupied host is refused, and the escape hatch is the unaffix
  // activity (covered live in the next box). The rule landed in
  // `validAffixHosts` (affix.js), which now takes the affix overlay as a third
  // argument and drops any host already carrying another talisman — so all three
  // pickers (ItemModal, GmGearModal, take10Activities) inherit it from the one
  // place. `affix()` re-checks it so the invariant cannot be bypassed
  // programmatically. This box was shipped as a documented `test.skip` alongside
  // the bug report and un-skipped unchanged when the fix landed.
  test('re-affix: a host that already carries a talisman is not offered again (#1657)', async ({
    page,
    seed,
  }) => {
    await seed({ item: ALL_ITEMS, character: [character(FULL_KIT)] });
    await mockSession(page, { seed: { [AFFIXED_KEY]: { [PIN_UID]: SCALE_UID } } });

    await gotoInventory(page);
    await openCard(page, CLASP_UID);

    const panel = affixPanel(page);
    await expect(panel).toBeVisible({ timeout: 10_000 });
    // The free armor is the anchor: the panel is rendered and offering hosts,
    // so the occupied one being missing is a refusal rather than an empty panel.
    await expect(hostOption(panel, LEATHER.name)).toBeVisible();
    await expect(hostOption(panel, SCALE.name)).toHaveCount(0);
  });

  // ── cnmh_affixed: tear down ────────────────────────────────────────────────

  test('unaffix: removing a talisman clears the binding and gives the talisman back', async ({
    page,
    seed,
  }) => {
    await seed({ item: ALL_ITEMS, character: [character(FULL_KIT)] });
    const session = await mockSession(page, {
      seed: { [AFFIXED_KEY]: { [PIN_UID]: SCALE_UID, [CLASP_UID]: LEATHER_UID } },
    });

    await gotoInventory(page);

    // Affixed, so the talisman has no tile of its own — its host's card is the
    // only place it can be reached from.
    await expect(page.getByTestId(`grid-cell-${PIN_UID}`)).toHaveCount(0);
    await openCard(page, SCALE_UID);
    const hosted = page.getByTestId('hosted-talismans');
    await expect(hosted).toBeVisible({ timeout: 10_000 });
    await expect(hosted).toContainText(PIN.name);

    // Remove ≠ activate: `doUnaffixHosted` only drops the binding, so nothing is
    // spent. (The Activate button next to it is the consuming path, and
    // combat-item-state.spec owns it.)
    await page.getByTestId(`hosted-unaffix-${PIN_UID}`).click();
    await session.expectSent(AFFIXED_KEY, (v) => v && !(PIN_UID in v));
    // The OTHER binding is untouched — unaffix deletes one key, it does not reset.
    await session.expectSent(AFFIXED_KEY, (v) => v?.[CLASP_UID] === LEATHER_UID);
    expect(session.sent.some((m) => m.stateType === 'consumed')).toBe(false);

    // INVENTORY-PRESENCE (safe across #1652 — nothing was consumed): the freed
    // talisman is back in its normal spot in the bag, ready to be re-affixed,
    // and its former host has lost the attachment medallion.
    await expect(page.getByTestId(`grid-cell-${PIN_UID}`)).toBeVisible();
    await expect(
      page.getByTestId(`grid-cell-${SCALE_UID}`).getByRole('img', { name: 'Has an attachment' }),
    ).toHaveCount(0);

    // …and it is genuinely re-bindable: its own card offers hosts again.
    await openCard(page, PIN_UID);
    await expect(hostOption(affixPanel(page), SCALE.name)).toBeVisible({ timeout: 10_000 });
  });

  // ── cnmh_attached ──────────────────────────────────────────────────────────

  test('attach: an attachment binds to a shield, and Remove clears the binding', async ({
    page,
    seed,
  }) => {
    await seed({ item: ALL_ITEMS, character: [character(FULL_KIT)] });
    const session = await mockSession(page);

    await gotoInventory(page);
    await openCard(page, SPIKES_UID);

    const panel = attachPanel(page);
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await hostOption(panel, SHIELD.name).click();

    // attachmentUid → shieldUid. The riding half (the Strike showing up while
    // the shield is held) belongs to combat-item-state.spec; this is the write.
    await session.expectSent(ATTACHED_KEY, (v) => v?.[SPIKES_UID] === SHIELD_UID);

    // INVENTORY-PRESENCE (safe across #1652 — an attachment is never consumed):
    // like an affixed talisman, a bound attachment renders on its host's card.
    await expect(page.getByTestId(`grid-cell-${SPIKES_UID}`)).toHaveCount(0);
    await openCard(page, SHIELD_UID);
    const shieldChild = page.getByTestId('shield-attachments');
    await expect(shieldChild).toBeVisible({ timeout: 10_000 });
    await expect(shieldChild).toContainText(SPIKES.name);

    // Detach from the shield's card. Reusable, never consumed (shieldAttach.js
    // header): the binding clears and the attachment comes back whole.
    await shieldChild.getByRole('button', { name: 'Remove', exact: true }).click();
    await session.expectSent(ATTACHED_KEY, (v) => v && !(SPIKES_UID in v));
    await expect(page.getByTestId(`grid-cell-${SPIKES_UID}`)).toBeVisible();
    expect(session.sent.some((m) => m.stateType === 'consumed')).toBe(false);
  });

  test('attach displaces: a second attachment on the same shield evicts the first', async ({
    page,
    seed,
  }) => {
    await seed({ item: ALL_ITEMS, character: [character(FULL_KIT)] });
    const session = await mockSession(page, {
      seed: { [ATTACHED_KEY]: { [SPIKES_UID]: SHIELD_UID } },
    });

    await gotoInventory(page);
    await openCard(page, BOSS_UID);

    const panel = attachPanel(page);
    await expect(panel).toBeVisible({ timeout: 10_000 });
    // The occupied shield IS still offered — `validAttachHosts` does not filter
    // on occupancy, and deliberately so: the two sibling mechanisms share the
    // one-per-host cap but resolve a collision differently. An attachment is
    // reusable and never consumed, so `attach()` DISPLACES the incumbent (it
    // deletes every binding already pointing at that shield before adding the
    // new one) and the displaced attachment goes back in the bag. A talisman is
    // consumed on activation, so the #1657 ruling REFUSES instead — see the
    // re-affix box above, where the occupied host is not offered at all.
    await hostOption(panel, SHIELD.name).click();

    await session.expectSent(
      ATTACHED_KEY,
      (v) => v?.[BOSS_UID] === SHIELD_UID && !(SPIKES_UID in v),
    );

    // INVENTORY-PRESENCE (safe across #1652): the displaced attachment is back in
    // the bag — displacement returns it rather than destroying it.
    await expect(page.getByTestId(`grid-cell-${SPIKES_UID}`)).toBeVisible();
    await expect(page.getByTestId(`grid-cell-${BOSS_UID}`)).toHaveCount(0);
  });
});
