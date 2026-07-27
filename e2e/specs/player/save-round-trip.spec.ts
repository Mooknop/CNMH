/**
 * The caster save round trip (#1689 — workstream G2 of the Roll Resolution
 * redesign #1680), end to end across BOTH seats.
 *
 * Before this workstream a save spell was a one-way push: the caster typed a
 * damage total before committing, the request carried it, and the GM's
 * resolution applied everything. The degrees never came back — friction F6 of
 * the redesign, and the reason `encounter.saveResolutions` (#1683) exists.
 *
 * The inverted flow this spec drives, and the reason it needs two seats:
 *
 *   PLAYER  cast → commit (no die, no total) → `waiting` (pulsing GM ring)
 *   GM      /gm/dock → Requested Saves → type the d20 → Log Results
 *              ↳ writes the resolution record, applies conditions/fx…
 *              ↳ …and deliberately does NOT apply damage any more
 *   PLAYER  degrees land → result card → Roll damage → Send damage to GM
 *              ↳ the dmgapply relay (#1016) fires HERE, exactly once
 *
 * Per the #1589 coverage metric this is the rail's first E2E: `saveResolutions`
 * was unreferenced anywhere under `e2e/` before it.
 *
 * ## Why two mocked sessions wired together
 *
 * `mockSession` intercepts one PAGE's relay socket, so two pages get two
 * independent mocks and nothing flows between them. The two `onSent` → `push`
 * lines below are what the real Durable Object does — record a client's UPDATE
 * and broadcast it to the OTHER peer — and nothing more. Both clients are the
 * real app: the player really renders `RollSheet`, the GM really renders
 * `RequestedSaves`, and the encounter record really travels between them.
 * Seeding a live DO instead would mean driving the whole GM encounter-setup UI
 * first, which this spec is not about.
 */

import { test, expect, type Page } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { encounterState, enemyEntry, pcEntry, readyTurnState } from '../../helpers/encounter';
import {
  casterCharacter,
  castSpell,
  gotoSheet,
  openSpellsSegment,
  snapshotSpells,
} from '../../helpers/spellcasting';
import {
  commitSave,
  degrees,
  guardNotice,
  receipt,
  rollDamage,
  sheetPill,
  waitingCaption,
} from '../../helpers/rollSheet';

const CHAR_ID = 'e2e-caster';
const CHAR_NAME = 'E2E Caster';

// A plain basic-save cantrip: no armed payload, no secondary zone, no action
// variants, no riders — so what this spec proves is the round trip itself.
const SPELL_ID = 'internal-distortion';
const SPELL_NAME = 'Internal Distortion';

// Level 5 + Cha 16 + expert (proficiency 2) → 10 + 3 + (5 + 4) = 22.
const SPELL_DC = 22;
// Fortitude +5, so a d20 of 10 totals 15: under the DC but not by 10 → Failure,
// the degree that takes the caster's total in full.
const TROLL = {
  ...enemyEntry('Frost Troll', 10),
  defenses: { ac: 24, saves: { fortitude: 5, reflex: 9, will: 11 } },
};
const CASTER_ENTRY = { ...pcEntry(CHAR_ID, CHAR_NAME, 20) };

// One encounter record, shared by both seats — the caster is up.
const sharedEncounter = () =>
  encounterState({
    phase: 'in-progress',
    round: 1,
    currentTurnIndex: 0,
    order: [CASTER_ENTRY, TROLL],
  });

const seedFor = () => ({
  cnmh_encounter_global: sharedEncounter(),
  [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
});

const gmConsole = (page: Page) => page.getByRole('complementary', { name: 'GM console' });
const saveCard = (page: Page) => gmConsole(page).locator('.gm-save-req-card');

const reqs = (v: any) => (Array.isArray(v?.saveRequests) ? v.saveRequests : []);
const resolutions = (v: any) => (Array.isArray(v?.saveResolutions) ? v.saveResolutions : []);
const logHas =
  (...needles: string[]) =>
  (v: any) =>
    Array.isArray(v?.log) &&
    v.log.some((e: any) => needles.every((n) => String(e.text).includes(n)));

/**
 * Two real clients with the relay between them played by their own mocks.
 * Returns both pages and both mocks; the GM page is opened from the SAME
 * browser context so it inherits the project's Access headers (the rationale
 * in gm-gear-bindings.spec.ts / live-sync.spec.ts).
 */
async function twoSeats(page: Page): Promise<{
  playerPage: Page;
  gmPage: Page;
  playerMock: MockSession;
  gmMock: MockSession;
}> {
  const gmPage = await page.context().newPage();

  const playerMock = await mockSession(page, { seed: seedFor() });
  const gmMock = await mockSession(gmPage, { seed: seedFor() });

  // The Durable Object's entire job, in two lines.
  playerMock.onSent('cnmh_encounter_global', (v) => gmMock.push('cnmh_encounter_global', v));
  gmMock.onSent('cnmh_encounter_global', (v) => playerMock.push('cnmh_encounter_global', v));

  await gotoSheet(page, CHAR_ID, CHAR_NAME);
  await openSpellsSegment(page);

  // `domcontentloaded` rather than `load`: the dock pulls a background image and
  // the icon font, and the hydration gate below is the real barrier anyway.
  await gmPage.goto('/gm/dock', { waitUntil: 'domcontentloaded' });
  await expect(gmPage.getByRole('button', { name: 'End turn' })).toBeVisible({ timeout: 15_000 });

  return { playerPage: page, gmPage, playerMock, gmMock };
}

test.describe('Save round trip (#1689)', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      spell: snapshotSpells(SPELL_ID),
      character: [
        casterCharacter({ id: CHAR_ID, name: CHAR_NAME, level: 5, repertoire: [SPELL_ID] }),
      ],
    });
  });

  test('caster commits → GM resolves → degrees come back → caster rolls the damage', async ({
    page,
  }) => {
    const { playerPage, gmPage, playerMock, gmMock } = await twoSeats(page);

    // ── 1. The caster commits, with nothing to roll ──────────────────────────
    await castSpell(playerPage, SPELL_NAME);
    await playerPage.getByRole('button', { name: 'Target Frost Troll' }).click();

    // The strip states the target and the save outright (the cost between them
    // is whatever castPlan renders), and the note names who rolls next.
    await expect(playerPage.locator('.rs-summary-line')).toContainText('Frost Troll');
    await expect(playerPage.locator('.rs-summary-line')).toContainText(
      `Fortitude DC ${SPELL_DC}`,
    );
    await expect(playerPage.locator('.rs-precommit-note')).toContainText(
      'The targets roll their saves — you commit first, the result comes back here.',
    );
    // The pre-commit damage total is gone from this flow entirely.
    await expect(playerPage.getByLabel('rolled damage total')).toHaveCount(0);

    await commitSave(playerPage);

    // The request carries the dice and the (empty) rider snapshot, never a total.
    const pushed = await playerMock.expectSent('cnmh_encounter_global', (v) => reqs(v).length > 0);
    const req = reqs(pushed)[0];
    expect(req).toMatchObject({
      abilityName: SPELL_NAME,
      save: 'fortitude',
      basic: true,
      dc: SPELL_DC,
      casterId: CHAR_ID,
    });
    // Cantrip auto-heighten: a level-5 caster casts at rank 3 → 3d6.
    expect(req.damage).toMatchObject({ expression: '3d6', typeLabel: 'slashing', entered: null });

    // …and the sheet parks, inventing no degrees of its own.
    await expect(waitingCaption(playerPage)).toBeVisible();
    await expect(degrees(playerPage)).toHaveCount(0);

    // ── 2. The GM resolves it, and applies no damage ─────────────────────────
    const card = saveCard(gmPage);
    await expect(card).toContainText(`${CHAR_NAME} — ${SPELL_NAME}`);
    await expect(card).toContainText(`Fortitude DC ${SPELL_DC}`);
    // The card says why there is no total to preview against.
    await expect(card).toContainText('the caster rolls damage after these degrees');

    await gmConsole(gmPage).getByLabel('Frost Troll d20').fill('10');
    // A degree previews, but no per-target damage does — that is the caster's.
    await expect(card.locator('.trr-result-degree')).toContainText('Failure');
    await expect(card.locator('.gm-save-req-dmg')).toHaveCount(0);

    await gmConsole(gmPage).getByRole('button', { name: 'Log Results' }).click();

    // The degree line has no damage suffix any more…
    await gmMock.expectSent(
      'cnmh_encounter_global',
      logHas(`Frost Troll rolls Fortitude vs DC ${SPELL_DC} (${SPELL_NAME}): 15 → Failure`),
    );
    // …and the write-back is what the caster is waiting on: the record lands
    // and the request is dropped in the same write (#1683).
    const resolved = await gmMock.expectSent(
      'cnmh_encounter_global',
      (v) => resolutions(v).length > 0,
    );
    expect(resolutions(resolved)[0]).toMatchObject({
      id: req.id,
      casterId: CHAR_ID,
      abilityName: SPELL_NAME,
      results: [expect.objectContaining({ name: 'Frost Troll', total: 15, degree: 'failure' })],
    });
    expect(reqs(resolved)).toHaveLength(0);
    // The double-apply proof (G1 risk 1): the GM's client relayed no damage.
    expect(gmMock.sent.some((m) => m.stateType === 'dmgapply')).toBe(false);

    // ── 3. The degrees reach the caster ──────────────────────────────────────
    await expect(degrees(playerPage)).toHaveText('Failure');
    await expect(playerPage.locator('.rs-note')).toContainText('Degrees in from the GM.');
    await expect(playerPage.locator('.rs-headline-math')).toHaveText(`Fortitude DC ${SPELL_DC}`);
    await expect(playerPage.locator('.rs-row-note')).toContainText('rolled 15');

    // Consumed and dropped, so the bounded rail cannot evict another caster's
    // record before they render it (G1 risk 4).
    await playerMock.expectSent('cnmh_encounter_global', (v) => resolutions(v).length === 0);

    // ── 4. The caster rolls the damage, and it relays from HERE ──────────────
    await rollDamage(playerPage);
    await expect(playerPage.locator('.de-expression')).toHaveText('3d6 slashing');
    await playerPage.getByLabel('rolled damage total').fill('11');
    // A plain failure takes the total in full.
    await expect(playerPage.locator('.rs-breakdown')).toContainText('Frost Troll 11');

    await playerPage.getByRole('button', { name: 'Send damage to GM' }).click();

    const relayed = await playerMock.expectSent('cnmh_dmgapply_global');
    expect(relayed).toMatchObject({
      sourceName: SPELL_NAME,
      hits: [{ entryId: TROLL.entryId, name: 'Frost Troll', amount: 11, type: 'slashing' }],
    });
    await playerMock.expectSent(
      'cnmh_encounter_global',
      logHas(`Frost Troll takes 11 from ${SPELL_NAME}`),
    );

    // ── 5. Settled ───────────────────────────────────────────────────────────
    await expect(receipt(playerPage)).toContainText(`Fortitude DC ${SPELL_DC}`);
    await expect(receipt(playerPage)).toContainText('Frost Troll — Failure · 11');
  });

  test('a dismissed request bails the waiting sheet instead of pulsing forever', async ({
    page,
  }) => {
    const { playerPage, gmPage, playerMock } = await twoSeats(page);

    await castSpell(playerPage, SPELL_NAME);
    await playerPage.getByRole('button', { name: 'Target Frost Troll' }).click();
    await commitSave(playerPage);
    await expect(waitingCaption(playerPage)).toBeVisible();
    // The GM has genuinely seen it — that is what makes its later absence mean
    // "dismissed" rather than "the write has not round-tripped yet".
    await expect(saveCard(gmPage)).toBeVisible();

    // The GM drops it without resolving (a partial Foundry ack abandoned, a
    // mis-cast withdrawn) — G1 risks 5 + 6.
    const withoutRequest = { ...sharedEncounter(), saveRequests: [], saveResolutions: [] };
    playerMock.push('cnmh_encounter_global', withoutRequest);

    await expect(guardNotice(playerPage)).toContainText('the GM dismissed this save');
    // …and the way out is open: no obligation can be met, so nothing is gated.
    await playerPage.getByRole('button', { name: 'Close' }).click();
    await expect(sheetPill(playerPage)).toHaveCount(0);
  });
});
