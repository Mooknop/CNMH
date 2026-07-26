/**
 * GM Manage Gear — the GM twin of the affix/attach write side (#1655, epic #1589).
 *
 * `specs/player/affix-attach.spec.ts` owns the player-surface half (the ItemModal
 * 10-minute activity). This is the other authoring surface for the same two
 * overlays — `components/gm/GmGearModal.jsx`, reached from the GM dashboard's
 * Manage Gear quick action:
 *
 *   cnmh_affixed_<id>   talismanUid → hostUid    (utils/affix.js)
 *   cnmh_attached_<id>  attachmentUid → shieldUid (utils/shieldAttach.js)
 *
 * Deliberately NOT mocked. Two things only the real relay can show:
 *   1. GmGearModal writes with `sendUpdate(…, { force: true })` specifically so
 *      GM authoring survives the offline-sandbox write freeze (Foundry absent —
 *      which is exactly the state a local stack is in). A mocked session reports
 *      Foundry present and would never exercise that.
 *   2. "the player-visible result matches" is a broadcast assertion: a second
 *      page sitting on the character's Inventory has to SEE the binding appear,
 *      with no reload.
 *
 * Desktop-only by directory convention (GM Tools has no responsive layout).
 */

import { test, expect } from '../../fixtures/gm';

const CHAR_ID = 'e2e-gear-ward';
const CHAR_NAME = 'E2E Gear Ward';

const PIN_UID = 'uid-gg-pin';
const SCALE_UID = 'uid-gg-scale';
const SHIELD_UID = 'uid-gg-shield';
const SPIKES_UID = 'uid-gg-spikes';

const PIN = {
  id: 'e2e-gg-pin',
  name: 'E2E Warding Pin',
  weight: 0,
  price: 3,
  traits: ['Talisman', 'Consumable'],
  talisman: { affixTo: 'armor' },
};

const SCALE = {
  id: 'e2e-gg-scale',
  name: 'E2E Warded Scale Mail',
  weight: 2,
  price: 4,
  armor: { category: 'medium', acBonus: 4, dexCap: 2 },
};

const SHIELD = {
  id: 'e2e-gg-shield',
  name: 'E2E Warded Shield',
  weight: 1,
  price: 2,
  shield: { hp: 20, hardness: 5, bonus: 2, brokenThreshold: 10 },
};

const SPIKES = {
  id: 'e2e-gg-spikes',
  name: 'E2E Warded Spikes',
  weight: 0.1,
  price: 1,
  attachment: { to: 'shield' },
  strikes: {
    name: 'E2E Warded Spike Strike',
    type: 'melee',
    damage: '1d6',
    damageType: 'piercing',
    traits: ['Attack', 'Melee'],
    actionCount: 1,
  },
};

const CHARACTER = {
  id: CHAR_ID,
  name: CHAR_NAME,
  level: 5,
  class: 'Fighter',
  ancestry: 'Human',
  background: 'Soldier',
  maxHp: 50,
  ac: 18,
  abilities: { strength: 18, dexterity: 12, constitution: 14 },
  inventory: [
    { ref: PIN.id, quantity: 1, uid: PIN_UID },
    { ref: SCALE.id, quantity: 1, uid: SCALE_UID },
    { ref: SHIELD.id, quantity: 1, uid: SHIELD_UID },
    { ref: SPIKES.id, quantity: 1, uid: SPIKES_UID },
  ],
};

// ── Rune-seeding fixtures (#1663) ────────────────────────────────────────────
// Their own character so the rune board holds exactly one property socket and
// nothing here perturbs the binding test above.
const RUNE_CHAR_ID = 'e2e-rune-ward';
const RUNE_CHAR_NAME = 'E2E Rune Ward';
const BLADE_UID = 'uid-gg-blade';

const BLADE = {
  id: 'e2e-gg-blade',
  name: 'E2E Warded Blade',
  weight: 1,
  price: 2,
  strikes: {
    name: 'E2E Warded Blade Strike',
    type: 'melee',
    damage: '1d8',
    damageType: 'slashing',
    traits: ['Attack', 'Melee'],
    actionCount: 1,
  },
};

// A weapon property rune that exists nowhere in the bundled catalog, so seeing it
// offered can only mean the seed landed in the `rune` collection.
const SEEDED_RUNE = {
  id: 'e2e-gg-keening',
  name: 'E2E Keening',
  type: 'property',
  target: 'weapon',
  level: 8,
  price: 500,
  description: 'E2E-only weapon property rune.',
};

const RUNE_CHARACTER = {
  id: RUNE_CHAR_ID,
  name: RUNE_CHAR_NAME,
  level: 5,
  class: 'Fighter',
  ancestry: 'Human',
  background: 'Soldier',
  maxHp: 50,
  ac: 18,
  abilities: { strength: 18, dexterity: 12, constitution: 14 },
  // `runes` on the ENTRY (resolveInventoryItem overlays it onto the catalog base):
  // +1 potency is what unlocks the single property socket the picker fills.
  inventory: [{ ref: BLADE.id, quantity: 1, uid: BLADE_UID, runes: { potency: 1 } }],
};

test.describe('GM Manage Gear bindings', () => {
  test('GM binds a talisman and a shield attachment; the player sheet shows both without reloading', async ({
    page,
    reset,
    seed,
  }) => {
    await reset();
    await seed({ item: [PIN, SCALE, SHIELD, SPIKES], character: [CHARACTER] });

    // The player peer, parked on the character's Inventory BEFORE the GM writes,
    // so what it shows afterwards is a live broadcast rather than a fresh read.
    // (A page opened from the same context inherits the project's Access headers;
    // browser.newContext() would not — see live-sync.spec.ts.)
    const playerPage = await page.context().newPage();
    await playerPage.goto(`/character/${CHAR_ID}`);
    await expect(playerPage.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    await playerPage
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Inventory', exact: true })
      .click();

    // Baseline: unbound, so both the talisman and the attachment have their own
    // tiles and neither host is marked. This is the anchor the changes below are
    // measured against.
    await expect(playerPage.getByTestId(`grid-cell-${PIN_UID}`)).toBeVisible();
    await expect(playerPage.getByTestId(`grid-cell-${SPIKES_UID}`)).toBeVisible();

    await page.goto('/gm');
    // Both peers' relay subscriptions must be live before the broadcast, or it
    // can outrun the player page's socket open (live-sync.spec.ts's rationale).
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-connected', 'true');
    await expect(playerPage.getByTestId('sync-status')).toHaveAttribute('data-connected', 'true');

    await page.getByRole('button', { name: 'Manage character gear' }).click();
    await page.getByLabel('select character').selectOption(CHAR_ID);

    // ── Talisman: one <select> per talisman, listing validAffixHosts ──────────
    const talismanHost = page.getByLabel(`host for ${PIN.name}`);
    await expect(talismanHost).toBeVisible({ timeout: 10_000 });
    // Only the armor is an option — GmGearModal takes the same validAffixHosts
    // the player card does, so the shield is not offered for an `affixTo: armor`
    // talisman. The armor option existing is the anchor for the shield's absence.
    await expect(talismanHost.getByRole('option', { name: SCALE.name })).toHaveCount(1);
    await expect(talismanHost.getByRole('option', { name: SHIELD.name })).toHaveCount(0);
    await talismanHost.selectOption(SCALE_UID);
    await expect(page.getByTestId(`gear-row-${PIN.name}`)).toContainText(`on ${SCALE.name}`);

    // ── Shield attachment ────────────────────────────────────────────────────
    const attachHost = page.getByLabel(`host for ${SPIKES.name}`);
    await attachHost.selectOption(SHIELD_UID);
    await expect(page.getByTestId(`gear-row-${SPIKES.name}`)).toContainText(`on ${SHIELD.name}`);

    // ── The player-visible result matches ────────────────────────────────────
    // Live, no reload: a bound talisman / attachment gives up its own tile and
    // renders on its host's card, and the host gains the attachment medallion.
    // (INVENTORY-PRESENCE, but safe across #1652: nothing here is consumed, and
    // InventoryTab applies the consumed overlay before the affixed/attached
    // filter, so an unused talisman keeps its tile either side of that change.)
    await expect(playerPage.getByTestId(`grid-cell-${PIN_UID}`)).toHaveCount(0);
    await expect(playerPage.getByTestId(`grid-cell-${SPIKES_UID}`)).toHaveCount(0);
    await expect(
      playerPage.getByTestId(`grid-cell-${SCALE_UID}`).getByRole('img', { name: 'Has an attachment' }),
    ).toBeVisible();

    await playerPage.getByTestId(`grid-cell-${SCALE_UID}`).click();
    await expect(playerPage.getByTestId('hosted-talismans')).toContainText(PIN.name);
    await playerPage.getByRole('button', { name: 'Close' }).click();

    await playerPage.getByTestId(`grid-cell-${SHIELD_UID}`).click();
    await expect(playerPage.getByTestId('shield-attachments')).toContainText(SPIKES.name);
    await playerPage.getByRole('button', { name: 'Close' }).click();

    // ── Unbinding from the GM side propagates too ────────────────────────────
    // The `— unaffixed —` / `— detached —` option maps to `null`, which routes to
    // unaffix/unattach rather than affix/attach.
    await talismanHost.selectOption('');
    await expect(page.getByTestId(`gear-row-${PIN.name}`)).toContainText('unaffixed');
    await attachHost.selectOption('');
    await expect(page.getByTestId(`gear-row-${SPIKES.name}`)).toContainText('detached');

    await expect(playerPage.getByTestId(`grid-cell-${PIN_UID}`)).toBeVisible();
    await expect(playerPage.getByTestId(`grid-cell-${SPIKES_UID}`)).toBeVisible();
    await expect(
      playerPage.getByTestId(`grid-cell-${SCALE_UID}`).getByRole('img', { name: 'Has an attachment' }),
    ).toHaveCount(0);

    await playerPage.close();
  });

  // ── The seed fixture can seed runes (#1663) ────────────────────────────────
  // The `rune` collection was missing from SeedCollections, so no spec could put
  // a known rune in front of the socket picker — the picker only ever showed the
  // bundled fallback catalog, which is exactly the blocker under #943 (shop
  // Runesmithing) and #1050 (accessory runes). This proves the whole loop:
  // seeded rune → offered by the picker → etchable onto a seeded weapon.
  test('a seeded rune is offered by — and etchable from — the GM rune board', async ({
    page,
    reset,
    seed,
  }) => {
    await reset();
    await seed({ item: [BLADE], character: [RUNE_CHARACTER], rune: [SEEDED_RUNE] });

    await page.goto('/gm');
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-connected', 'true');

    await page.getByRole('button', { name: 'Manage character gear' }).click();
    await page.getByLabel('select character').selectOption(RUNE_CHAR_ID);

    // The Runes section renders at all — it is gated on the character owning gear
    // with at least one socket, which the +1 blade supplies.
    const runeBoard = page.getByRole('region', { name: 'Runes' });
    await expect(runeBoard).toBeVisible({ timeout: 10_000 });

    // Matched by pattern, not by name: GmGearModal labels each picker with the
    // item's DISPLAY name, and a runed item may re-derive it. Only one item here
    // has a property socket, so the pattern is unambiguous.
    const propertyPicker = runeBoard.getByLabel(/^property rune for /);
    await expect(propertyPicker).toBeVisible();

    // The seeded rune is an option…
    await expect(propertyPicker.getByRole('option', { name: SEEDED_RUNE.name })).toHaveCount(1);
    // …and the bundled catalog is gone, which is the half that proves the DO's
    // `rune` collection (not the code fallback) is what the picker read. Flaming
    // is a bundled weapon property rune, so it would be offered if the seed had
    // silently no-op'd and ContentContext had fallen back to the snapshot.
    await expect(propertyPicker.getByRole('option', { name: 'Flaming' })).toHaveCount(0);

    // Etching it commits through applyGearEntry (acquired/removed), the same
    // spine #943/#1050 will drive — so the socket reports the seeded rune by name.
    await propertyPicker.selectOption(SEEDED_RUNE.id);
    await expect(runeBoard).toContainText(SEEDED_RUNE.name);
  });
});
