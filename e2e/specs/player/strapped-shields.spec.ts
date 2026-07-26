/**
 * Strapped shields (bucklers arc: #1493 hand model, #1495 raise/activate gating,
 * #1497 inventory UI, #1499 content flag) — the player-facing end-to-end of a
 * shield that rides ON a hand instead of filling it.
 *
 * The whole point of the feature is a hand-occupancy edge case, so every box
 * here is about the *interaction* between the strap and the held slots:
 *   - Strap writes `strapHand` and the hand still takes a two-handed weapon.
 *   - Unstrap puts the buckler back in the carried pool.
 *   - Raise is gated on `strapUsable` (the buckler rule: hand empty, or holding
 *     a light non-weapon) and un-gates the moment the hand frees up.
 *   - With two strapped shields, the one whose hand allows use is the active one.
 *   - A raised shield lowers at the start of the wielder's NEXT turn — not on
 *     the intervening enemy turn, and not never.
 *   - Shield Block off a strapped shield does the Hardness split and marks the
 *     shield's HP on the shared item-HP overlay (#541).
 *
 * All state is seeded through mockSession (#293): the loadout map is the input,
 * the written `cnmh_loadout_*` / `cnmh_shieldraise_*` / `cnmh_itemhp_*` keys plus
 * the rendered hands surfaces are the assertion surface.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { encounterState, pcEntry, enemyEntry, readyTurnState } from '../../helpers/encounter';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';

const BUCKLER_UID = 'uid-buckler-1';
const SPARE_UID = 'uid-buckler-2';
const LONGSWORD_UID = 'uid-longsword-1';
const GREATAXE_UID = 'uid-greataxe-1';

const LOADOUT_KEY = `cnmh_loadout_${CHAR_ID}`;
const RAISE_KEY = `cnmh_shieldraise_${CHAR_ID}`;
const ITEMHP_KEY = `cnmh_itemhp_${CHAR_ID}`;
const TURNSTATE_KEY = `cnmh_turnstate_${CHAR_ID}`;

// `shield.strapped` is the content flag (#1499) that makes an item buckler-class:
// strap-only, never held, never occupying a slot.
const bucklerDoc = (id: string, name: string) => ({
  id,
  name,
  weight: 0.1,
  price: 1,
  shield: { hp: 20, hardness: 5, bonus: 1, brokenThreshold: 10, strapped: true },
});

// A one-handed weapon: `strikes` alone ties the hand up for the buckler rule
// (handAllowsStrapUse rejects any weapon regardless of Bulk).
const longswordDoc = {
  id: 'e2e-longsword',
  name: 'E2E Longsword',
  weight: 1,
  price: 1,
  strikes: { damage: '1d8 S', type: 'melee' },
};

// Two-handed: `usage` is what isTwoHanded reads, so the hand-setter offers
// "Both hands" and the grip lands as held2 across BOTH slots.
const greataxeDoc = {
  id: 'e2e-greataxe',
  name: 'E2E Greataxe',
  weight: 2,
  price: 1,
  usage: 'held in two hands',
  strikes: { damage: '1d12 S', type: 'melee' },
};

const character = (inventory: Array<{ ref: string; quantity: number; uid: string }>) => ({
  id: CHAR_ID,
  name: CHAR_NAME,
  level: 5,
  class: 'Fighter',
  maxHp: 50,
  ac: 18,
  inventory,
});

const openEncounterTab = (page: import('@playwright/test').Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();

const expectSheet = (page: import('@playwright/test').Page) =>
  expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });

// Encounter-hydration gate for a PC turn: the self-status bar's End turn button
// exists only once an ACTIVE, in-progress encounter has landed on this device
// and it's this character's turn. Interacting before that races the mount —
// the deck's Items segment is briefly the out-of-encounter one, and the turn
// tools row (Raise) isn't there at all.
const expectMyTurnLive = (page: import('@playwright/test').Page) =>
  expect(page.getByRole('button', { name: 'End turn' })).toBeVisible({ timeout: 15_000 });

// Off-turn equivalent: the stage replaces the action dial when someone else is
// acting, so its region is the "encounter is hydrated AND it isn't my turn" gate.
const expectOffTurnLive = (page: import('@playwright/test').Page) =>
  expect(page.getByRole('region', { name: 'Off-turn encounter stage' })).toBeVisible({
    timeout: 15_000,
  });

const openItemsSegment = (page: import('@playwright/test').Page) =>
  page.getByRole('tab', { name: 'Items' }).click();

// A PC-turn encounter at round 1 / index 0 — turnToken '1:0', which every
// turnstate seed below must match or TurnTrackerPanel's turn-begin sweep treats
// the mount as a fresh turn and rewrites turnstate (and lowers the shield)
// mid-test.
const myTurn = () =>
  encounterState({
    phase: 'in-progress',
    round: 1,
    currentTurnIndex: 0,
    order: [pcEntry(CHAR_ID, CHAR_NAME, 20), enemyEntry('E2E Goblin', 15)],
  });

test.describe('Strapped shields', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('strap a buckler: the hand keeps its two-handed grip, and unstrap returns it', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [bucklerDoc('e2e-buckler', 'E2E Buckler'), greataxeDoc],
      character: [
        character([
          { ref: 'e2e-buckler', quantity: 1, uid: BUCKLER_UID },
          { ref: 'e2e-greataxe', quantity: 1, uid: GREATAXE_UID },
        ]),
      ],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: myTurn(),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);
    await expectMyTurnLive(page);

    // --- Strap (1 Interact, its own flow — Swap never offers a buckler) ---
    await openItemsSegment(page);
    await page.getByTestId(`hands-strap-${BUCKLER_UID}-1`).click();

    // The loadout records the strap without ever making the buckler held.
    await session.expectSent(
      LOADOUT_KEY,
      (v) => v?.[BUCKLER_UID]?.strapHand === 1 && v?.[BUCKLER_UID]?.state === 'worn',
    );
    // The glance strip badges hand 1 — usable, because the hand is empty.
    const badge = page.getByTestId('hands-glance-strap-1');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('title', 'E2E Buckler strapped on');

    // --- The strapped hand is still FREE: a two-handed weapon goes in ---
    await page.getByRole('button', { name: 'Swap E2E Greataxe' }).click();
    await page.getByTestId(`hands-place-${GREATAXE_UID}`).click();
    await page.getByTestId('hands-confirm').click();

    // Both slots collapse into one 2H chip — the buckler never blocked it.
    await expect(page.getByTestId('hands-glance-both')).toContainText('E2E Greataxe');
    // …and the strap rides along, now flagged as unusable (a weapon in that
    // hand fails the buckler rule).
    await expect(page.getByTestId('hands-glance-strap-1')).toHaveAttribute(
      'title',
      'E2E Buckler strapped on — hand tied up',
    );

    // --- Unstrap returns it to the carried (Worn) pool ---
    await page.getByTestId(`hands-unstrap-${BUCKLER_UID}`).click();
    await expect(page.getByTestId('hands-glance-strap-1')).toBeHidden();
    // Its Items-segment row reads Worn again and re-offers the Strap buttons.
    await expect(page.getByTestId(`hands-row-${BUCKLER_UID}`)).toContainText('Worn');
    await expect(page.getByTestId(`hands-strap-${BUCKLER_UID}-1`)).toBeVisible();
  });

  test('raise gating: blocked while the strapped hand holds a weapon, live once it frees', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [bucklerDoc('e2e-buckler', 'E2E Buckler'), longswordDoc],
      character: [
        character([
          { ref: 'e2e-buckler', quantity: 1, uid: BUCKLER_UID },
          { ref: 'e2e-longsword', quantity: 1, uid: LONGSWORD_UID },
        ]),
      ],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: myTurn(),
        // Buckler strapped to hand 1, longsword held IN hand 1 → strapUsable false.
        [LOADOUT_KEY]: {
          [BUCKLER_UID]: { state: 'worn', strapHand: 1 },
          [LONGSWORD_UID]: { state: 'held1', hand: 1 },
        },
        [TURNSTATE_KEY]: readyTurnState('1:0'),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);
    await expectMyTurnLive(page);

    // The Raise chip is present but refuses — and says why.
    const raise = page.getByRole('button', { name: 'Raise a Shield' });
    await expect(raise).toBeVisible();
    await expect(raise).toBeDisabled();
    await expect(raise).toContainText('Hand full');

    // Free the hand (Sheathe is the held row's own 1-action Interact).
    await openItemsSegment(page);
    await page.getByRole('button', { name: 'Sheathe E2E Longsword' }).click();
    await expect(page.getByTestId('hands-glance-slot-1')).toContainText('Empty');

    // Same shield, same strap — only the hand changed, and now it raises.
    await expect(raise).toBeEnabled();
    await raise.click();
    await session.expectSent(
      RAISE_KEY,
      (v) => v?.raised === true && v?.uid === BUCKLER_UID,
    );
    await expect(page.getByRole('button', { name: 'Lower Shield' })).toBeVisible();
  });

  test('active-shield selection: the strapped shield whose hand is free is the one raised', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [
        bucklerDoc('e2e-buckler', 'E2E Buckler'),
        bucklerDoc('e2e-buckler-spare', 'E2E Spare Buckler'),
        longswordDoc,
      ],
      character: [
        character([
          { ref: 'e2e-buckler', quantity: 1, uid: BUCKLER_UID },
          { ref: 'e2e-buckler-spare', quantity: 1, uid: SPARE_UID },
          { ref: 'e2e-longsword', quantity: 1, uid: LONGSWORD_UID },
        ]),
      ],
    });

    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: myTurn(),
        // Two strapped shields: hand 1's is blocked by the longsword, hand 2's
        // is free. The blocked one comes FIRST in inventory order, so a naive
        // "first shield wins" would pick the wrong shield.
        [LOADOUT_KEY]: {
          [BUCKLER_UID]: { state: 'worn', strapHand: 1 },
          [SPARE_UID]: { state: 'worn', strapHand: 2 },
          [LONGSWORD_UID]: { state: 'held1', hand: 1 },
        },
        [TURNSTATE_KEY]: readyTurnState('1:0'),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);
    await expectMyTurnLive(page);

    // Both badges show, one blocked and one not.
    await expect(page.getByTestId('hands-glance-strap-1')).toHaveAttribute(
      'title',
      'E2E Buckler strapped on — hand tied up',
    );
    await expect(page.getByTestId('hands-glance-strap-2')).toHaveAttribute(
      'title',
      'E2E Spare Buckler strapped on',
    );

    // The usable one shadows the blocked one, so Raise is live and picks it.
    const raise = page.getByRole('button', { name: 'Raise a Shield' });
    await expect(raise).toBeEnabled();
    await raise.click();

    const raiseValue = await session.expectSent(RAISE_KEY, (v) => v?.raised === true);
    expect(raiseValue.uid).toBe(SPARE_UID);
  });

  test('auto-lower: the raise survives the enemy turn and expires at the start of the next own turn', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [bucklerDoc('e2e-buckler', 'E2E Buckler')],
      character: [character([{ ref: 'e2e-buckler', quantity: 1, uid: BUCKLER_UID }])],
    });

    const order = [pcEntry(CHAR_ID, CHAR_NAME, 20), enemyEntry('E2E Goblin', 15)];
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: myTurn(),
        [LOADOUT_KEY]: { [BUCKLER_UID]: { state: 'worn', strapHand: 1 } },
        [TURNSTATE_KEY]: readyTurnState('1:0'),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);
    await expectMyTurnLive(page);

    await page.getByRole('button', { name: 'Raise a Shield' }).click();
    await session.expectSent(RAISE_KEY, (v) => v?.raised === true);

    // Hand the turn to the goblin. "Until the start of your next turn" means the
    // raise MUST survive this. The Shield Block bar renders on any in-progress
    // turn while raised, so its presence is the visible proof — and it doubles
    // as the anchor for the negative assertion (the off-turn stage having
    // mounted is proof the turn change was processed).
    await session.push(
      'cnmh_encounter_global',
      encounterState({ phase: 'in-progress', round: 1, currentTurnIndex: 1, order }),
    );
    await expectOffTurnLive(page);
    await expect(page.getByRole('button', { name: 'Shield Block' })).toBeVisible();

    // Round 2, back to the fighter: turnToken '2:0' ≠ the persisted '1:0', so
    // the turn-begin sweep runs and the raised shield expires.
    await session.push(
      'cnmh_encounter_global',
      encounterState({ phase: 'in-progress', round: 2, currentTurnIndex: 0, order }),
    );
    await session.expectSent(RAISE_KEY, (v) => v?.raised === false);
    await expect(page.getByRole('button', { name: 'Shield Block' })).toBeHidden();
    // Raise is offered again — the shield is lowered, not gone.
    await expect(page.getByRole('button', { name: 'Raise a Shield' })).toBeEnabled();
  });

  test('shield block off a strapped buckler splits the damage and marks the shield', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [bucklerDoc('e2e-buckler', 'E2E Buckler')],
      character: [character([{ ref: 'e2e-buckler', quantity: 1, uid: BUCKLER_UID }])],
    });

    const session = await mockSession(page, {
      seed: {
        // The GOBLIN is acting: Shield Block is a reaction used on someone
        // else's turn, and an own-turn start would sweep the raise away.
        cnmh_encounter_global: encounterState({
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 1,
          order: [pcEntry(CHAR_ID, CHAR_NAME, 20), enemyEntry('E2E Goblin', 15)],
        }),
        [LOADOUT_KEY]: { [BUCKLER_UID]: { state: 'worn', strapHand: 1 } },
        // Already raised on the buckler — this test is about the block, not the raise.
        [RAISE_KEY]: { raised: true, uid: BUCKLER_UID, ts: 1 },
        // '1:0' is the fighter's OWN last turn token. It isn't their turn now, so
        // the sweep is inert either way; stating it keeps it inert if the panel
        // remounts.
        [TURNSTATE_KEY]: readyTurnState('1:0'),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await openEncounterTab(page);
    // #843: the existing shield-block spec fills this field with a bare `.fill`
    // that races the off-turn stage mount. Gate on the stage, then on the field
    // itself, before typing.
    await expectOffTurnLive(page);
    const damageField = page.getByLabel('Shield Block damage');
    await expect(damageField).toBeVisible();
    await damageField.fill('10');

    // Only now can the button be enabled — it also gates on a non-empty amount,
    // so asserting "enabled" before typing would hang on the wrong condition.
    const block = page.getByRole('button', { name: 'Shield Block' });
    await expect(block).toBeEnabled();
    await block.click();

    // Hardness 5 against 10 dealt: 5 prevented, 5 through to both the fighter
    // and the shield → 20 - 5 = 15 HP left. Fixed numbers, no dice involved.
    await session.expectSent(
      'cnmh_encounter_global',
      (v) =>
        Array.isArray(v?.log) &&
        v.log.some((e: any) => String(e.text).includes('Shield Blocked: 5 prevented, shield → 15 HP')),
    );
    // The mark lands on the shared item-HP overlay (#541), keyed by the
    // buckler's uid — the strapped shield is a normal item for durability.
    await session.expectSent(ITEMHP_KEY, (v) => v?.[BUCKLER_UID]?.hp === 15);
    // Using the reaction ends the raise, so the bar retires with it.
    await expect(damageField).toBeHidden();
  });

  test('drop-to-strap: dragging a buckler onto a hand slot straps it there', async ({
    page,
    seed,
  }) => {
    await seed({
      item: [bucklerDoc('e2e-buckler', 'E2E Buckler')],
      character: [character([{ ref: 'e2e-buckler', quantity: 1, uid: BUCKLER_UID }])],
    });

    // No encounter: the Inventory Hands strip is only interactive (a drop
    // target) outside encounter mode — in combat, hand changes cost an Interact
    // and must go through the deck's Items segment.
    const session = await mockSession(page);

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page);
    await page
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Inventory', exact: true })
      .click();

    const tile = page.getByTestId(`grid-cell-${BUCKLER_UID}`);
    await expect(tile).toBeVisible();
    const slot = page.getByTestId('hands-strip-slot-1');
    await expect(slot).toBeVisible();

    // Both ends of the gesture must be on screen at once: mouse coordinates are
    // viewport-relative, so a press aimed at a tile below the fold lands on
    // <html> and no pointerdown ever reaches the tile.
    await tile.scrollIntoViewIfNeeded();
    // The grid's DnD is pointer-based (dnd.jsx), not HTML5 drag-and-drop: a
    // mouse press arms immediately and a >6px move starts the drag, so we drive
    // it with discrete mouse steps. `dragTo` would fire a single move and the
    // provider would never see the drag begin.
    const from = (await tile.boundingBox())!;
    const to = (await slot.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
    // The provider tracks the hovered zone in React state, and `finish()` reads
    // that state — not the live pointer. Playwright dispatches moves faster than
    // React commits, so releasing immediately drops onto a stale (null) zone.
    // The zone's own valid-hover class is the signal that the commit landed.
    await expect(slot).toHaveClass(/dz-over/);
    await page.mouse.up();

    // Dropped onto a hand, a buckler STRAPS rather than filling the slot.
    await session.expectSent(LOADOUT_KEY, (v) => v?.[BUCKLER_UID]?.strapHand === 1);
    await expect(page.getByTestId('hands-strip-strap-1')).toContainText('E2E Buckler');
    // The slot itself stays empty — no tile moved into hand 1.
    await expect(page.getByTestId(`hands-tile-${BUCKLER_UID}`)).toHaveCount(0);
  });
});
