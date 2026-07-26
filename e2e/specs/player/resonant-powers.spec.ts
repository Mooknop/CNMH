/**
 * Resonant item powers (#1668, part of epic #1589) — the two per-character
 * overlays that turn an item's *conditional* power on:
 *
 *   cnmh_wayfinder_<id>  { [wayfinderUid]: aeonStoneUid }  (utils/wayfinder.js)
 *   cnmh_veracious_<id>  { armed, ts }                     (hooks/useVeracious.jsx)
 *
 * Both are `syncKey(APP.X, charId)` keys — APP, not RELAY; neither is relayed to
 * the Foundry bridge. The literal `cnmh_*` strings appear in `src/` only inside
 * unit-test mocks, so the writers were found by grepping the CONSTANTS.
 *
 * ── What the code actually does ────────────────────────────────────────────
 *
 * WAYFINDER is a SOCKET overlay, not a "slotted" flag on a stone: it is keyed by
 * the *wayfinder's* uid, which is what gives "one stone per socket" for free.
 * `applyResonant` is the whole engine: a stone whose resonant power is ACTIVE —
 * slotted into a wayfinder that is worn AND invested, with the stone itself
 * invested, and only the first such binding per character — has its authored
 * `resonant` block HOISTED to the item's top level (`resonantMerge`), so the
 * ordinary readers pick it up with no reader changes:
 *
 *     resonant.resistance   → resistance     (worn-gear defense readers, #911)
 *     resonant.modifiers    → modifiers      (useWornGear passive bonuses)
 *     resonant.grantedSpells→ grantedSpells  (ItemModal innate spells, #914)
 *
 * So every assertion below is on the HOISTED result, never on the stored
 * mapping alone: a test that only checked the synced value would pass against a
 * completely disconnected engine.
 *
 * VERACIOUS is NOT a wayfinder-shaped thing at all — it is the Power Ring's
 * one-action activation (#967 R7). `useVeracious` derives the ring by finding
 * the first INVESTED `powerRing` in the effective inventory; `itemBonus` is 0
 * unless that ring exists, and `armed` is force-cleared (`armed && !!ring`) if
 * the ring stops being invested. It is display-only by design — the app never
 * rolls spell attacks — so its effect is: the boosted number on the Atk stat
 * (never the DC, which the hook header calls out explicitly), the imbued ring
 * runes' names, each rune's verbatim rider text, and the auto-DISARM that fires
 * when a Cast is committed in UseAbilityModal.
 *
 * ── Where the issue's sketch was wrong ─────────────────────────────────────
 *
 * The "persistent reminder — `usePersistentReminders` surfaces the resonant
 * power" box does not describe a reminder card. `usePersistentReminders` is a
 * GM-only END-OF-TURN LOG WRITER: at each turn transition it appends a line for
 * the outgoing combatant's persistent-damage instances, and folds worn-gear
 * resistance — resonant included, via its own imperative `applyResonant` call —
 * into that line's "resistance N (reduce, min 0)" note. It is covered here as
 * such (see the last wayfinder box), with the caveat that the local e2e stack
 * runs `GM_DEV_BYPASS`, so the player page reports `isGm` and therefore owns the
 * write; in production a player client would not.
 *
 * Runs on chromium and mobile-chromium.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { expectOnSheet } from '../../helpers/sheet';
import { activeEncounter, encounterState, pcEntry, enemyEntry, readyTurnState } from '../../helpers/encounter';
import { casterCharacter, snapshotItems, snapshotSpells } from '../../helpers/spellcasting';

// FACTOR-OUT CANDIDATE: the rune-catalog twin of helpers/spellcasting's
// `snapshotSpells` / `snapshotItems`. Seeding runes is deliberately avoided here
// (see the veracious describe) — this reads the bundled catalog the app itself
// falls back to, so the rider text asserted below can never drift from content.
const SNAPSHOT_RUNES = path.resolve(__dirname, '../../../src/data/snapshot/rune.json');
function snapshotRune(id: string): Record<string, any> {
  const all = JSON.parse(fs.readFileSync(SNAPSHOT_RUNES, 'utf8')) as Array<Record<string, any>>;
  const doc = all.find((r) => r.id === id);
  if (!doc) throw new Error(`snapshotRune: "${id}" not found in src/data/snapshot/rune.json`);
  return doc;
}

// ── Wayfinder fixture ────────────────────────────────────────────────────────

const CHAR_ID = 'e2e-stonebearer';
const CHAR_NAME = 'E2E Stonebearer';

const WAYFINDER_KEY = `cnmh_wayfinder_${CHAR_ID}`;
const INVESTED_KEY = `cnmh_invested_${CHAR_ID}`;
const TURNSTATE_KEY = `cnmh_turnstate_${CHAR_ID}`;

const WF_UID = 'uid-reso-wayfinder';
const AGATE_UID = 'uid-reso-agate';
const AZURE_UID = 'uid-reso-azure';
const EMBER_UID = 'uid-reso-ember';

// Real bundled content, pulled from the seed by id so the resonant blocks under
// test are exactly the ones production ships (#928 modelled every stone):
//   wayfinder                    — the socket host (Invested trait).
//   aeon-stone-agate-ellipsoid   — grantedSpells at the TOP level (augury,
//                                  always-on) + `resonant.note` only. The
//                                  always-on grant is the control that tells
//                                  "the resonant half switched off" apart from
//                                  "the card stopped rendering spells".
//   aeon-stone-azure-briolette   — `resonant.grantedSpells` (void warp): an
//                                  innate spell that exists ONLY while resonant.
const [WAYFINDER, AGATE, AZURE] = snapshotItems(
  'wayfinder',
  'aeon-stone-agate-ellipsoid',
  'aeon-stone-azure-briolette',
);
const AGATE_NOTE = (AGATE as any).resonant.note as string;

// The one hand-authored stone. No bundled aeon stone carries a resonant
// resistance whose `vs` descriptor is a PERSISTENT one — the Pearly White
// Spindle's is plain `void`, and `persistentVsType` asks for `persistent-void`
// — so the only stone that can prove the hoist reaches the DEFENSE readers is
// written here. `isAeonStone` keys off an `aeon-stone` id prefix (or an "aeon
// stone" name prefix), hence the id.
const EMBER = {
  id: 'aeon-stone-e2e-emberdrop',
  name: 'E2E Emberdrop Spindle',
  traits: ['Invested', 'Magical'],
  weight: 0,
  price: 100,
  description: 'E2E-only aeon stone. Resonant Power You gain resistance 3 to persistent fire damage.',
  resonant: { resistance: { amount: 3, type: 'persistent-fire' } },
};

const STONEBEARER = {
  id: CHAR_ID,
  name: CHAR_NAME,
  level: 8,
  class: 'Fighter',
  ancestry: 'Human',
  background: 'Soldier',
  maxHp: 80,
  ac: 22,
  abilities: { strength: 18, dexterity: 12, constitution: 14 },
  inventory: [
    { ref: WAYFINDER.id, quantity: 1, uid: WF_UID },
    { ref: AGATE.id, quantity: 1, uid: AGATE_UID },
    { ref: AZURE.id, quantity: 1, uid: AZURE_UID },
    { ref: EMBER.id, quantity: 1, uid: EMBER_UID },
  ],
};

// Everything attuned. The socket gate wants BOTH the host wayfinder and the
// stone invested, and the investiture cap is 10, so four is comfortably legal.
const ALL_INVESTED = {
  [WF_UID]: true,
  [AGATE_UID]: true,
  [AZURE_UID]: true,
  [EMBER_UID]: true,
};

const PC_ENTRY_ID = `e2e-${CHAR_ID}`; // matches activeEncounter()'s pc entryId

// ── Navigation / local locators ──────────────────────────────────────────────
// FACTOR-OUT CANDIDATES: `openTab` and `openCard` are copied verbatim from
// affix-attach.spec.ts / combat-item-state.spec.ts; an `e2e/helpers/inventory.ts`
// would own both (plus the attuned-vs-bag disjunction below).

const openTab = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name, exact: true })
    .click();

/**
 * Open an item's card by inventory uid. An INVESTED item leaves the bag grid
 * for the Attuned area (InventoryTab's `investedItems` split), so the tile can
 * be either testid — matching both keeps the caller from having to know which.
 */
const openCard = (page: Page, uid: string) =>
  page
    .locator(`[data-testid="attuned-tile-${uid}"], [data-testid="grid-cell-${uid}"]`)
    .click();

const closeCard = (page: Page) => page.getByRole('button', { name: 'Close', exact: true }).click();

/**
 * Slot a stone into the wayfinder from the stone's own card, then reopen it.
 * `doSlot`/`doUnslot` both call `onClose()`, so the card that stated the
 * relationship is gone by the time the write lands — every "and now the card
 * says…" assertion has to reopen it.
 */
async function slotFromCard(page: Page, stoneUid: string) {
  await openCard(page, stoneUid);
  await slotPanel(page).getByTestId(`slot-wayfinder-${WF_UID}`).click();
}

/** The aeon stone's "Wayfinder" card block (offer buttons / host + Remove). */
const slotPanel = (page: Page) => page.getByTestId('item-slot');
/** The wayfinder's "Aeon Stone Socket" card block. */
const socketPanel = (page: Page) => page.getByTestId('wayfinder-socket');
/** An item card's innate-spell cast chip, by the spell's display name. */
const castChip = (page: Page, spellName: string) =>
  page.getByTestId('granted-cast-spell').filter({ hasText: `Cast ${spellName}` });

async function gotoSheet(page: Page) {
  await page.goto(`/character/${CHAR_ID}`);
  await expectOnSheet(page, CHAR_ID);
  await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });
}

async function gotoInventory(page: Page) {
  await gotoSheet(page);
  await openTab(page, 'Inventory');
}

test.describe('Resonant powers — wayfinder aeon stones', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      spell: snapshotSpells('augury', 'void-warp'),
      item: [WAYFINDER, AGATE, AZURE, EMBER],
      character: [STONEBEARER],
    });
  });

  test('slotting a stone writes the socket overlay and hoists its resonant power', async ({ page }) => {
    const session = await mockSession(page, { seed: { [INVESTED_KEY]: ALL_INVESTED } });
    await gotoInventory(page);
    await openCard(page, AZURE_UID);

    // Invested but unslotted: the card offers the socket, and the resonant-only
    // innate spell does NOT exist. The offer button is the anchor that makes
    // that a real absence rather than an unrendered card.
    const panel = slotPanel(page);
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByTestId(`slot-wayfinder-${WF_UID}`)).toBeVisible();
    await expect(castChip(page, 'Void Warp')).toHaveCount(0);

    // The Interact: pick the wayfinder. THE write — keyed by the SOCKET's uid,
    // holding the stone's, which is what makes "one stone per socket" structural.
    await panel.getByTestId(`slot-wayfinder-${WF_UID}`).click();
    await session.expectSent(WAYFINDER_KEY, (v) => v?.[WF_UID] === AZURE_UID);

    // …and the engine ran: `resonant.grantedSpells` is hoisted onto the item, so
    // an innate spell that did not exist a moment ago is now castable off this
    // card. That is `resonantMerge`'s output, not the stored mapping.
    await openCard(page, AZURE_UID);
    await expect(panel).toContainText('resonant power active');
    await expect(castChip(page, 'Void Warp')).toBeVisible();

    // The socket reads the same relationship from the other end.
    await closeCard(page);
    await openCard(page, WF_UID);
    await expect(socketPanel(page)).toContainText(`${AZURE.name} — slotted; resonant power active.`);
  });

  test('unslotting clears the socket and the resonant power goes with it', async ({ page }) => {
    const session = await mockSession(page, {
      seed: { [INVESTED_KEY]: ALL_INVESTED, [WAYFINDER_KEY]: { [WF_UID]: AZURE_UID } },
    });
    await gotoInventory(page);
    await openCard(page, AZURE_UID);

    const panel = slotPanel(page);
    await expect(panel).toContainText('resonant power active');
    await expect(castChip(page, 'Void Warp')).toBeVisible();

    await panel.getByTestId('item-action-unslot').click();
    await session.expectSent(WAYFINDER_KEY, (v) => v && !(WF_UID in v));

    // The offer button coming back is the anchor: the card re-rendered in its
    // unslotted shape, so the missing innate spell is a real teardown.
    await openCard(page, AZURE_UID);
    await expect(panel.getByTestId(`slot-wayfinder-${WF_UID}`)).toBeVisible();
    await expect(castChip(page, 'Void Warp')).toHaveCount(0);
  });

  test('the socket needs BOTH invested: an uninvested host leaves the power inert', async ({ page }) => {
    // Slotted, and the STONE is invested — but the host wayfinder is not.
    const session = await mockSession(page, {
      seed: {
        [INVESTED_KEY]: { [AZURE_UID]: true },
        [WAYFINDER_KEY]: { [WF_UID]: AZURE_UID },
      },
    });
    await gotoInventory(page);

    // The socket states the shortfall in words rather than claiming the power.
    await openCard(page, WF_UID);
    const socket = socketPanel(page);
    await expect(socket).toBeVisible({ timeout: 10_000 });
    await expect(socket).toContainText(`${AZURE.name} — slotted.`);
    await expect(socket).toContainText('Invest both the wayfinder and the stone to activate the resonant power.');
    await closeCard(page);

    // From the stone's side: slotted, but nothing hoisted.
    await openCard(page, AZURE_UID);
    const panel = slotPanel(page);
    await expect(panel).toContainText(`Slotted into ${WAYFINDER.name}`);
    await expect(panel).not.toContainText('resonant power active');
    await expect(castChip(page, 'Void Warp')).toHaveCount(0);

    // Invest the host — nothing else changes — and the power comes on live.
    await session.push(INVESTED_KEY, { [AZURE_UID]: true, [WF_UID]: true });
    await expect(panel).toContainText('resonant power active');
    await expect(castChip(page, 'Void Warp')).toBeVisible();
  });

  test('one socket, one stone: a second stone displaces the first and takes over the power', async ({
    page,
  }) => {
    const session = await mockSession(page, {
      seed: { [INVESTED_KEY]: ALL_INVESTED, [WAYFINDER_KEY]: { [WF_UID]: AGATE_UID } },
    });
    await gotoInventory(page);

    // The agate is the resonant stone: its `resonant.note` — a power the app
    // can't auto-enforce — is a live callout, and its TOP-LEVEL augury grant
    // sits alongside it.
    await openCard(page, AGATE_UID);
    await expect(page.getByTestId('resonant-note')).toContainText(AGATE_NOTE);
    await expect(castChip(page, 'Augury')).toBeVisible();
    await closeCard(page);

    // Slot the other stone into the SAME socket. `slotStone` overwrites the
    // socket's entry, so the agate is displaced by the write itself.
    await slotFromCard(page, AZURE_UID);
    await session.expectSent(WAYFINDER_KEY, (v) => v?.[WF_UID] === AZURE_UID);
    await openCard(page, AZURE_UID);
    await expect(castChip(page, 'Void Warp')).toBeVisible();
    await closeCard(page);

    // Back on the agate: the RESONANT half is gone…
    await openCard(page, AGATE_UID);
    await expect(slotPanel(page).getByTestId(`slot-wayfinder-${WF_UID}`)).toBeVisible();
    await expect(page.getByTestId('resonant-note')).toHaveCount(0);
    // …while its always-on augury grant is untouched. The stone did not stop
    // rendering; only the hoisted block did.
    await expect(castChip(page, 'Augury')).toBeVisible();
  });

  test('the hoisted resonant resistance reaches the encounter defense readers', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        [INVESTED_KEY]: ALL_INVESTED,
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        cnmh_persistent_global: { [PC_ENTRY_ID]: [{ id: 'p1', dice: '1d6', type: 'fire' }] },
      },
    });

    await gotoSheet(page);
    await openTab(page, 'Encounter');

    // Baseline: the stone is INVESTED but unslotted, so nothing is hoisted and
    // the persistent chip states the bare instance. (An always-on `resistance`
    // block would already be reducing here — that is exactly the bug #928's
    // resonant gate exists to prevent.)
    const chip = page.locator('.pdc-badge');
    await expect(chip).toHaveAttribute('aria-label', `${CHAR_NAME}: 1d6 persistent fire`);

    await openTab(page, 'Inventory');
    await slotFromCard(page, EMBER_UID);
    await session.expectSent(WAYFINDER_KEY, (v) => v?.[WF_UID] === EMBER_UID);

    // Now the chip reduces. Nothing about the effect list, the encounter or the
    // instance changed — only the socket — and the number arrives through
    // applyResonant → useWornGear → useResolvedEffects → resistanceFor, a chain
    // that touches four files the ItemModal never renders.
    await openTab(page, 'Encounter');
    await expect(chip).toHaveAttribute(
      'aria-label',
      `${CHAR_NAME}: 1d6 persistent fire − resistance 3`,
    );
  });

  test('the end-of-turn persistent reminder folds the resonant resistance into its line', async ({
    page,
  }) => {
    // Two combatants so the turn can move off the PC: `usePersistentReminders`
    // logs for the OUTGOING entry at each transition.
    const order = [pcEntry(CHAR_ID, CHAR_NAME, 20), enemyEntry('E2E Goblin', 10)];
    const at = (round: number, idx: number) =>
      encounterState({ phase: 'in-progress', round, currentTurnIndex: idx, order });
    const REMINDER_ENTRY_ID = order[0].entryId;

    const session = await mockSession(page, {
      seed: {
        [INVESTED_KEY]: ALL_INVESTED,
        cnmh_encounter_global: at(1, 0),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        cnmh_persistent_global: { [REMINDER_ENTRY_ID]: [{ id: 'p1', dice: '1d6', type: 'fire' }] },
      },
    });

    await gotoSheet(page);
    await openTab(page, 'Encounter');
    // The chip proves the encounter has hydrated on this device before any turn
    // is pushed — otherwise the first transition races the mount.
    await expect(page.locator('.pdc-badge')).toBeVisible();

    const logLines = () =>
      session.sent
        .filter((m) => m.stateType === 'encounter')
        .flatMap((m) => ((m.value as any)?.log || []) as Array<{ text?: string }>)
        .map((e) => String(e?.text || ''));

    // End the PC's turn with the stone unslotted → a reminder line with NO
    // resistance note. Its existence is also the proof that this client owns
    // the GM-only writer (local stack: GM_DEV_BYPASS), so the absence of
    // "resistance" below is a real absence.
    await session.push('cnmh_encounter_global', at(1, 1));
    await expect
      .poll(() => logLines().filter((t) => t.includes(`${CHAR_NAME}: 1d6 persistent fire`)))
      .toEqual([`${CHAR_NAME}: 1d6 persistent fire — DC 15 flat check to end`]);

    // Slot the stone, then run the turn back around to the PC and off again.
    await openTab(page, 'Inventory');
    await slotFromCard(page, EMBER_UID);
    await session.expectSent(WAYFINDER_KEY, (v) => v?.[WF_UID] === EMBER_UID);
    await openTab(page, 'Encounter');
    await expect(page.locator('.pdc-badge')).toBeVisible();

    // Each transition needs its own commit: the watcher tracks ONE outgoing
    // combatant in a ref, so two pushes React batches together would resolve as a
    // single 1:1 → 2:1 hop and log for the enemy instead of the PC. "End turn"
    // renders only on the PC's own turn, which makes it the cheap per-hop anchor.
    const endTurn = page.getByRole('button', { name: 'End turn' });
    await session.push('cnmh_encounter_global', at(2, 0)); // back to the PC
    await expect(endTurn).toBeVisible();
    await session.push('cnmh_encounter_global', at(2, 1)); // the PC's turn ends again
    await expect(endTurn).toHaveCount(0);

    // The imperative path rebuilds the effective inventory off SessionContext and
    // calls applyResonant itself, so the same socket now shows up in the log line.
    await expect
      .poll(() => logLines().filter((t) => t.includes(`${CHAR_NAME}: 1d6 persistent fire`)))
      .toEqual([
        `${CHAR_NAME}: 1d6 persistent fire — DC 15 flat check to end`,
        `${CHAR_NAME}: 1d6 persistent fire, resistance 3 (reduce, min 0) — DC 15 flat check to end`,
      ]);
  });
});

// ── Veracious Spell (Power Ring) ─────────────────────────────────────────────

const CASTER_ID = 'e2e-ringcaster';
const CASTER_NAME = 'E2E Ring Caster';

const VERACIOUS_KEY = `cnmh_veracious_${CASTER_ID}`;
const CASTER_INVESTED_KEY = `cnmh_invested_${CASTER_ID}`;
const CASTER_TURNSTATE_KEY = `cnmh_turnstate_${CASTER_ID}`;

const RING_UID = 'uid-reso-power-ring';

// The real Power Ring. `entry.level` selects the grade variant
// (resolveInventoryItem → applyVariant), so level 11 is the Silver ring:
// itemBonus 2, two ring sockets. `entry.runes` overlays the socketed rune ids,
// which finishItem hydrates against the rune catalog.
const [POWER_RING] = snapshotItems('power-ring');
const RING_RUNE = snapshotRune('ring-immobilizing');
const RING_RIDER_TEXT = RING_RUNE.riders[0].text as string;

// NOTE — no `rune` seeding. ContentContext takes the DO's rune list INSTEAD of
// the bundle whenever it is non-empty, so seeding any rune would replace the
// whole catalog; here the ring's only socketed rune is a bundled one, and an
// unresolvable id is DROPPED by finishItem. Reading the doc out of the snapshot
// above keeps the asserted rider text pinned to production content anyway.
const RING_CASTER = casterCharacter({
  id: CASTER_ID,
  name: CASTER_NAME,
  level: 11,
  slots: { '1': 3 },
  repertoire: ['bless'],
  extra: {
    inventory: [
      {
        ref: POWER_RING.id,
        quantity: 1,
        uid: RING_UID,
        level: 11,
        runes: { property: [RING_RUNE.id] },
      },
    ],
  },
});

const veraciousControl = (page: Page) => page.getByTestId('veracious-control');
const veraciousToggle = (page: Page) => veraciousControl(page).getByRole('button');
const spellAtk = (page: Page) => page.locator('.spell-attack .stat-value');
const spellDc = (page: Page) => page.locator('.spell-dc .stat-value');

const readMod = async (loc: ReturnType<typeof spellAtk>) => Number((await loc.innerText()).trim());

/**
 * Deck → Spellbook → the Spells category. MagicModal renders SpellsHeader
 * inside the CATEGORY body, not on the category grid, so the launcher alone
 * leaves the veracious control unmounted.
 */
async function openSpellbookSpells(page: Page) {
  await page.getByRole('tab', { name: 'Spells' }).click();
  await page.getByRole('button', { name: 'Cast a Spell' }).click();
  await page.locator('.magic-category-btn', { hasText: 'Spells' }).click();
}

test.describe('Resonant powers — Power Ring Veracious Spell', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      spell: snapshotSpells('bless'),
      item: [POWER_RING],
      character: [RING_CASTER],
    });
  });

  test('the control needs the ring INVESTED, and arming boosts the Atk but never the DC', async ({
    page,
  }) => {
    const session = await mockSession(page);

    await page.goto(`/character/${CASTER_ID}`);
    await expectOnSheet(page, CASTER_ID);
    await expect(page.getByRole('heading', { name: CASTER_NAME, level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    await openTab(page, 'Spells');

    // The ring is in the bag but not attuned: `useVeracious` finds no ring, so
    // itemBonus is 0 and the control does not exist. The Atk stat is the anchor
    // — the header rendered, it just has nothing to offer.
    await expect(spellAtk(page)).toBeVisible({ timeout: 10_000 });
    const baseAtk = await readMod(spellAtk(page));
    const baseDc = await readMod(spellDc(page));
    await expect(veraciousControl(page)).toHaveCount(0);

    // Attune it — nothing else changes — and the activation appears.
    await session.push(CASTER_INVESTED_KEY, { [RING_UID]: true });
    await expect(veraciousToggle(page)).toHaveText('Arm Veracious Spell');
    await expect(veraciousToggle(page)).toHaveAttribute('aria-pressed', 'false');
    expect(await readMod(spellAtk(page))).toBe(baseAtk);

    await veraciousToggle(page).click();
    await session.expectSent(VERACIOUS_KEY, (v) => v?.armed === true);

    // The consequence: the Silver grade's +2 item bonus is layered onto the
    // DISPLAYED spell attack…
    await expect(veraciousToggle(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(veraciousToggle(page)).toHaveText('Veracious Spell armed · +2 to next spell attack');
    expect(await readMod(spellAtk(page))).toBe(baseAtk + 2);
    // …and pointedly NOT onto the DC. PF2e: the item bonus applies to the attack
    // roll only, so the hook keeps it out of calculateSpellStats, which also
    // derives the DC. A naive implementation would move both.
    expect(await readMod(spellDc(page))).toBe(baseDc);

    // The socketed ring rune is named, and its rider payload — the part a human
    // has to apply, since the app never rolls the attack — is surfaced verbatim.
    await expect(veraciousControl(page)).toContainText(`Imbued: ${RING_RUNE.name}`);
    await expect(veraciousControl(page)).toContainText(RING_RIDER_TEXT);

    // Un-attune while armed: `armed` is derived as `state.armed && !!ring`, so a
    // stale flag cannot boost a ring that is no longer invested. The whole
    // control goes with it and the Atk falls back.
    await session.push(CASTER_INVESTED_KEY, {});
    await expect(veraciousControl(page)).toHaveCount(0);
    expect(await readMod(spellAtk(page))).toBe(baseAtk);
  });

  test('committing a Cast spends the armed state', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        [CASTER_INVESTED_KEY]: { [RING_UID]: true },
        cnmh_encounter_global: activeEncounter(CASTER_ID, CASTER_NAME),
        [CASTER_TURNSTATE_KEY]: readyTurnState('1:0'),
        [VERACIOUS_KEY]: { armed: true, ts: 1 },
      },
    });

    await page.goto(`/character/${CASTER_ID}`);
    await expectOnSheet(page, CASTER_ID);
    await expect(page.getByRole('heading', { name: CASTER_NAME, level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    await openTab(page, 'Encounter');
    await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible({ timeout: 15_000 });

    // The spellbook hosts the same SpellsHeader the sheet's Spells tab does, so
    // the armed state is readable from inside the encounter. It lives in the
    // *Spells category*, not the category grid, so the category has to be opened.
    await openSpellbookSpells(page);
    await expect(veraciousToggle(page)).toHaveText('Veracious Spell armed · +2 to next spell attack');

    // Cast from inside the open spellbook. The repertoire ALSO renders in the
    // deck's Spells segment behind it, so `spell-card` is ambiguous page-wide —
    // scoping to the category dialog both disambiguates and keeps the veracious
    // control mounted across the cast, so its flip is observed in place.
    const book = page.getByRole('dialog', { name: 'Spells' });
    await book
      .getByTestId('spell-card')
      .filter({ has: page.locator('.spell-name', { hasText: 'Bless' }) })
      .locator('.spell-name')
      .click();
    await page.getByRole('button', { name: 'Cast Bless', exact: true }).click();
    await page.getByRole('button', { name: 'confirm-cast' }).click();

    // Every committed path through UseAbilityModal's cast handler consumes the
    // armed state — "the NEXT spell attack" is spent by the cast, not by a
    // separate acknowledgement. Re-arming stays a SpellsHeader action.
    await session.expectSent(VERACIOUS_KEY, (v) => v?.armed === false);
    await expect(veraciousToggle(page)).toHaveText('Arm Veracious Spell');
  });
});
