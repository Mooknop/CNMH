/**
 * Accessory runes (#1050, third-wave gap of epic #519) — the #1033 epic + the
 * #1044/#1045 base-gear auto-stock follow-up, from the ACCESSORY-HOST angle.
 * Weapon/armor sockets stay with #943, GM shop authoring with #944; the GM
 * rune-board etch of a seeded rune is already covered by
 * specs/gm/gm-gear-bindings.spec.ts ("a seeded rune is offered by — and
 * etchable from — the GM rune board").
 *
 * All rune content here is the BUNDLED catalog — deliberately un-seeded.
 * ContentContext takes the DO's `rune` collection INSTEAD of the bundle
 * whenever it is non-empty (see resonant-powers.spec.ts), so seeding any rune
 * would replace the whole catalog; reading the docs out of the snapshot keeps
 * the asserted names/prices/rider text pinned to production content.
 *
 * What each test owns:
 *  1. STOREFRONT ETCH FLOW (#1038/#1043): stage a bundled accessory rune into
 *     an owned host's accessory socket, checkout hands the host to the smith
 *     (cnmh_runework_ order + cnmh_removed_ mask + gold debit in one
 *     transaction), and collecting the ready order credits the inscribed host
 *     back (`runes.accessory` on the acquired entry). Max-one falls out
 *     structurally: the inscribed host leaves the etch list (inEtchList).
 *  2. INVESTED WORN BONUS (#1034/#1039): the etched rune's +1 item bonus to
 *     Intimidation exists ONLY while the host is invested — the number on the
 *     skill ring changes, not just a chip.
 *  3. COST-FREE ACTIVATION (#1035/#1040): a rune-granted `cost:'none'`
 *     actuated block fires from the item card against the frequency ledger
 *     alone — no slot sacrifice and no Overload surface (the scepter escape
 *     hatch is for spent SLOT costs; see item-overload.spec.ts).
 *  4. BASE-GEAR AUTO-STOCK (#1045): a SPECIFIC-target accessory rune service
 *     expands matching mundane hosts into the Wares grid as virtual wares —
 *     and only hosts an admitted rune actually fits (a level-3 window stocks
 *     clothing, not a dueling cape whose only runes are level 4+). Buying one
 *     lands the real base item.
 *  5. SHIELD-BLOCK RIDER (#1035/#1040): a Retaliation-runed shield states its
 *     onBlock rider while raised; a block folds the rider summary into the
 *     encounter log, consumes the raise (#1341), and ARMS the interactive
 *     follow-up — which must survive the auto-lower (the #1050-audit bug: the
 *     bar's raised-only mount guard unmounted it on the render that armed it).
 *     Driving it (attacker → rolled dice → Unleash) hands the GM a save
 *     request and ticks the rune's `${uid}:actuated` hourly free action.
 *
 * Runs on chromium and mobile-chromium (player surface).
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectOnSheet, expectSheet, openPlayTab } from '../../helpers/sheet';
import { encounterState, pcEntry, enemyEntry, readyTurnState, expectOffTurnLive } from '../../helpers/encounter';
import { snapshotItems } from '../../helpers/spellcasting';

// FACTOR-OUT CANDIDATE (second copy — resonant-powers.spec.ts has the first):
// the rune-catalog twin of helpers/spellcasting's snapshotItems. Reads the
// bundled catalog the app itself falls back to when the DO's rune collection is
// empty, so nothing asserted below can drift from production content.
const SNAPSHOT_RUNES = path.resolve(__dirname, '../../../src/data/snapshot/rune.json');
function snapshotRune(id: string): Record<string, any> {
  const all = JSON.parse(fs.readFileSync(SNAPSHOT_RUNES, 'utf8')) as Array<Record<string, any>>;
  const doc = all.find((r) => r.id === id);
  if (!doc) throw new Error(`snapshotRune: "${id}" not found in src/data/snapshot/rune.json`);
  return doc;
}

// Real bundled content. MENACING: level 3, 50 gp, usage ['clothing'], +1 item
// Intimidation. CALLED: level 3, usage ['light'], actuated cost:'none' once per
// hour. RETALIATION (Lesser): usage ['shield'], structured onBlock rider.
const MENACING = snapshotRune('menacing');
// A generative rune service sells each rune ON a blank etching stone — the
// runestone spine (#800) prices the ware at stone + rune, and the stone is
// destroyed in the transfer. RUNESTONE_BASE.price, restated (e2e never
// imports from src).
const STONE_PRICE = 3;
const MENACING_ETCH_PRICE = (MENACING.price as number) + STONE_PRICE;
const CALLED = snapshotRune('called');
const RETALIATION = snapshotRune('retaliation-lesser');

// Mundane hosts from the bundled item catalog (#1036 S3). fine-clothing:
// accessoryTags ['clothing'], 2 gp. dueling-cape: accessoryTags
// ['dueling-cape'], whose only usage-matching runes (Dragon's Breath) start at
// level 4 — the auto-stock negative case. cloak: weight 0.1 → derived 'light'
// tag, a Called host. steel-shield: hardness 5 / HP 20, the Retaliation host.
const [FINE_CLOTHING, ORDINARY_CLOTHING, DUELING_CAPE, CLOAK, STEEL_SHIELD] = snapshotItems(
  'fine-clothing',
  'ordinary-clothing',
  'dueling-cape',
  'cloak',
  'steel-shield',
);

const LOC_ID = 'e2e-loc-runemarket';

const location = () => ({
  id: LOC_ID, title: 'Rune Market', category: 'Location', summary: '', content: '',
  related: [], tags: [], visibility: 'revealed',
});
const shopLore = (id: string, title: string) => ({
  id, title, category: 'Location', summary: '', content: '',
  related: [], tags: [], parent: LOC_ID, visibility: 'revealed',
});

// The app's default clock seed (GameDateContext DEFAULT_CLOCK), restated
// because e2e never imports from src (same as combat-item-state.spec.ts).
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

test.describe('Accessory runes', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  // ── 1. Storefront etch flow (#1038/#1043) ──────────────────────────────────
  test('storefront etch flow: stage → checkout hands the host over → collect returns it inscribed', async ({
    page,
    seed,
  }) => {
    const CHAR_ID = 'e2e-ar-shopper';
    const CHAR_NAME = 'E2E Rune Shopper';
    const UID_FINE = 'uid-ar-fine';
    const UID_ORD = 'uid-ar-ord';
    const SHOP_ID = 'e2e-shop-tailor';

    await seed({
      lore: [location(), shopLore(SHOP_ID, 'The Inscribed Hem')],
      item: [FINE_CLOTHING, ORDINARY_CLOTHING],
      character: [
        baseCharacter(CHAR_ID, CHAR_NAME, {
          inventory: [
            { ref: FINE_CLOTHING.id, quantity: 1, uid: UID_FINE },
            { ref: ORDINARY_CLOTHING.id, quantity: 1, uid: UID_ORD },
          ],
        }),
      ],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_campaign_global: { location: 'Rune Market', locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_clock_global: CLOCK,
        // A generative accessory rune SERVICE — no hand-stocked runes at all, so
        // everything the picker offers came through eligibleRunes off the
        // bundled catalog (#1037 S4 wiring).
        cnmh_shops_global: {
          [SHOP_ID]: {
            revealed: true,
            open: true,
            wares: [{ runeService: true, targets: ['accessory'], maxLevel: 3 }],
          },
        },
        [`cnmh_gold_${CHAR_ID}`]: 100,
      },
    });

    await gotoSheet(page, CHAR_ID, CHAR_NAME);
    await openDowntimeShop(page);
    await page.getByRole('tab', { name: 'Runes' }).click();

    // Both mundane hosts are on the etch board — accessory-ONLY hosts appear
    // exactly because this shop stocks runes they could take (inEtchList).
    await expect(page.getByTestId(`gear-${UID_FINE}`)).toBeVisible();
    await expect(page.getByTestId(`gear-${UID_ORD}`)).toBeVisible();

    // Open the fine clothing's single accessory socket and etch Menacing. The
    // option existing at all proves the generative offering admitted an
    // accessory-target rune and matched it to this host's usage tags.
    await page.getByRole('button', { name: `fill Accessory slot on ${FINE_CLOTHING.name}` }).click();
    const picker = page.getByTestId(`picker-${UID_FINE}`);
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: `etch ${MENACING.name}` }).click();

    // Staged, not paid: the pending note names the price (stone + rune) and
    // the 24h handoff.
    await expect(page.getByTestId(`staged-${UID_FINE}`)).toContainText(`${MENACING_ETCH_PRICE} gp`);

    // Checkout commits the handoff: ONE transaction debits the rune's price,
    // records the work order, and pulls the host from the inventory.
    await page.getByTestId('cart-bar').click();
    await expect(page.getByTestId(`handoff-line-${UID_FINE}`)).toContainText(MENACING.name);
    await page.getByTestId('checkout').click();
    await expect(page.getByTestId('shop-toast')).toBeVisible();

    await session.expectSent(`cnmh_gold_${CHAR_ID}`, (v) => v === 100 - MENACING_ETCH_PRICE);
    await session.expectSent(
      `cnmh_runework_${CHAR_ID}`,
      (v) => Array.isArray(v) && v.some((o: any) => o?.weaponUid === UID_FINE && o?.runeName === MENACING.name),
    );
    // The host is an AUTHORED entry, so the pull is a cnmh_removed_ mask.
    await session.expectSent(
      `cnmh_removed_${CHAR_ID}`,
      (v) => Array.isArray(v) && v.includes(UID_FINE),
    );

    // The handed-over host became a benched ticket; the other host stays on the
    // board (the anchor that the list didn't simply empty).
    await expect(page.locator('[data-testid^="bench-"]')).toContainText(`Etching ${MENACING.name}`);
    await expect(page.getByTestId(`gear-${UID_FINE}`)).toHaveCount(0);
    await expect(page.getByTestId(`gear-${UID_ORD}`)).toBeVisible();

    // Back on the sheet: the order is at the smith, not yet collectable —
    // ready 24h after purchase AND back in this town (both already true for
    // the location; time is what's missing).
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shop-storefront')).toHaveCount(0);
    const panel = page.getByTestId('rune-work-panel');
    await expect(panel).toContainText('Etching (ready 24h after purchase)');
    await expect(panel.getByRole('button', { name: 'Collect' })).toBeDisabled();

    // Advance the MASTER CLOCK a day (a GM/peer edit) — the order derives ready
    // with no timer, and Collect credits the inscribed host back.
    await session.push('cnmh_clock_global', { ...CLOCK, day: CLOCK.day + 1 });
    await expect(panel).toContainText('Ready to collect');
    await panel.getByRole('button', { name: 'Collect' }).click();

    // THE etched-state write: a fresh acquired entry whose runes.accessory is
    // the rune id (applyRune's stored shape — the resolver re-inlines the doc).
    await session.expectSent(
      `cnmh_acquired_${CHAR_ID}`,
      (v) => Array.isArray(v) && v.some((e: any) => e?.runes?.accessory === MENACING.id),
    );
    await session.expectSent(`cnmh_runework_${CHAR_ID}`, (v) => Array.isArray(v) && v.length === 0);
    await expect(panel).toHaveCount(0);

    // Max-one, structurally: reopening the shop, the inscribed clothing is OFF
    // the etch board (an inscribed accessory-only host has nothing left to
    // etch — inEtchList), while the un-runed ordinary clothing still shows.
    await openDowntimeShop(page);
    await page.getByRole('tab', { name: 'Runes' }).click();
    await expect(page.getByTestId(`gear-${UID_ORD}`)).toBeVisible();
    await expect(page.locator('.ps-gear')).toHaveCount(1);
  });

  // ── 2. Invested worn bonus (#1034/#1039) ───────────────────────────────────
  test('invested worn bonus: the etched rune boosts the skill number only while the host is invested', async ({
    page,
    seed,
  }) => {
    const CHAR_ID = 'e2e-ar-wearer';
    const CHAR_NAME = 'E2E Rune Wearer';
    const UID = 'uid-ar-menacing';

    await seed({
      item: [FINE_CLOTHING],
      character: [
        baseCharacter(CHAR_ID, CHAR_NAME, {
          // `runes` on the ENTRY overlays the catalog base (resolveInventoryItem),
          // and finishItem inlines the bundled Menacing doc from the id.
          inventory: [{ ref: FINE_CLOTHING.id, quantity: 1, uid: UID, runes: { accessory: MENACING.id } }],
        }),
      ],
    });
    const session = await mockSession(page);

    await gotoSheet(page, CHAR_ID, CHAR_NAME);

    // Stats tab (default) → the Charisma dial node hosts the Intimidation ring.
    await page.getByRole('button', { name: /^Charisma/ }).click();
    const ring = page.getByRole('button', { name: /^Intimidation,/ }).locator('.ring');
    await expect(ring).toBeVisible();

    // Baseline: Cha +0, untrained, NOT invested — the inscription grants the
    // Invested trait (isInvestable ORs in runes.accessory), so the worn-gear
    // spine withholds the bonus. No adjusted value renders at all.
    await expect(ring).toHaveText('+0');
    await expect(ring.locator('.pd-bonus')).toHaveCount(0);

    // Invest the host (a peer edit — the attune gesture itself is
    // combat-item-state.spec.ts's subject) and the NUMBER changes: +1 item
    // bonus, through itemModifiers → useWornGear → the effect engine.
    await session.push(`cnmh_invested_${CHAR_ID}`, { [UID]: true });
    await expect(ring.locator('.pd-bonus')).toHaveText('+1');

    // The item card agrees: derived rune-prefixed name + the attunement chip.
    await openPlayTab(page, 'Inventory');
    await page
      .locator(`[data-testid="attuned-tile-${UID}"], [data-testid="grid-cell-${UID}"]`)
      .click();
    await expect(page.getByRole('heading', { name: `${MENACING.name} ${FINE_CLOTHING.name}` })).toBeVisible();
    await expect(page.getByTestId('item-invested-chip')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    // Un-invest — nothing else changes — and the bonus goes with it. The gate
    // is live investiture, not a one-way stamp.
    await openPlayTab(page, 'Stats');
    await page.getByRole('button', { name: /^Charisma/ }).click();
    await session.push(`cnmh_invested_${CHAR_ID}`, {});
    await expect(ring).toHaveText('+0');
    await expect(ring.locator('.pd-bonus')).toHaveCount(0);
  });

  // ── 3. Cost-free activation (#1035/#1040) ──────────────────────────────────
  test('cost-free activation: fires against the frequency ledger only, with no slot or Overload surface', async ({
    page,
    seed,
  }) => {
    const CHAR_ID = 'e2e-ar-caller';
    const CHAR_NAME = 'E2E Rune Caller';
    const UID = 'uid-ar-called';
    const FREQ_KEY = `cnmh_freq_${CHAR_ID}`;

    await seed({
      item: [CLOAK],
      character: [
        baseCharacter(CHAR_ID, CHAR_NAME, {
          // The cloak's 0.1 weight derives the 'light' usage tag Called wants.
          inventory: [{ ref: CLOAK.id, quantity: 1, uid: UID, runes: { accessory: CALLED.id } }],
        }),
      ],
    });
    const session = await mockSession(page);

    await gotoSheet(page, CHAR_ID, CHAR_NAME);
    await openPlayTab(page, 'Inventory');

    // The activation card is sourced from the INSCRIBED RUNE's actuated block
    // (the host authors none), and it is the free variant: one Activate
    // button, no rank buttons (the anchor that this isn't the slot surface).
    await page.getByTestId(`grid-cell-${UID}`).click();
    await expect(page.getByTestId('item-actuated')).toBeVisible();
    await expect(page.getByTestId('item-actuated')).toContainText(CALLED.actuated.name);
    await expect(page.getByTestId('item-actuated')).toContainText(`Frequency: ${CALLED.actuated.frequency}`);
    await expect(page.getByTestId('actuated-activate-free')).toBeVisible();
    await expect(page.locator('[data-testid^="actuated-activate-rank-"]')).toHaveCount(0);

    // Fire it. The ONLY cost is a frequency-ledger record under the same
    // `${uid}:actuated` key the shield-block rider shares (#1033 S2).
    await page.getByTestId('actuated-activate-free').click();
    await expect(page.getByTestId('item-actuated')).toBeHidden();
    await session.expectSent(
      FREQ_KEY,
      (v) => Array.isArray(v?.[`${UID}:actuated`]) && v[`${UID}:actuated`].length === 1,
    );

    // Spent (once per hour): the card refuses with the clock note, and — unlike
    // a spent SLOT cost — offers NO Overload escape hatch and never breaks.
    await page.getByTestId(`grid-cell-${UID}`).click();
    await expect(page.getByTestId('actuated-unavailable')).toContainText(
      `Used — ${CALLED.actuated.frequency}; the clock frees it up.`,
    );
    await expect(page.getByTestId('actuated-activate-free')).toHaveCount(0);
    await expect(page.locator('[data-testid^="actuated-overload-rank-"]')).toHaveCount(0);
    await expect(page.getByTestId('item-actuated-broken')).toHaveCount(0);
  });

  // ── 4. Base-gear auto-stock (#1045) ────────────────────────────────────────
  test('base-gear auto-stock: a specific-target rune service stocks matching hosts, and only those', async ({
    page,
    seed,
  }) => {
    const CHAR_ID = 'e2e-ar-buyer';
    const CHAR_NAME = 'E2E Host Buyer';
    const SHOP_ID = 'e2e-shop-outfitter';

    await seed({
      lore: [location(), shopLore(SHOP_ID, 'The Fitted Cloak')],
      item: [FINE_CLOTHING, DUELING_CAPE],
      character: [baseCharacter(CHAR_ID, CHAR_NAME)],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_campaign_global: { location: 'Rune Market', locationLoreId: LOC_ID },
        cnmh_playmode_global: 'downtime',
        cnmh_shops_global: {
          [SHOP_ID]: {
            revealed: true,
            open: true,
            // ZERO stored item wares — anything in the Wares grid was expanded
            // from this offering (#1044: virtual wares, nothing written back).
            wares: [{ runeService: true, targets: ['accessory'], maxLevel: 3 }],
          },
        },
        [`cnmh_gold_${CHAR_ID}`]: 10,
      },
    });

    await gotoSheet(page, CHAR_ID, CHAR_NAME);
    await openDowntimeShop(page);

    // The clothing is auto-stocked: level-3 accessory runes (Menacing,
    // Presentable) fit its 'clothing' tag. The dueling cape is NOT — its only
    // usage-matching runes (Dragon's Breath) start at level 4, outside this
    // offering's window. The visible tile anchors the absence.
    await expect(page.getByTestId(`ware-${FINE_CLOTHING.id}`)).toBeVisible();
    await expect(page.getByTestId(`ware-${DUELING_CAPE.id}`)).toHaveCount(0);

    // And it is a REAL purchasable ware: buy it, gold moves, the base item
    // lands on the acquired overlay.
    await page.getByRole('button', { name: `add ${FINE_CLOTHING.name}` }).click();
    await page.getByTestId('cart-bar').click();
    await page.getByTestId('checkout').click();
    await expect(page.getByTestId('shop-toast')).toBeVisible();

    await session.expectSent(`cnmh_gold_${CHAR_ID}`, (v) => v === 10 - (FINE_CLOTHING.price as number));
    await session.expectSent(
      `cnmh_acquired_${CHAR_ID}`,
      (v) => Array.isArray(v) && v.some((e: any) => (e?.id ?? e?.ref) === FINE_CLOTHING.id),
    );
  });

  // ── 5. Shield-block rider (#1035/#1040) ────────────────────────────────────
  test('retaliation rider: a block logs the rider, arms the follow-up past the auto-lower, and Unleash requests the save', async ({
    page,
    seed,
  }) => {
    const CHAR_ID = 'e2e-ar-blocker';
    const CHAR_NAME = 'E2E Rune Blocker';
    const UID = 'uid-ar-shield';

    await seed({
      item: [STEEL_SHIELD],
      character: [
        baseCharacter(CHAR_ID, CHAR_NAME, {
          inventory: [{ ref: STEEL_SHIELD.id, quantity: 1, uid: UID, runes: { accessory: RETALIATION.id } }],
        }),
      ],
    });
    const session = await mockSession(page, {
      seed: {
        // Enemy's turn: Shield Block is a reaction on another creature's turn,
        // and a turn-start reset would lower a raised shield (damage.spec.ts).
        cnmh_encounter_global: encounterState({
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 1,
          order: [pcEntry(CHAR_ID, CHAR_NAME, 18), enemyEntry('E2E Goblin', 15)],
        }),
        [`cnmh_loadout_${CHAR_ID}`]: { [UID]: { state: 'held1', hand: 1 } },
        [`cnmh_shieldraise_${CHAR_ID}`]: { raised: true, uid: UID, ts: 1 },
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
      },
    });

    await gotoSheet(page, CHAR_ID, CHAR_NAME);
    await openPlayTab(page, 'Encounter');
    await expectOffTurnLive(page);

    // While the runed shield is raised, the bar states the rider — name and
    // the authored summary, verbatim from the bundled doc.
    const rider = page.getByTestId('shieldblock-rune-rider');
    await expect(rider).toContainText(RETALIATION.name);
    await expect(rider).toContainText(RETALIATION.onBlock.summary);

    const damage = page.getByLabel('Shield Block damage');
    await damage.fill('10');
    const block = page.getByRole('button', { name: 'Shield Block', exact: true });
    await expect(block).toBeEnabled();
    await block.click();

    // The block's log line folds the rune's follow-up in alongside the
    // Hardness split (10 dealt − hardness 5 → 5 prevented, shield 20 → 15 HP).
    await session.expectSent(
      'cnmh_encounter_global',
      (v) =>
        Array.isArray(v?.log) &&
        v.log.some(
          (e: any) =>
            String(e.text).includes('Shield Blocked: 5 prevented, shield → 15 HP') &&
            String(e.text).includes(`${RETALIATION.name}: ${RETALIATION.onBlock.summary}`),
        ),
    );
    await session.expectSent(`cnmh_itemhp_${CHAR_ID}`, (v) => v?.[UID]?.hp === 15);

    // The block consumed the raise (#1341) — the block controls went down with
    // it — but the ARMED follow-up outlived the auto-lower (the #1050-audit
    // regression: the bar's raised-only mount guard used to unmount it on the
    // very render that armed it, orphaning the local `armed` state).
    const followup = page.getByTestId('shieldblock-rune-followup');
    await expect(followup).toBeVisible();
    await expect(page.getByLabel('Shield Block damage')).toHaveCount(0);

    // Drive it: pick the attacker, enter the rolled 4d4, Unleash.
    await followup.getByLabel(`${RETALIATION.name} target`).selectOption('e2e-enemy-e2e-goblin');
    await followup.getByLabel(`${RETALIATION.name} rolled damage`).fill('9');
    await followup.getByRole('button', { name: `use ${RETALIATION.name}` }).click();

    // The GM gets the save request with the authored parameters and the rolled
    // total riding along (RequestedSaves derives per-degree damage from it).
    await session.expectSent(
      'cnmh_encounter_global',
      (v) =>
        Array.isArray(v?.saveRequests) &&
        v.saveRequests.some(
          (r: any) =>
            r?.abilityName === RETALIATION.name &&
            r?.save === RETALIATION.onBlock.save &&
            r?.dc === RETALIATION.onBlock.dc &&
            r?.basic === true &&
            r?.damage?.entered === 9 &&
            r?.targets?.[0]?.name === 'E2E Goblin',
        ),
    );
    // …and the rune's free action is spent from the SAME hourly ledger key the
    // item modal's activation card ticks (#1033 S2).
    await session.expectSent(
      `cnmh_freq_${CHAR_ID}`,
      (v) => Array.isArray(v?.[`${UID}:actuated`]) && v[`${UID}:actuated`].length === 1,
    );
    // Fired → cleared: with the raise gone and the arm spent, the bar is done.
    await expect(followup).toHaveCount(0);
  });
});
