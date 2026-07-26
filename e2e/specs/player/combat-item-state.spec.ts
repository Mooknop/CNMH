/**
 * Combat item state (#1646, part of epic #1589) — the per-character item
 * overlays that change what a character can DO in an encounter, as opposed to
 * inventory bookkeeping:
 *
 *   cnmh_affixed_<id>   a talisman bound to a host item → offered mid-combat,
 *                       consumed when used (utils/affix.js)
 *   cnmh_attached_<id>  a shield attachment → its Strike rides the HELD shield
 *                       and needs no hand of its own (utils/shieldAttach.js)
 *   cnmh_itemhp_<id>    durability → a BROKEN weapon's Strike goes inactive
 *                       (utils/itemDurability.js + strikeUtils.resolveItemStrikes)
 *   cnmh_itemmode_<id>  a mode-switching item → the active mode's overrides
 *                       change the numbers its Strike resolves to (utils/itemModes.js)
 *   cnmh_itemeffects_<id>  an effect riding an item, swept when the MASTER CLOCK
 *                       passes its expiry (hooks/useEffectExpirySweep.jsx)
 *   cnmh_invested_<id>  attunement, capped at 10 (hooks/useInvested.jsx)
 *
 * `strapped-shields.spec.ts` owns strap/raise/auto-lower and the Shield-Block
 * mark on `cnmh_itemhp`; nothing here touches those. The shield here is only a
 * mount for an ATTACHMENT (a different mechanism), and the durability box is
 * about a broken WEAPON's Strike, which no other spec covers.
 *
 * NOT covered, deliberately: `cnmh_itembroken_<id>`. Despite its name it is not
 * the durability engine — it is the scepter/accessory-rune OVERLOAD overlay
 * (utils/itemBroken.js, hooks/useItemActivation.jsx), and its only surface is
 * the ItemModal activation card. It has no encounter presence at all, so the
 * "broken changes the numbers" consequence lives on `cnmh_itemhp` instead.
 *
 * Runs on chromium and mobile-chromium.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectOnSheet } from '../../helpers/sheet';
import {
  activeEncounter,
  deckBody,
  encounterState,
  enemyEntry,
  pcEntry,
  readyTurnState,
} from '../../helpers/encounter';

const CHAR_ID = 'e2e-quartermaster';
const CHAR_NAME = 'E2E Quartermaster';

const AFFIXED_KEY = `cnmh_affixed_${CHAR_ID}`;
const ATTACHED_KEY = `cnmh_attached_${CHAR_ID}`;
const CONSUMED_KEY = `cnmh_consumed_${CHAR_ID}`;
const INVESTED_KEY = `cnmh_invested_${CHAR_ID}`;
const ITEMEFFECTS_KEY = `cnmh_itemeffects_${CHAR_ID}`;
const ITEMHP_KEY = `cnmh_itemhp_${CHAR_ID}`;
const ITEMMODE_KEY = `cnmh_itemmode_${CHAR_ID}`;
const LOADOUT_KEY = `cnmh_loadout_${CHAR_ID}`;
const SAVEPROMPT_KEY = `cnmh_saveprompt_${CHAR_ID}`;
const TURNSTATE_KEY = `cnmh_turnstate_${CHAR_ID}`;

const PIN_UID = 'uid-cis-pin';
const ARMOR_UID = 'uid-cis-armor';
const SHIELD_UID = 'uid-cis-shield';
const SPIKES_UID = 'uid-cis-spikes';
const SWORD_UID = 'uid-cis-sword';
const CLUB_UID = 'uid-cis-club';
const BLADE_UID = 'uid-cis-blade';

// The app's default clock seed (GameDateContext DEFAULT_CLOCK), restated here
// because e2e never imports from src.
const CLOCK = { day: 5, month: 2, year: 4725, hour: 8, minute: 0, second: 0 };

// An absolute game-seconds stamp (utils/gameTime toGameSeconds — seconds since
// the start of 4700 AR) that sits comfortably BETWEEN any moment in 4725 and any
// moment in 4740: 4725 is roughly 7.9e8 seconds in, 4740 roughly 1.26e9. Stating
// the bound this way keeps the calendar arithmetic out of the spec — the sweep
// under test only cares which side of the number the clock is on.
const MID_5TH_MILLENNIUM_SECS = 1_000_000_000;

// ── Catalog content ──────────────────────────────────────────────────────────

// A save-bonus talisman modelled on the Sanitizing Pin. `traits: ['Talisman']`
// is what isTalisman keys off; `talisman.affixTo` scopes valid hosts; the
// `activation.effect` block is what SavePrompt reads to offer the opt-in.
const PIN_ITEM = {
  id: 'e2e-cis-pin',
  name: 'E2E Sanitizing Pin',
  weight: 0,
  price: 3,
  traits: ['Talisman', 'Consumable'],
  talisman: {
    affixTo: 'armor',
    activation: {
      cost: 'reaction',
      trigger: 'You attempt a save against a disease or poison.',
      effect: { kind: 'save-bonus', save: 'fortitude', bonus: 2, value: 'status', critFailToFail: true },
    },
  },
};

const ARMOR_ITEM = {
  id: 'e2e-cis-armor',
  name: 'E2E Scale Mail',
  weight: 2,
  price: 4,
  armor: { category: 'medium', acBonus: 4, dexCap: 2 },
};

const SHIELD_ITEM = {
  id: 'e2e-cis-shield',
  name: 'E2E Steel Shield',
  weight: 1,
  price: 2,
  shield: { hp: 20, hardness: 5, bonus: 2, brokenThreshold: 10 },
};

// A shield attachment: its own weapon (`strikes`) marked `attachment.to ===
// 'shield'`. isShieldAttachment excludes it from the ordinary inventory-weapon
// pass, so its Strike exists ONLY via attachmentStrikes — i.e. only while its
// host shield is held.
const SPIKES_ITEM = {
  id: 'e2e-cis-spikes',
  name: 'E2E Shield Spikes',
  weight: 0.1,
  price: 1,
  attachment: { to: 'shield' },
  strikes: {
    name: 'E2E Spike Strike',
    type: 'melee',
    damage: '1d6',
    damageType: 'piercing',
    traits: ['Attack', 'Melee'],
    actionCount: 1,
  },
};

// Explicit durability so the broken threshold is a stated number rather than
// the material table's derived one (steel thin: hardness 5 / hp 20 / BT 10).
const SWORD_ITEM = {
  id: 'e2e-cis-sword',
  name: 'E2E Test Sword',
  weight: 1,
  price: 1,
  durability: { hardness: 5, hp: 20, brokenThreshold: 10 },
  strikes: {
    name: 'E2E Sword Strike',
    type: 'melee',
    damage: '1d8',
    damageType: 'slashing',
    traits: ['Attack', 'Melee'],
    actionCount: 1,
  },
};

// The undamaged control in the broken-weapon test: same hands, same turn, so a
// deck that lost BOTH strikes can't pass as "broken hid one".
const CLUB_ITEM = {
  id: 'e2e-cis-club',
  name: 'E2E Test Club',
  weight: 1,
  price: 1,
  durability: { hardness: 3, hp: 12, brokenThreshold: 6 },
  strikes: {
    name: 'E2E Club Strike',
    type: 'melee',
    damage: '1d6',
    damageType: 'bludgeoning',
    traits: ['Attack', 'Melee'],
    actionCount: 1,
  },
};

// A mode-switching weapon (#1093). Each option's `overrides` are spread onto the
// item BEFORE strike derivation, so swapping the mode swaps the rune block —
// which changes the derived weapon name (buildWeaponName) and the damage dice
// (scaleDamageDice). That is the combat consequence a mode has to have.
const BLADE_ITEM = {
  id: 'e2e-cis-blade',
  name: 'E2E Gloom Blade',
  weight: 1,
  price: 1,
  strikes: {
    type: 'melee',
    damage: '1d8',
    damageType: 'slashing',
    traits: ['Attack', 'Melee'],
    actionCount: 1,
  },
  modes: {
    label: 'Light',
    default: 'dim',
    options: [
      { id: 'dim', label: 'Dim', overrides: { runes: {} } },
      { id: 'bright', label: 'Bright', overrides: { runes: { potency: 1, striking: 'striking' } } },
    ],
  },
};

// Ten Invested trinkets to fill the Attuned area, plus an eleventh that has to
// be refused. Cheap items with no mechanical surface — the cap is the subject.
const trinket = (n: number) => ({
  id: `e2e-cis-trinket-${n}`,
  name: `E2E Trinket ${n}`,
  weight: 0,
  price: 1,
  traits: ['Invested', 'Magical'],
});
const TRINKETS = Array.from({ length: 11 }, (_, i) => trinket(i + 1));
const trinketUid = (n: number) => `uid-cis-trinket-${n}`;

// ── Character + navigation ───────────────────────────────────────────────────

const character = (inventory: Array<{ ref: string; quantity: number; uid: string }>) => ({
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

const openTab = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name, exact: true })
    .click();

const segment = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });

/** Sheet loaded. Nothing encounter-specific — the investiture box has no combat. */
async function gotoSheet(page: Page) {
  await page.goto(`/character/${CHAR_ID}`);
  await expectOnSheet(page, CHAR_ID);
  await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });
}

/**
 * Sheet → Encounter tab → the PC's own turn has hydrated. `End turn` only
 * renders once an ACTIVE in-progress encounter has landed AND it is this
 * character's turn, so it is the cheapest gate against the pre-hydration render
 * where the deck exists but its tiles do not.
 */
async function gotoDeck(page: Page) {
  await gotoSheet(page);
  await openTab(page, 'Encounter');
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible({ timeout: 15_000 });
}

// Strikes-segment sections. A strike whose `active` is false (broken, or a
// weapon not in hand) is tiled as `inactive` and lands under "Not in hand"
// instead of "In hand" — buildActionCatalog's strikesHeld / strikesStowed split.
const inHand = (page: Page) => deckBody(page).locator('section[aria-label="In hand"]');
const notInHand = (page: Page) => deckBody(page).locator('section[aria-label="Not in hand"]');

test.describe('Combat item state', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  // ── cnmh_affixed ───────────────────────────────────────────────────────────

  test('affixed talisman: offered on a matching save, changes the total, and is consumed by one use', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [PIN_ITEM, ARMOR_ITEM],
      character: [
        character([
          { ref: PIN_ITEM.id, quantity: 1, uid: PIN_UID },
          { ref: ARMOR_ITEM.id, quantity: 1, uid: ARMOR_UID },
        ]),
      ],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        // The pin is already affixed to the scale mail — this box is about what
        // an affixed talisman does in combat, not about the 10-minute affix.
        [AFFIXED_KEY]: { [PIN_UID]: ARMOR_UID },
        [SAVEPROMPT_KEY]: { reqId: 's1', save: 'fortitude', dc: 20, effectName: 'E2E Blight', basic: false },
      },
    });

    await gotoDeck(page);

    const prompt = page.getByRole('region', { name: 'Fortitude save prompt' });
    await expect(prompt).toBeVisible();

    // The talisman is OFFERED because its effect matches the prompted save —
    // opt-in, since it only applies against the affliction.
    const optIn = prompt.getByRole('checkbox', { name: 'E2E Sanitizing Pin (+2)' });
    await expect(optIn).toBeVisible();

    // Baseline: resolve this prompt WITHOUT the pin. Its own total is whatever
    // the character's Fortitude modifier happens to be — the assertion below is
    // the DIFFERENCE, so the spec never has to restate the save math.
    await prompt.getByLabel('d20 roll').fill('10');
    await prompt.getByRole('button', { name: 'Submit Fortitude save' }).click();
    const plain = Number(await page.getByRole('status', { name: 'Save result' }).locator('.save-result-total').innerText());

    // A fresh prompt (new reqId) resets the local state, pin still affixed.
    await session.push(SAVEPROMPT_KEY, {
      reqId: 's2', save: 'fortitude', dc: 20, effectName: 'E2E Blight', basic: false,
    });
    await expect(prompt.getByLabel('d20 roll')).toBeVisible();

    await prompt.getByRole('checkbox', { name: 'E2E Sanitizing Pin (+2)' }).check();
    await prompt.getByLabel('d20 roll').fill('10');
    await prompt.getByRole('button', { name: 'Submit Fortitude save' }).click();

    // The combat consequence: same d20, same DC, +2 on the total.
    const withPin = Number(await page.getByRole('status', { name: 'Save result' }).locator('.save-result-total').innerText());
    expect(withPin).toBe(plain + 2);

    // …and using it consumes it: both overlays key on the talisman's UID since
    // #1659 (utils/affix.js deactivateTalisman).
    await session.expectSent(CONSUMED_KEY, (v) => v?.[PIN_UID] === 1);
    await session.expectSent(AFFIXED_KEY, (v) => v && !(PIN_UID in v));

    // One use, then gone: a third prompt no longer offers it. The d20 field is
    // the anchor — it only reappears once the new prompt has rendered, so the
    // absence below is a real absence rather than a not-yet.
    await session.push(SAVEPROMPT_KEY, {
      reqId: 's3', save: 'fortitude', dc: 20, effectName: 'E2E Blight', basic: false,
    });
    await expect(prompt.getByLabel('d20 roll')).toBeVisible();
    await expect(prompt.getByRole('checkbox', { name: /E2E Sanitizing Pin/ })).toHaveCount(0);
  });

  // ── cnmh_attached ──────────────────────────────────────────────────────────

  test('shield attachment: its Strike rides the held shield and needs no hand of its own', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [SHIELD_ITEM, SPIKES_ITEM, SWORD_ITEM],
      character: [
        character([
          { ref: SHIELD_ITEM.id, quantity: 1, uid: SHIELD_UID },
          { ref: SPIKES_ITEM.id, quantity: 1, uid: SPIKES_UID },
          { ref: SWORD_ITEM.id, quantity: 1, uid: SWORD_UID },
        ]),
      ],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        [ATTACHED_KEY]: { [SPIKES_UID]: SHIELD_UID },
        // BOTH hands are full — sword in 1, shield in 2. If the attachment
        // needed a hand of its own there would be none left for it. (`held2`
        // is a TWO-HANDED grip, not "hand 2": the hand is `hand`, and both
        // one-hand grips carry state `held1`.)
        [LOADOUT_KEY]: {
          [SWORD_UID]: { state: 'held1', hand: 1 },
          [SHIELD_UID]: { state: 'held1', hand: 2 },
        },
      },
    });

    await gotoDeck(page);
    await segment(page, 'Strikes').click();

    // The attachment's Strike is live alongside the sword's, with no free hand.
    await expect(inHand(page).getByRole('button', { name: 'E2E Spike Strike', exact: true })).toBeVisible();
    await expect(inHand(page).getByRole('button', { name: 'E2E Sword Strike', exact: true })).toBeVisible();
    await expect(page.getByTestId('hands-glance-slot-1')).toContainText('E2E Test Sword');
    await expect(page.getByTestId('hands-glance-slot-2')).toContainText('E2E Steel Shield');

    // Stow the shield (pushed as a peer edit — the hand UI is hands.spec's
    // subject, not this one). The attachment goes with it: isShieldAttachment
    // keeps it out of the ordinary inventory-weapon pass, so with no held host
    // its Strike does not exist AT ALL — not even as a stowed "Draw" row.
    await session.push(LOADOUT_KEY, {
      [SWORD_UID]: { state: 'held1', hand: 1 },
      [SHIELD_UID]: { state: 'worn' },
    });
    // Anchor: the shield leaving hand 2 is what the removal follows from.
    await expect(page.getByTestId('hands-glance-slot-2')).toContainText('Empty');
    await expect(deckBody(page).getByRole('button', { name: 'E2E Spike Strike', exact: true })).toHaveCount(0);
    // The sword is untouched — the deck did not simply empty.
    await expect(inHand(page).getByRole('button', { name: 'E2E Sword Strike', exact: true })).toBeVisible();
  });

  // ── cnmh_itemhp (durability) ───────────────────────────────────────────────

  test('broken weapon: its Strike stops being usable, and repairing it brings the Strike back', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [SWORD_ITEM, CLUB_ITEM],
      character: [
        character([
          { ref: SWORD_ITEM.id, quantity: 1, uid: SWORD_UID },
          { ref: CLUB_ITEM.id, quantity: 1, uid: CLUB_UID },
        ]),
      ],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        [LOADOUT_KEY]: {
          [SWORD_UID]: { state: 'held1', hand: 1 },
          [CLUB_UID]: { state: 'held1', hand: 2 },
        },
        // 8 ≤ the sword's broken threshold of 10 → broken. The club is untouched.
        [ITEMHP_KEY]: { [SWORD_UID]: { hp: 8 } },
      },
    });

    await gotoDeck(page);
    await segment(page, 'Strikes').click();

    // The held club proves the section itself is alive…
    await expect(inHand(page).getByRole('button', { name: 'E2E Club Strike', exact: true })).toBeVisible();
    // …while the equally-held sword is NOT offered: resolveItemStrikes marks a
    // broken weapon's strike `active: false`, which the deck files as unusable.
    await expect(inHand(page).getByRole('button', { name: 'E2E Sword Strike', exact: true })).toHaveCount(0);
    await expect(notInHand(page).getByRole('button', { name: 'E2E Sword Strike', exact: true })).toBeVisible();

    // Repair it above the threshold and the same Strike returns to the usable
    // section — the gate is live HP, not a one-way flag.
    await session.push(ITEMHP_KEY, { [SWORD_UID]: { hp: 20 } });
    await expect(inHand(page).getByRole('button', { name: 'E2E Sword Strike', exact: true })).toBeVisible();
    await expect(notInHand(page).getByRole('button', { name: 'E2E Sword Strike', exact: true })).toHaveCount(0);
  });

  // ── cnmh_itemmode ──────────────────────────────────────────────────────────

  test('item mode: switching the mode changes the Strike the weapon offers', async ({ page, seed }) => {
    await seed({
      item: [BLADE_ITEM],
      character: [character([{ ref: BLADE_ITEM.id, quantity: 1, uid: BLADE_UID }])],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: encounterState({
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 0,
          order: [pcEntry(CHAR_ID, CHAR_NAME, 20), enemyEntry('E2E Goblin', 10)],
        }),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        [LOADOUT_KEY]: { [BLADE_UID]: { state: 'held1', hand: 1 } },
        // No cnmh_itemmode seeded → the authored default ('dim') applies.
      },
    });

    await gotoDeck(page);
    // A strike tile shows "Tap a foe to target" INSTEAD of its stat line until a
    // foe is focused (ActionTile's cue priority), so focus one — the damage dice
    // are half the point of the mode swap.
    await page.getByRole('button', { name: 'Focus E2E Goblin' }).click();
    await segment(page, 'Strikes').click();

    // Default mode: an unruned blade — one damage die, no potency in the name.
    const dimStrike = inHand(page).getByRole('button', { name: 'E2E Gloom Blade Melee Strike', exact: true });
    await expect(dimStrike).toBeVisible();
    await expect(dimStrike).toContainText('1d8');

    // Switch modes from the item card. Hand changes are frozen in encounter but
    // the mode toggle is not, so the held blade's tile in the Inventory hands
    // strip is the way in.
    await openTab(page, 'Inventory');
    await page.getByTestId(`hands-tile-${BLADE_UID}`).click();
    await page.getByTestId('item-mode-bright').click();
    await session.expectSent(ITEMMODE_KEY, (v) => v?.[BLADE_UID] === 'bright');
    await page.getByRole('button', { name: 'Close' }).click();

    // Back in combat the Strike has re-derived off the new mode's overrides:
    // +1 potency in the derived name and a second damage die from Striking.
    await openTab(page, 'Encounter');
    await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible({ timeout: 15_000 });
    await segment(page, 'Strikes').click();
    // The focus survives the tab round-trip (it is per-character synced state),
    // so the stat line is still the tile's sub-line rather than the target cue.
    const brightStrike = inHand(page).getByRole('button', {
      name: '+1 Striking E2E Gloom Blade Melee Strike',
      exact: true,
    });
    await expect(brightStrike).toBeVisible();
    await expect(brightStrike).toContainText('2d8');
    // The old shape is gone, not merely joined by the new one.
    await expect(
      inHand(page).getByRole('button', { name: 'E2E Gloom Blade Melee Strike', exact: true }),
    ).toHaveCount(0);
  });

  // ── cnmh_itemeffects ───────────────────────────────────────────────────────

  test('item effect: rides the item until the master clock passes its expiry, then is swept', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [ARMOR_ITEM],
      character: [character([{ ref: ARMOR_ITEM.id, quantity: 1, uid: ARMOR_UID }])],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_clock_global: CLOCK,
        // `itemId` is itemKeyOf(item) — the catalog id, not the inventory uid.
        [ITEMEFFECTS_KEY]: [
          {
            id: 'fx-cis-1',
            itemId: ARMOR_ITEM.id,
            itemName: ARMOR_ITEM.name,
            label: 'Anticorrosion',
            source: 'E2E Anticorrosion Oil',
            appliedBy: CHAR_ID,
            expireAtSecs: MID_5TH_MILLENNIUM_SECS,
            ts: 1,
          },
        ],
      },
    });

    await gotoSheet(page);
    await openTab(page, 'Inventory');

    // Stamped onto the item (stampItemEffects → IconTile's ✨ badge).
    const badge = page.getByTestId(`grid-cell-${ARMOR_UID}`).getByLabel('Active effect');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'Anticorrosion');

    // The boundary is the MASTER CLOCK, not a turn: useEffectExpirySweep prunes
    // entries whose absolute game-seconds expiry the clock has passed. Nothing
    // else about the character changes.
    await session.push('cnmh_clock_global', { ...CLOCK, year: 4740 });

    await session.expectSent(ITEMEFFECTS_KEY, (v) => Array.isArray(v) && v.length === 0);
    await expect(badge).toBeHidden();
    // The item itself is untouched — only its effect was swept.
    await expect(page.getByTestId(`grid-cell-${ARMOR_UID}`)).toBeVisible();
  });

  // ── cnmh_invested ──────────────────────────────────────────────────────────

  test('investiture cap: the eleventh item is refused at the Attuned area', async ({ page, seed }) => {
    await seed({
      item: TRINKETS,
      character: [
        character(
          TRINKETS.map((t, i) => ({ ref: t.id, quantity: 1, uid: trinketUid(i + 1) })),
        ),
      ],
    });

    // Ten already invested → the cap is full. No encounter: the Loadout Grid is
    // only a drop target outside encounter mode.
    const session = await mockSession(page, {
      seed: {
        [INVESTED_KEY]: Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => [trinketUid(i + 1), true]),
        ),
      },
    });

    await gotoSheet(page);
    await openTab(page, 'Inventory');

    const attuned = page.getByTestId('attuned-area');
    await expect(attuned).toContainText('10 / 10 invested');

    // The eleventh is still in the bag; drag it at the full Attuned area.
    const tile = page.getByTestId(`grid-cell-${trinketUid(11)}`);
    await expect(tile).toBeVisible();
    await tile.scrollIntoViewIfNeeded();

    // Mouse coordinates are viewport-relative, so BOTH ends of the gesture must
    // be on screen at once — and a full Attuned area (ten slots) plus the bag
    // below it is taller than either viewport. Scrolling the source into view
    // parks the zone mostly above the fold, so claw back as much of it as the
    // source's remaining slack allows, then aim at the middle of the part that
    // IS visible rather than at the (off-screen) centre.
    const vh = page.viewportSize()!.height;
    const box = async () => ({
      from: (await tile.boundingBox())!,
      to: (await attuned.boundingBox())!,
    });
    let { from, to } = await box();
    const wantUp = Math.max(0, 60 - to.y);
    const slack = Math.max(0, vh - 8 - (from.y + from.height));
    const up = Math.min(wantUp, slack);
    if (up > 0) {
      // The sheet scrolls in its own container, not the window, so wheel over
      // the content rather than calling window.scrollBy (a no-op here).
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.wheel(0, -up);
      await expect
        .poll(async () => Math.round((await attuned.boundingBox())!.y))
        .toBeGreaterThan(Math.round(to.y));
      ({ from, to } = await box());
    }

    const yTop = Math.max(to.y + 6, 6);
    const yBottom = Math.min(to.y + to.height - 6, vh - 6);
    expect(yBottom, 'part of the Attuned drop zone must be on screen').toBeGreaterThan(yTop);
    const dropX = to.x + to.width / 2;
    const dropY = (yTop + yBottom) / 2;

    // Pointer DnD (dnd.jsx): press, a >6px move to arm the drag, then travel.
    // `dragTo` fires a single move and the provider never sees the drag begin.
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 });
    await page.mouse.move(dropX, dropY, { steps: 10 });

    // `att-bad` is AttunedArea's invalid-hover class — the zone's own statement
    // that `accepts` refused this item. Waiting for it also lets React commit
    // the hovered zone before the release (Playwright out-paces the commit, and
    // an immediate mouse.up drops onto a stale null zone).
    await expect(attuned).toHaveClass(/att-bad/);
    await page.mouse.up();

    // Refused: the count is unchanged and no eleventh slot appeared. The class
    // assertion above is the anchor that the gesture actually reached the zone,
    // so these absences are real rather than "the drop never happened".
    await expect(attuned).toContainText('10 / 10 invested');
    await expect(page.getByTestId(`attuned-tile-${trinketUid(11)}`)).toHaveCount(0);
    // …and the item stayed in the bag rather than vanishing into a half-drop.
    await expect(page.getByTestId(`grid-cell-${trinketUid(11)}`)).toBeVisible();
    // Nothing was written: useInvested.attune was never reached.
    expect(session.sent.some((m) => m.stateType === 'invested')).toBe(false);
  });
});
