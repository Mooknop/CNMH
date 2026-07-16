/**
 * Lingering Composition through the real cast flow — the proving spec for the
 * spell cast-flow harness (#1133, first slice of the #1127 compositions item).
 *
 * Drives the full UI chain no earlier spec exercised: Encounter tab → Magic →
 * Compositions → spell card → Cast chip → CastSpellModal routes by spell id to
 * LingeringCompositionModal → Performance roll vs DC → confirm. Asserts the
 * synced writes the flow produces through the mocked session:
 *
 *   cnmh_lingering_<id> — { rounds } pending extension (null on failure)
 *   cnmh_focus_<id>     — focus point spent on success, refunded on failure
 *   cnmh_playing_<id>   — 'while playing' flag (#935); set even on failure,
 *                         since a failed Lingering is still a Composition cast
 *
 * The caster is seeded through the real content pipeline: focus pool at
 * spellcasting.focus, the spell as a focus_spells catalog ref, and the real
 * lingering-composition doc from the bundled seed (id-routed, so a stub id
 * would silently miss the resolver).
 *
 * Caster math (casterCharacter defaults): Performance +10 (Cha +3, trained +2,
 * level +5). Success case: d20 15 + 10 = 25 vs DC 25 → success (crit needs 35).
 * Failure case: d20 6 + 10 = 16 vs DC 25 → failure (crit-fail needs ≤ 14).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { activeEncounter } from '../../helpers/encounter';
import {
  snapshotSpells,
  casterCharacter,
  gotoSheet,
  openSpellsSegment,
  castSpell,
} from '../../helpers/spellcasting';

const CHAR_ID = 'e2e-bard';
const CHAR_NAME = 'E2E Bard';

const bard = () =>
  casterCharacter({
    id: CHAR_ID,
    name: CHAR_NAME,
    charClass: 'Bard', // relabels the focus category to "Compositions"
    focus: { max: 2, current: 2 },
    focusSpells: ['lingering-composition'],
  });

// Open LingeringCompositionModal via the full UI path and verify the routed
// resolver came up with the seeded Performance modifier.
async function openLingering(page: import('@playwright/test').Page) {
  await gotoSheet(page, CHAR_ID, CHAR_NAME);
  // Compositions render in the deck's first-class Spells segment now.
  await openSpellsSegment(page);
  await castSpell(page, 'Lingering Composition');
  // level 2 = the modal title; the spell card's own <h3> shares the name.
  await expect(page.getByRole('heading', { name: 'Lingering Composition', level: 2 })).toBeVisible();
  await expect(page.locator('.lcm-mod-value')).toHaveText('+10');
}

test.describe('Lingering Composition cast flow', () => {
  test.beforeEach(async ({ seed, reset }) => {
    await reset();
    await seed({
      spell: snapshotSpells('lingering-composition'),
      character: [bard()],
    });
  });

  test('success spends a focus point and stores the 3-round extension', async ({ page }) => {
    const mock = await mockSession(page, {
      seed: { cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME) },
    });

    await openLingering(page);

    await page.locator('#lcm-d20').fill('15');
    await page.locator('#lcm-dc').fill('25');
    await expect(page.locator('.lcm-degree')).toContainText('Success — 3 rounds');

    await page.getByRole('button', { name: 'Cast Lingering Composition' }).click();

    // Pending extension for the next composition cast.
    const lingering = await mock.expectSent(
      `cnmh_lingering_${CHAR_ID}`,
      (v) => v?.rounds === 3,
    );
    expect(lingering.ts).toBeGreaterThan(0);

    // Focus point spent (1 of 2), and the caster is now 'playing' (#935).
    await mock.expectSent(`cnmh_focus_${CHAR_ID}`, (v) => v === 1);
    await mock.expectSent(`cnmh_playing_${CHAR_ID}`, (v) => v?.active === true);

    await expect(page.locator('.lcm-result')).toContainText(
      'Success — next composition lasts 3 rounds',
    );
  });

  test('failure clears the extension, keeps the focus point, still marks playing', async ({
    page,
  }) => {
    const mock = await mockSession(page, {
      seed: { cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME) },
    });

    await openLingering(page);

    await page.locator('#lcm-d20').fill('6');
    await page.locator('#lcm-dc').fill('25');
    await expect(page.locator('.lcm-degree')).toContainText('Failure — 1 round, focus kept');

    await page.getByRole('button', { name: 'Cast Lingering Composition' }).click();

    // Extension explicitly nulled so a stale prior attempt can't linger.
    await mock.expectSent(`cnmh_lingering_${CHAR_ID}`, (v) => v === null);
    // A failed Lingering is still a Composition cast — playing flag goes up.
    await mock.expectSent(`cnmh_playing_${CHAR_ID}`, (v) => v?.active === true);

    await expect(page.locator('.lcm-result')).toContainText(
      'composition lasts 1 round — focus point not spent',
    );
    // The focus point was refunded: no focus write ever crossed the session.
    expect(mock.sent.filter((m) => m.stateType === 'focus')).toHaveLength(0);
  });
});
