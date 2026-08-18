/**
 * Player shop — Runesmithing: weapon/armor rune SOCKETS + the work-order flow
 * (#943, part of the #519 coverage-gaps epic). The accessory-host angle is
 * accessory-runes.spec.ts's subject; GM shop authoring is #944. This file owns
 * the target-gear (weapon/armor) side of the Runes tab: socket boards, staging,
 * the combined ware+handoff checkout, and the collect leg of a work order.
 *
 * All rune content is the BUNDLED catalog — deliberately un-seeded (the DO's
 * `rune` collection, when non-empty, REPLACES the bundle; see
 * accessory-runes.spec.ts). Fundamental runes (potency/striking/resilient)
 * always merge in from code (mergeFundamentalRunes) and the bundled rune.json
 * carries them too, so a hand-stocked `{ ref:'runestone', runeRef }` ware
 * resolves fundamentals and property runes alike.
 *
 * What each test owns:
 *  1. TAB GATING + RUNE-WARE SPLIT (#857 S1/#883): the Runes tab appears only
 *     when the shop offers runes — derived here from a stocked Runestone ware,
 *     no explicit `offersRunes` flag — and rune wares are filtered OUT of the
 *     Wares grid into the tab's "Runes for sale", priced at the runestone
 *     spine's stone + rune (#800: 3 gp + rune price).
 *  2. SOCKET BOARD + COMBINED CHECKOUT + COLLECT (#857 S6/S7, #879, #832): a
 *     weapon shows potency/striking sockets and armor potency/resilient; the
 *     property slot is potency-gated and OPENS IN THE SAME VISIT when +1
 *     potency is staged (projectStagedGear); staging builds a single handoff
 *     cart line (cost + 24h note); ONE checkout commits a loose-runestone ware
 *     purchase AND the handoff — one gold debit for the combined total, a
 *     work order recorded, the authored gear masked via cnmh_removed_ — and
 *     collecting the ready order credits back the weapon with potency +
 *     striking + property all applied (applyRunesToGear).
 *  3. GENERATIVE RUNE SERVICE (#982 G1/G3): a weapon-target offering expands
 *     property runes inside its level window into runestone wares (rune + 3 gp
 *     each), never fundamentals (eligibleRunes is property-only — the socket
 *     picker's potency slot has nothing to offer); buying one lands an inert
 *     `{ ref:'runestone', runeRef }` entry that displays in inventory with no
 *     mechanical effect.
 *
 * Runs on chromium and mobile-chromium (player surface).
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectOnSheet, expectSheet, openPlayTab } from '../../helpers/sheet';
import { snapshotItems } from '../../helpers/spellcasting';

// FACTOR-OUT CANDIDATE (third copy — resonant-powers.spec.ts and
// accessory-runes.spec.ts have the others): read the bundled rune catalog the
// app falls back to when the DO's rune collection is empty, so asserted
// names/prices stay pinned to production content.
import fs from 'node:fs';
import path from 'node:path';

const SNAPSHOT_RUNES = path.resolve(__dirname, '../../../src/data/snapshot/rune.json');
function snapshotRune(id: string): Record<string, any> {
  const all = JSON.parse(fs.readFileSync(SNAPSHOT_RUNES, 'utf8')) as Array<Record<string, any>>;
  const doc = all.find((r) => r.id === id);
  if (!doc) throw new Error(`snapshotRune: "${id}" not found in src/data/snapshot/rune.json`);
  return doc;
}

// RUNESTONE_BASE.price, restated (e2e never imports from src): a generative or
// hand-stocked rune service sells each rune ON a blank etching stone, so every
// runestone ware prices at stone + rune (#800).
const STONE_PRICE = 3;
const stonePrice = (rune: Record<string, any>) => (Number(rune.price) || 0) + STONE_PRICE;

// Real bundled runes. Fundamentals: +1 Weapon Potency (35 gp, tier 1) and
// Striking (65 gp). Property: Returning (level 3, 55 gp) and Ghost Touch
// (level 4, 75 gp) — the level split matters in test 3's maxLevel-3 window.
const POTENCY_1 = snapshotRune('weapon-potency-1');
const STRIKING = snapshotRune('striking');
const RETURNING = snapshotRune('returning');
const GHOST_TOUCH = snapshotRune('ghost-touch');
const AUTHORIZED = snapshotRune('authorized'); // level 3, 50 gp — inside the window

// Mundane target gear from the bundled item catalog: longsword (strikes →
// weapon sockets), breastplate (armor block → armor sockets).
const [LONGSWORD, BREASTPLATE] = snapshotItems('longsword', 'breastplate');

const LOC_ID = 'e2e-loc-runeforge';

const location = () => ({
  id: LOC_ID, title: 'Forge Quarter', category: 'Location', summary: '', content: '',
  related: [], tags: [], visibility: 'revealed',
});
const shopLore = (id: string, title: string) => ({
  id, title, category: 'Location', summary: '', content: '',
  related: [], tags: [], parent: LOC_ID, visibility: 'revealed',
});

// The app's default clock seed (GameDateContext DEFAULT_CLOCK), restated
// because e2e never imports from src (same as accessory-runes.spec.ts).
const CLOCK = { day: 5, month: 2, year: 4725, hour: 8, minute: 0, second: 0 };

const baseCharacter = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  level: 3,
  class: 'Fighter',
  ancestry: 'Human',
  background: 'Soldier',
  maxHp: 30,
  ac: 18,
  abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  ...extra,
});

async function gotoSheet(page: Page, charId: string, charName: string) {
  await page.goto(`/character/${charId}`);
  await expectOnSheet(page, charId);
  await expectSheet(page, charName);
}

async function openDowntimeShop(page: Page) {
  await openPlayTab(page, 'Downtime');
  await page.getByRole('button', { name: /Shop/ }).click();
  await expect(page.getByTestId('shop-storefront')).toBeVisible();
}

test.describe('Player shop — Runesmithing', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  // ── 1. Tab gating + rune-ware split ────────────────────────────────────────
  test('the Runes tab derives from a stocked Runestone ware, splits rune wares out of Wares, and prices at stone + rune', async ({
    page,
    seed,
  }) => {
    const CHAR_ID = 'e2e-rs-browser';
    const CHAR_NAME = 'E2E Rune Browser';

    await seed({
      lore: [location(), shopLore('e2e-shop-anvil', 'The Cold Anvil'), shopLore('e2e-shop-plain', 'Plain Goods')],
      item: [{ id: 'e2e-antidote', name: 'E2E Antidote', price: 3, level: 1 }],
      character: [baseCharacter(CHAR_ID, CHAR_NAME)],
    });
    await mockSession(page, {
      seed: {
        cnmh_campaign_global: { location: 'Forge Quarter', locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_shops_global: {
          // No explicit offersRunes flag anywhere — the tab must DERIVE from
          // the runestone ware (shopOffersRunes' stock fallback, #857 S1).
          'e2e-shop-anvil': {
            revealed: true, open: true,
            wares: [{ ref: 'runestone', runeRef: RETURNING.id }],
          },
          'e2e-shop-plain': { revealed: true, open: true, wares: [{ ref: 'e2e-antidote' }] },
        },
        [`cnmh_gold_${CHAR_ID}`]: 100,
      },
    });

    await gotoSheet(page, CHAR_ID, CHAR_NAME);
    await openDowntimeShop(page);

    // Two shops here → the picker. The plain-goods stall has NO Runes tab.
    await page.getByRole('button', { name: 'Plain Goods' }).click();
    await expect(page.getByTestId('ware-e2e-antidote')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Runes' })).toHaveCount(0);

    // Over to the runesmith via the header's Back chevron (#943: the overlay
    // now portals to <body>, so the navbar no longer intercepts this click).
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'The Cold Anvil' }).click();
    await expect(page.getByRole('tab', { name: 'Runes' })).toBeVisible();

    // The rune ware moved OUT of the Wares grid (#883) — its only ware was the
    // runestone, so the shelves read empty.
    await expect(page.getByText('This shop has nothing for sale right now.')).toBeVisible();

    // On the Runes tab it sells as a runestone at stone + rune (#800): the
    // pricing spine, NOT the bare rune price.
    await page.getByRole('tab', { name: 'Runes' }).click();
    const stone = page.getByTestId(`ware-runestone-${RETURNING.id}`);
    await expect(stone).toBeVisible();
    await expect(stone).toContainText(`${RETURNING.name} Runestone`);
    await expect(stone).toContainText(`${stonePrice(RETURNING)} gp`);

    // No etchable gear on this character — the board says so rather than
    // rendering an empty list.
    await expect(page.getByText('No gear to etch.')).toBeVisible();
  });

  // ── 2. Socket board + combined checkout + collect ──────────────────────────
  test('weapon/armor sockets: staging potency unlocks the property slot, one checkout commits ware + handoff, collect returns the runed weapon', async ({
    page,
    seed,
  }) => {
    const CHAR_ID = 'e2e-rs-smith-client';
    const CHAR_NAME = 'E2E Smith Client';
    const UID_SWORD = 'uid-rs-longsword';
    const UID_ARMOR = 'uid-rs-breastplate';
    const SHOP_ID = 'e2e-shop-etcher';
    const GOLD = 500;

    await seed({
      lore: [location(), shopLore(SHOP_ID, 'The Etched Edge')],
      item: [LONGSWORD, BREASTPLATE],
      character: [
        baseCharacter(CHAR_ID, CHAR_NAME, {
          inventory: [
            { ref: LONGSWORD.id, quantity: 1, uid: UID_SWORD },
            { ref: BREASTPLATE.id, quantity: 1, uid: UID_ARMOR },
          ],
        }),
      ],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_campaign_global: { location: 'Forge Quarter', locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_clock_global: CLOCK,
        cnmh_shops_global: {
          [SHOP_ID]: {
            revealed: true,
            open: true,
            // Hand-stocked runestones: fundamentals are NEVER expanded by a
            // generative offering (see test 3), so a full-service smith stocks
            // them as explicit runestone wares.
            wares: [
              { ref: 'runestone', runeRef: POTENCY_1.id },
              { ref: 'runestone', runeRef: STRIKING.id },
              { ref: 'runestone', runeRef: RETURNING.id },
              { ref: 'runestone', runeRef: GHOST_TOUCH.id },
            ],
          },
        },
        [`cnmh_gold_${CHAR_ID}`]: GOLD,
      },
    });

    await gotoSheet(page, CHAR_ID, CHAR_NAME);
    await openDowntimeShop(page);
    await page.getByRole('tab', { name: 'Runes' }).click();

    // Both target-gear cards are on the board: the weapon leads with its two
    // fundamentals (potency + striking), the armor with potency + resilient.
    const sword = page.getByTestId(`gear-${UID_SWORD}`);
    const armor = page.getByTestId(`gear-${UID_ARMOR}`);
    await expect(sword).toBeVisible();
    await expect(armor).toBeVisible();
    await expect(sword.getByRole('button', { name: `fill Potency slot on ${LONGSWORD.name}` })).toBeVisible();
    await expect(sword.getByRole('button', { name: `fill Striking slot on ${LONGSWORD.name}` })).toBeVisible();
    await expect(armor.getByRole('button', { name: `fill Potency slot on ${BREASTPLATE.name}` })).toBeVisible();
    await expect(armor.getByRole('button', { name: `fill Resilient slot on ${BREASTPLATE.name}` })).toBeVisible();
    // Property sockets are potency-gated: a +0 weapon has none.
    await expect(sword.getByRole('button', { name: `fill Property slot on ${LONGSWORD.name}` })).toHaveCount(0);

    // Stage +1 potency. Each picker option carries the runestone-inclusive
    // price (rune + 3 gp) — the same number the handoff will charge.
    await sword.getByRole('button', { name: `fill Potency slot on ${LONGSWORD.name}` }).click();
    const picker = page.getByTestId(`picker-${UID_SWORD}`);
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('button', { name: `etch ${POTENCY_1.name}` })).toContainText(`${stonePrice(POTENCY_1)} gp`);
    await picker.getByRole('button', { name: `etch ${POTENCY_1.name}` }).click();

    // The staged +1 potency unlocks the property slot IN THE SAME VISIT (#879).
    const propertySlot = sword.getByRole('button', { name: `fill Property slot on ${LONGSWORD.name}` });
    await expect(propertySlot).toBeVisible();

    // Stage Striking and Returning too.
    await sword.getByRole('button', { name: `fill Striking slot on ${LONGSWORD.name}` }).click();
    await picker.getByRole('button', { name: `etch ${STRIKING.name}` }).click();
    await propertySlot.click();
    // The property picker offers the shop's weapon PROPERTY runes only.
    await expect(picker.getByRole('button', { name: `etch ${GHOST_TOUCH.name}` })).toBeVisible();
    await picker.getByRole('button', { name: `etch ${RETURNING.name}` }).click();

    // Staged, not paid: 3 runes at the combined stone-inclusive cost, with the
    // 24h handoff warning.
    const handoffCost = stonePrice(POTENCY_1) + stonePrice(STRIKING) + stonePrice(RETURNING);
    const stagedNote = page.getByTestId(`staged-${UID_SWORD}`);
    await expect(stagedNote).toContainText('3 runes');
    await expect(stagedNote).toContainText(`${handoffCost} gp`);
    await expect(stagedNote).toContainText('24h');

    // Add a WARE purchase on top — a loose Ghost Touch runestone — so checkout
    // has both legs to commit.
    await page.getByRole('button', { name: `add ${GHOST_TOUCH.name} Runestone` }).click();

    // The cart tray: one ware line + one handoff line, one combined total, and
    // the purse-after math.
    const total = handoffCost + stonePrice(GHOST_TOUCH);
    await page.getByTestId('cart-bar').click();
    const tray = page.getByTestId('cart-tray');
    const handoffLine = page.getByTestId(`handoff-line-${UID_SWORD}`);
    await expect(handoffLine).toContainText(LONGSWORD.name);
    await expect(handoffLine).toContainText(POTENCY_1.name);
    await expect(handoffLine).toContainText(STRIKING.name);
    await expect(handoffLine).toContainText(RETURNING.name);
    await expect(handoffLine).toContainText('24h handoff');
    await expect(handoffLine).toContainText(`${handoffCost} gp`);
    await expect(tray.getByText(`Check out · ${total} gp`)).toBeVisible();
    await expect(tray).toContainText(`Purse after purchase: ${GOLD - total} gp`);

    // ONE checkout commits both legs.
    await page.getByTestId('checkout').click();
    await expect(page.getByTestId('shop-toast')).toBeVisible();

    // One gold debit for the combined total.
    await session.expectSent(`cnmh_gold_${CHAR_ID}`, (v) => v === GOLD - total);
    // The work order records the whole staged array at the handoff price.
    await session.expectSent(
      `cnmh_runework_${CHAR_ID}`,
      (v) =>
        Array.isArray(v) &&
        v.some(
          (o: any) =>
            o?.weaponUid === UID_SWORD &&
            Array.isArray(o?.runes) && o.runes.length === 3 &&
            o?.price === handoffCost,
        ),
    );
    // The handed-over sword is an AUTHORED entry → pulled via the removed mask.
    await session.expectSent(`cnmh_removed_${CHAR_ID}`, (v) => Array.isArray(v) && v.includes(UID_SWORD));
    // The bought runestone lands as a lean re-resolvable ref entry.
    await session.expectSent(
      `cnmh_acquired_${CHAR_ID}`,
      (v) => Array.isArray(v) && v.some((e: any) => e?.ref === 'runestone' && e?.runeRef === GHOST_TOUCH.id),
    );

    // The sword became a benched ticket; the breastplate stays etchable (the
    // anchor that the board didn't simply empty).
    await expect(page.locator('[data-testid^="bench-"]')).toContainText(`Etching ${POTENCY_1.name}`);
    await expect(page.getByTestId(`gear-${UID_SWORD}`)).toHaveCount(0);
    await expect(armor).toBeVisible();

    // Back on the sheet: the order sits at the smith — ready 24h after
    // purchase AND back in this town (location already true; time missing).
    // A single shop here, so the header's Back chevron closes the storefront
    // directly (#943: no longer navbar-blocked).
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByTestId('shop-storefront')).toHaveCount(0);
    const panel = page.getByTestId('rune-work-panel');
    await expect(panel).toContainText('Etching (ready 24h after purchase)');
    await expect(panel.getByRole('button', { name: 'Collect' })).toBeDisabled();

    // Advance the MASTER CLOCK a day (a GM/peer edit) — the order derives
    // ready, and Collect credits the runed weapon back.
    await session.push('cnmh_clock_global', { ...CLOCK, day: CLOCK.day + 1 });
    await expect(panel).toContainText('Ready to collect');
    await panel.getByRole('button', { name: 'Collect' }).click();

    // THE runed-state write (applyRunesToGear): fundamentals SET tiers,
    // property runes APPEND — potency applied first so Returning had a slot.
    await session.expectSent(
      `cnmh_acquired_${CHAR_ID}`,
      (v) =>
        Array.isArray(v) &&
        v.some(
          (e: any) =>
            e?.runes?.potency === 1 &&
            e?.runes?.striking === STRIKING.tierKey &&
            Array.isArray(e?.runes?.property) && e.runes.property.includes(RETURNING.id),
        ),
    );
    await session.expectSent(`cnmh_runework_${CHAR_ID}`, (v) => Array.isArray(v) && v.length === 0);
    await expect(panel).toHaveCount(0);
  });

  // ── 3. Generative rune service + the loose-runestone path ──────────────────
  test('a weapon rune service expands property runes in-window (never fundamentals); a bought runestone is an inert inventory item', async ({
    page,
    seed,
  }) => {
    const CHAR_ID = 'e2e-rs-collector';
    const CHAR_NAME = 'E2E Stone Collector';
    const UID_SWORD = 'uid-rs-gen-longsword';
    const SHOP_ID = 'e2e-shop-generative';
    const GOLD = 100;

    await seed({
      lore: [location(), shopLore(SHOP_ID, 'Runes To Order')],
      item: [LONGSWORD],
      character: [
        baseCharacter(CHAR_ID, CHAR_NAME, {
          inventory: [{ ref: LONGSWORD.id, quantity: 1, uid: UID_SWORD }],
        }),
      ],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_campaign_global: { location: 'Forge Quarter', locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_shops_global: {
          [SHOP_ID]: {
            revealed: true,
            open: true,
            // ZERO stored runestones — everything on the Runes tab was
            // expanded from this offering (#982 G1/G3).
            wares: [{ runeService: true, targets: ['weapon'], maxLevel: 3 }],
          },
        },
        [`cnmh_gold_${CHAR_ID}`]: GOLD,
      },
    });

    await gotoSheet(page, CHAR_ID, CHAR_NAME);
    await openDowntimeShop(page);

    // The tab derives from the runeService ware (the other shopOffersRunes
    // stock signal).
    await page.getByRole('tab', { name: 'Runes' }).click();

    // In-window property runes (level ≤ 3) became runestone wares at rune + 3;
    // Ghost Touch (level 4) is outside the window, and fundamentals are NEVER
    // generatively offered (eligibleRunes is property-only).
    await expect(page.getByTestId(`ware-runestone-${RETURNING.id}`)).toContainText(`${stonePrice(RETURNING)} gp`);
    await expect(page.getByTestId(`ware-runestone-${AUTHORIZED.id}`)).toBeVisible();
    await expect(page.getByTestId(`ware-runestone-${GHOST_TOUCH.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`ware-runestone-${POTENCY_1.id}`)).toHaveCount(0);

    // Which the socket board agrees with: the longsword's potency slot has
    // nothing to offer here — fundamentals are hand-stock-only.
    const sword = page.getByTestId(`gear-${UID_SWORD}`);
    await sword.getByRole('button', { name: `fill Potency slot on ${LONGSWORD.name}` }).click();
    const picker = page.getByTestId(`picker-${UID_SWORD}`);
    await expect(picker).toContainText('None in stock here for this slot.');
    await picker.getByRole('button', { name: 'Cancel', exact: true }).click();

    // Buy the Returning runestone loose — the unattached-rune path (#801).
    await page.getByRole('button', { name: `add ${RETURNING.name} Runestone` }).click();
    await page.getByTestId('cart-bar').click();
    await page.getByTestId('checkout').click();
    await expect(page.getByTestId('shop-toast')).toBeVisible();

    await session.expectSent(`cnmh_gold_${CHAR_ID}`, (v) => v === GOLD - stonePrice(RETURNING));
    await session.expectSent(
      `cnmh_acquired_${CHAR_ID}`,
      (v) => Array.isArray(v) && v.some((e: any) => e?.ref === 'runestone' && e?.runeRef === RETURNING.id),
    );

    // It lands in inventory as an inert display item: named for the held rune,
    // no effect on the weapon it sits beside. A single shop here, so the
    // header's Back chevron closes the storefront directly (#943).
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByTestId('shop-storefront')).toHaveCount(0);
    await openPlayTab(page, 'Inventory');
    await expect(page.getByText(`${RETURNING.name} Runestone`)).toBeVisible();
  });
});
