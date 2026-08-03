/**
 * Casting resources — staff charges, wand daily uses, spell counters (#1644).
 *
 * `spell-consumption.spec.ts` proves a wand/staff/scroll `spellRef` resolves its
 * DISPLAY NAME in the right Magic sub-view. It never spends anything. This spec
 * owns the economy: the pools behind an item-sourced cast and the daily pass
 * that refills them.
 *
 * Keys under test (all built with `syncKey(APP.X, charId)` — the literal
 * `cnmh_*` strings appear in `src/` only inside unit-test mocks):
 *   cnmh_staff_<id>         staff charges SPENT (an integer, not remaining)
 *   cnmh_staffprep_<id>     { staffId, charges } — the day's prepared staff
 *   cnmh_wands_<id>         wandKey -> 'available' | 'used' | 'overcharged'
 *   cnmh_spellcounters_<id> per-spell counter ledger (Bless emanation radius)
 *
 * The single most load-bearing thing to know here (and the reason the issue's
 * "staff charge spend" box cannot be written naively): **a staff has no charges
 * of its own**. `useCharacter` derives `staff.charges.max` ENTIRELY from
 * `cnmh_staffprep_<id>` — with nothing prepared, max is 0 and every staff cast
 * is refused. So a staff-spend test must seed `cnmh_staffprep_*`, and
 * `cnmh_staff_*` counts charges SPENT (max − spent = remaining).
 *
 * Local helpers (`caster`, `openMagicCategory`, `castFromCard`, …) are kept in
 * this file deliberately — see the PR body for the factor-out candidates.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';
import { snapshotSpells, casterCharacter, gotoSheet } from '../../helpers/spellcasting';
import { expectMyTurnLive, openPlayTab } from '../../helpers/sheet';

const CHAR_ID = 'e2e-caster';
const CHAR_NAME = 'E2E Caster';

const STAFF_KEY = `cnmh_staff_${CHAR_ID}`;
const STAFFPREP_KEY = `cnmh_staffprep_${CHAR_ID}`;
const WANDS_KEY = `cnmh_wands_${CHAR_ID}`;
const COUNTERS_KEY = `cnmh_spellcounters_${CHAR_ID}`;
const LOADOUT_KEY = `cnmh_loadout_${CHAR_ID}`;
const TURNSTATE_KEY = `cnmh_turnstate_${CHAR_ID}`;

const STAFF_UID = 'uid-staff-cinders';
const WAND_UID = 'uid-wand-arczap';
const STAFF_NAME = 'Staff of Cinders';
const WAND_NAME = 'Wand of Arc Zap';

// Two authored staff spells at different ranks: the staff cost is the spell's
// own rank (`useCastingResources` → `Staff: N charge(s)`), so a rank-1 and a
// rank-2 spell off the same staff give a cheap cast and an unaffordable one.
const EMBER = { id: 'e2e-cr-emberflare', name: 'Ember Flare', level: 1, actions: 'Two Actions', range: '30 feet' };
const FROST = { id: 'e2e-cr-frostwall', name: 'Frost Wall', level: 2, actions: 'Two Actions', range: '60 feet' };
const ZAP = { id: 'e2e-cr-arczap', name: 'Arc Zap', level: 1, actions: 'Two Actions', range: '120 feet' };

const STAFF_ITEM = {
  id: 'e2e-cr-staff',
  name: STAFF_NAME,
  weight: 1,
  price: 0,
  staff: { name: STAFF_NAME, spells: [{ ref: EMBER.id }, { ref: FROST.id }] },
};
const WAND_ITEM = {
  id: 'e2e-cr-wand',
  name: WAND_NAME,
  weight: 0.1,
  price: 60,
  wand: { spellRef: ZAP.id },
};

/**
 * One occult caster holding both items. Slots are deliberately rank-1 ONLY:
 * `optionsFor` adds a "Rank N slot instead" (staff-slot) option whenever the
 * caster has a slot pool at the spell's rank, and that option would be picked
 * as the default whenever the staff option is disabled — silently rescuing the
 * cast the "exhausted staff" box is trying to observe. With no rank-2 pool,
 * the rank-2 staff spell has exactly one (staff) option.
 *
 * Bless is the counter-tracked spell in the repertoire (the only bundled-seed
 * spell carrying a `spellState` block).
 */
const caster = () =>
  casterCharacter({
    id: CHAR_ID,
    name: CHAR_NAME,
    level: 5,
    slots: { '1': 3 },
    repertoire: ['bless'],
    extra: {
      inventory: [
        { ref: STAFF_ITEM.id, uid: STAFF_UID, quantity: 1 },
        { ref: WAND_ITEM.id, uid: WAND_UID, quantity: 1 },
      ],
    },
  });

// Item-granted spells are gated on the item being IN HAND (itemAbilitiesActive):
// a worn staff renders its spells greyed with a "Not in hand" badge and no Cast
// chip at all. Both items held, always.
const HELD = { [STAFF_UID]: { state: 'held1' }, [WAND_UID]: { state: 'held1' } };

/** Sheet → Encounter tab → deck hydrated on this PC's turn. */
async function gotoEncounter(page: Page) {
  await gotoSheet(page, CHAR_ID, CHAR_NAME);
  await openPlayTab(page, 'Encounter');
  await expectMyTurnLive(page);
}

/**
 * Deck → Spellbook → a MagicModal category. Staff / wands / scrolls live only
 * behind the MagicModal (SpellsSegment keeps repertoire + focus in-tab), and
 * the launcher's accessible name is "Cast a Spell" in both of its shapes.
 */
async function openMagicCategory(page: Page, label: string) {
  await page.getByRole('tab', { name: 'Spells' }).click();
  await page.getByRole('button', { name: 'Cast a Spell' }).click();
  await page.locator('.magic-category-btn', { hasText: label }).click();
}

/**
 * Open a spell card's detail modal and press its Cast chip. Clicks the spell
 * NAME rather than the card body — a centre-of-card click can land on a
 * TraitTag, whose info modal then swallows the Cast click.
 */
async function castFromCard(page: Page, spellName: string) {
  await page
    .getByTestId('spell-card')
    .filter({ has: page.locator('.spell-name', { hasText: spellName }) })
    .locator('.spell-name')
    .click();
  await page.getByRole('button', { name: `Cast ${spellName}`, exact: true }).click();
}

/** Filled charge bubbles in StaffSpells' charge track = charges REMAINING. */
const staffChargesLeft = (page: Page) =>
  page.locator('.staff-charges-section').getByRole('button', { name: 'Available slot' });

test.describe('Casting resources — staff charges', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      spell: [EMBER, FROST, ZAP, ...snapshotSpells('bless')],
      item: [STAFF_ITEM, WAND_ITEM],
      character: [caster()],
    });
  });

  test('casting from a prepared staff spends its charges and the readout follows', async ({ page }) => {
    const mock = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        [LOADOUT_KEY]: HELD,
        // The day's preparation: this staff, 3 charges. Without it the staff has
        // charges.max === 0 and there is nothing to spend.
        [STAFFPREP_KEY]: { staffId: STAFF_UID, charges: 3 },
      },
    });
    await gotoEncounter(page);
    await openMagicCategory(page, STAFF_NAME);

    // Prepared total is in view before anything is spent.
    await expect(staffChargesLeft(page)).toHaveCount(3);

    await castFromCard(page, EMBER.name);
    // The rank-1 spell costs 1 charge; the caster also has a rank-1 slot pool,
    // so the spontaneous-staff alternative ("rank 1 slot instead") is offered
    // alongside it — but the staff option is the enabled default.
    const costs = page.getByRole('radiogroup', { name: 'Casting source' });
    await expect(costs).toContainText('Staff: 1 charge (3 left)');
    await expect(costs).toContainText('Rank 1 slot instead');

    await page.getByRole('button', { name: 'confirm-cast' }).click();

    // cnmh_staff_<id> counts charges SPENT, so one cast writes 1 (not 2).
    expect(await mock.expectSent(STAFF_KEY)).toBe(1);
    // …and the pip readout behind the closed modal follows it down.
    await expect(staffChargesLeft(page)).toHaveCount(2);

    // A second cast of the same spell stacks on the same key.
    await castFromCard(page, EMBER.name);
    await expect(page.getByRole('radiogroup', { name: 'Casting source' })).toContainText(
      'Staff: 1 charge (2 left)',
    );
    await page.getByRole('button', { name: 'confirm-cast' }).click();
    expect(await mock.expectSent(STAFF_KEY, (v) => v === 2)).toBe(2);
    await expect(staffChargesLeft(page)).toHaveCount(1);
  });

  test('a staff without enough charges refuses the cast rather than going negative', async ({ page }) => {
    const mock = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        [LOADOUT_KEY]: HELD,
        // 1 charge prepared; Frost Wall is rank 2 and therefore costs 2.
        [STAFFPREP_KEY]: { staffId: STAFF_UID, charges: 1 },
      },
    });
    await gotoEncounter(page);
    await openMagicCategory(page, STAFF_NAME);
    await expect(staffChargesLeft(page)).toHaveCount(1);

    await castFromCard(page, FROST.name);

    // Sole option (no rank-2 slot pool ⇒ no spontaneous-staff alternative),
    // priced at 2 charges against 1 remaining, and blocked with its reason.
    await expect(page.locator('.uam-cost-single')).toHaveText('Staff: 2 charges (1 left)');
    await expect(page.locator('.uam-cost-empty')).toHaveText('Not enough staff charges');
    await expect(page.getByRole('button', { name: 'confirm-cast' })).toBeDisabled();

    // Absence assertion with an anchor: the GM-ruling override is the ONLY way
    // past the gate, and it casts without touching the pool. Confirming through
    // it writes the turn budget (the anchor) — so once that write has landed we
    // know the confirm ran to completion, and a still-absent cnmh_staff_* write
    // is a real absence rather than a race.
    await page.getByRole('checkbox', { name: /Override \(GM ruling\)/ }).check();
    await page.getByRole('button', { name: 'confirm-cast' }).click();
    await mock.expectSent(TURNSTATE_KEY, (v) => v?.actionsSpent === 2);
    expect(mock.sent.filter((m) => m.stateType === 'staff')).toEqual([]);

    // The pool is exactly where it was — never −1.
    await expect(staffChargesLeft(page)).toHaveCount(1);
  });

  test('daily preparations charge the chosen staff and the staff view shows the total', async ({ page }) => {
    // No encounter seeded: the Daily Preparations bar only renders out of
    // combat (CharacterSheet gates it on mode !== 'encounter').
    const mock = await mockSession(page, { seed: { [LOADOUT_KEY]: HELD } });
    await gotoSheet(page, CHAR_ID, CHAR_NAME);

    await page.getByRole('button', { name: 'Daily Preparations' }).click();
    // Base charges = the highest rank the caster can cast (rank-1 slots ⇒ 1).
    await page.getByLabel('Prepare a staff').selectOption({ label: STAFF_NAME });
    await expect(page.locator('.dp-staff-hint')).toHaveText(
      'Gains 1 charge (highest rank you can cast).',
    );

    // …plus charges bought by expending spell slots, each worth its own rank.
    await page.getByRole('button', { name: 'Expend one more rank 1 slot' }).click();
    await expect(page.locator('.dp-staff-hint')).toHaveText(
      'Gains 2 charges (1 base + 1 from slots).',
    );

    await page.getByRole('button', { name: 'Prepare' }).click();
    expect(await mock.expectSent(STAFFPREP_KEY)).toEqual({ staffId: STAFF_UID, charges: 2 });
    // A fresh preparation always starts full — the spent counter is zeroed.
    expect(await mock.expectSent(STAFF_KEY)).toBe(0);

    // The staff view now reflects the prepared total.
    await openPlayTab(page, 'Spells');
    await page.getByRole('button', { name: STAFF_NAME, exact: true }).click();
    await expect(staffChargesLeft(page)).toHaveCount(2);
    await expect(page.locator('.ability-inactive-hint')).toHaveCount(0);
  });

  test('an unprepared staff has no charges at all', async ({ page }) => {
    // The flip side of the above, and the reason every staff test here seeds
    // cnmh_staffprep_*: staves hold no charges on their own.
    await mockSession(page, { seed: { [LOADOUT_KEY]: HELD } });
    await gotoSheet(page, CHAR_ID, CHAR_NAME);
    await openPlayTab(page, 'Spells');
    await page.getByRole('button', { name: STAFF_NAME, exact: true }).click();

    await expect(page.locator('.ability-inactive-hint')).toHaveText(
      'Not prepared today — prepare this staff during your daily preparations to charge it.',
    );
    await expect(page.locator('.staff-charges-section')).toHaveCount(0);
  });
});

test.describe('Casting resources — wand daily uses', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      spell: [EMBER, FROST, ZAP, ...snapshotSpells('bless')],
      item: [STAFF_ITEM, WAND_ITEM],
      character: [caster()],
    });
  });

  test('casting from a wand spends its daily use, and a spent wand is refused', async ({ page }) => {
    const mock = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        [LOADOUT_KEY]: HELD,
      },
    });
    await gotoEncounter(page);
    await openMagicCategory(page, 'Wands');

    const wandControl = page.locator('.wand-control');
    await expect(wandControl.getByRole('button', { name: 'Available charge' })).toBeVisible();
    await expect(wandControl).toContainText('Charged');

    await castFromCard(page, ZAP.name);
    // Sole option — a wand has one use per day, no rank arithmetic.
    await expect(page.locator('.uam-cost-single')).toHaveText(`Wand daily use — ${WAND_NAME}`);
    await page.getByRole('button', { name: 'confirm-cast' }).click();

    // The ledger is keyed by the wand's DISPLAY NAME (spell.wandName), not the
    // spell id — `wandKeyFor` prefers wandName and every wand item has one.
    expect(await mock.expectSent(WANDS_KEY)).toEqual({ [WAND_NAME]: 'used' });

    // The pip flips to spent and the overcharge escape hatch appears.
    await expect(wandControl.getByRole('button', { name: 'Spent charge' })).toBeVisible();
    await expect(wandControl.getByRole('button', { name: 'Overcharge' })).toBeVisible();

    // …and a second cast is refused until the next preparation.
    await castFromCard(page, ZAP.name);
    await expect(page.locator('.uam-cost-empty')).toHaveText('Wand already used today');
    await expect(page.getByRole('button', { name: 'confirm-cast' })).toBeDisabled();
  });
});

test.describe('Casting resources — spell counters', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      spell: [EMBER, FROST, ZAP, ...snapshotSpells('bless')],
      item: [STAFF_ITEM, WAND_ITEM],
      character: [caster()],
    });
  });

  test('casting a counter-tracked spell registers its ledger entry, and EffectsPanel drives it', async ({ page }) => {
    const mock = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        [TURNSTATE_KEY]: readyTurnState('1:0'),
        [LOADOUT_KEY]: HELD,
      },
    });
    await gotoEncounter(page);

    // Bless is repertoire, so it casts from the deck's own Spells segment —
    // going through the MagicModal would duplicate its card (deck + modal) and
    // trip strict mode.
    await page.getByRole('tab', { name: 'Spells' }).click();
    await castFromCard(page, 'Bless');
    await page.getByRole('button', { name: 'confirm-cast' }).click();

    // Registration mirrors the authored `spellState` block: a 15 ft emanation
    // that grows in 10 ft steps.
    const counters = await mock.expectSent(COUNTERS_KEY, (v) => Array.isArray(v) && v.length === 1);
    expect(counters[0]).toMatchObject({
      spellName: 'Bless',
      kind: 'emanation',
      value: 15,
      step: 10,
      unit: 'ft',
      registeredRound: 1,
    });

    // EffectsPanel (Stats tab) is the counter's live surface.
    await openPlayTab(page, 'Stats');
    const counterRow = page.locator('.effects-panel-item--counter');
    await expect(counterRow).toContainText('Bless');
    await expect(counterRow).toContainText('15 ft');

    await page.getByRole('button', { name: 'Grow Bless by 10 ft' }).click();
    const grown = await mock.expectSent(COUNTERS_KEY, (v) => v?.[0]?.value === 25);
    expect(grown[0].value).toBe(25);
    await expect(counterRow).toContainText('25 ft');

    // Ending it drops the entry off the ledger entirely.
    await page.getByRole('button', { name: 'End Bless' }).click();
    expect(await mock.expectSent(COUNTERS_KEY, (v) => Array.isArray(v) && v.length === 0)).toEqual([]);
    await expect(counterRow).toHaveCount(0);
  });
});

/**
 * Spell-slot economy (#957, e2e per #1046): the repertoire ledger behind
 * `cnmh_slots_<id>` ({ [rank]: spent }). Deduction happens on cast — the
 * non-encounter one-tap slot cast (#961/#996) is driven here. The rank-header
 * pips (#997) are a READ-ONLY render of that ledger: the sole player-side
 * writer is the cast path (useCastingResources.spend), daily preparations
 * reset it, and GMs remediate via CharacterStateModal — there is no manual
 * pip toggle left to press.
 */
test.describe('Casting resources — spell-slot ledger', () => {
  const SLOTS_KEY = `cnmh_slots_${CHAR_ID}`;

  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      spell: [EMBER, FROST, ZAP, ...snapshotSpells('bless')],
      item: [STAFF_ITEM, WAND_ITEM],
      character: [caster()],
    });
  });

  /** Sheet Spells tab → Repertoire view (SpellsList, NOT the encounter deck). */
  async function openRepertoire(page: Page) {
    await gotoSheet(page, CHAR_ID, CHAR_NAME);
    await openPlayTab(page, 'Spells');
    await page.getByRole('button', { name: 'Repertoire' }).click();
  }

  /** Open a repertoire spell's detail modal (same name-click as castFromCard). */
  async function openSpellCard(page: Page, name: string) {
    await page
      .getByTestId('spell-card')
      .filter({ has: page.locator('.spell-name', { hasText: name }) })
      .locator('.spell-name')
      .click();
  }

  test('a non-encounter repertoire cast deducts a slot of the cast rank', async ({ page }) => {
    // Deliberately NO encounter seeded: the deduction under test is the
    // one-tap slot cast (#961) SpellDetailModal offers outside the encounter
    // cast flow — outside a live encounter there is no Cast chip at all,
    // only the slot-spend buttons.
    const mock = await mockSession(page);
    await openRepertoire(page);

    // Full ledger before anything is spent.
    await expect(
      page.getByRole('img', { name: 'Rank 1 spell slots: 3 of 3 remaining' }),
    ).toBeVisible();

    await openSpellCard(page, 'Bless');
    await page.getByRole('button', { name: 'Cast — Rank 1 slot (3 left)' }).click();

    // cnmh_slots_<id> counts slots SPENT per rank (mirror of cnmh_staff_*).
    expect(await mock.expectSent(SLOTS_KEY, (v) => v?.['1'] === 1)).toMatchObject({ '1': 1 });
    await expect(
      page.getByRole('img', { name: 'Rank 1 spell slots: 2 of 3 remaining' }),
    ).toBeVisible();

    // A second cast stacks on the same rank bucket.
    await openSpellCard(page, 'Bless');
    await page.getByRole('button', { name: 'Cast — Rank 1 slot (2 left)' }).click();
    await mock.expectSent(SLOTS_KEY, (v) => v?.['1'] === 2);
    await expect(
      page.getByRole('img', { name: 'Rank 1 spell slots: 1 of 3 remaining' }),
    ).toBeVisible();
  });

  test('the slot ledger renders from cast history and cannot be hand-toggled', async ({ page }) => {
    // Two of three rank-1 slots already spent by prior casts.
    const mock = await mockSession(page, { seed: { [SLOTS_KEY]: { '1': 2 } } });
    await openRepertoire(page);

    // The pips render the seeded history…
    const pips = page.getByRole('img', { name: 'Rank 1 spell slots: 1 of 3 remaining' });
    await expect(pips).toBeVisible();
    // …and are a plain readout: no interactive control inside. (Contrast the
    // staff charge track above, whose pips ARE buttons — the manual
    // remediation surface the slot ledger deliberately lost in #997.)
    await expect(pips.getByRole('button')).toHaveCount(0);
    await pips.click({ force: true });

    // Anchored absence: spend the last slot through the real cast path; that
    // write (2 → 3) landing proves the round-trip completed, so exactly ONE
    // slots write in total means the pip click above wrote nothing.
    await openSpellCard(page, 'Bless');
    await page.getByRole('button', { name: 'Cast — Rank 1 slot (1 left)' }).click();
    await mock.expectSent(SLOTS_KEY, (v) => v?.['1'] === 3);
    expect(mock.sent.filter((m) => m.stateType === 'slots')).toHaveLength(1);

    // Exhausted pool: empty pips, and the cast control refuses.
    await expect(
      page.getByRole('img', { name: 'Rank 1 spell slots: 0 of 3 remaining' }),
    ).toBeVisible();
    await openSpellCard(page, 'Bless');
    await expect(page.getByRole('button', { name: 'Cast — Rank 1 slot (0 left)' })).toBeDisabled();
  });
});

test.describe('Casting resources — daily prep resets', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      spell: [EMBER, FROST, ZAP, ...snapshotSpells('bless')],
      item: [STAFF_ITEM, WAND_ITEM],
      character: [caster()],
    });
  });

  test('daily preparations restore staff charges, wand uses and spell counters', async ({ page }) => {
    const mock = await mockSession(page, {
      seed: {
        [LOADOUT_KEY]: HELD,
        [STAFFPREP_KEY]: { staffId: STAFF_UID, charges: 3 },
        [STAFF_KEY]: 2,
        [WANDS_KEY]: { [WAND_NAME]: 'used' },
        [COUNTERS_KEY]: [
          {
            id: 'e2e-counter-1',
            spellName: 'Bless',
            kind: 'emanation',
            value: 35,
            step: 10,
            unit: 'ft',
            min: 0,
            endAtMin: false,
            registeredRound: 1,
          },
        ],
      },
    });
    await gotoSheet(page, CHAR_ID, CHAR_NAME);

    // The dirty pools are exactly what the modal offers to restore — a clean
    // pool writes nothing and is deliberately absent from the checklist.
    await page.getByRole('button', { name: 'Daily Preparations' }).click();
    const checklist = page.locator('.dp-reset-list');
    await expect(checklist.getByRole('listitem')).toContainText([
      'staff charges',
      'wand uses',
      'tracked spells',
    ]);

    // Keep today's staff prepared so the reset is observed on the pools rather
    // than being confounded by the staff being un-prepared.
    await page.getByLabel('Prepare a staff').selectOption({ label: STAFF_NAME });
    await page.getByRole('button', { name: 'Prepare' }).click();

    expect(await mock.expectSent(STAFF_KEY, (v) => v === 0)).toBe(0);
    expect(await mock.expectSent(WANDS_KEY)).toEqual({ [WAND_NAME]: 'available' });
    expect(await mock.expectSent(COUNTERS_KEY)).toEqual([]);
    expect(await mock.expectSent(STAFFPREP_KEY)).toEqual({ staffId: STAFF_UID, charges: 1 });

    // The restored pools are what the sheet now shows.
    await openPlayTab(page, 'Spells');
    await page.getByRole('button', { name: 'Wands', exact: true }).click();
    await expect(
      page.locator('.wand-control').getByRole('button', { name: 'Available charge' }),
    ).toBeVisible();
  });
});
