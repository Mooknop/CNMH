/**
 * Familiar maneuvers (#223/#391) — the last #1127 item, previously abandoned on
 * blockers that are now all resolved: the FamiliarModal saves crash (#1132),
 * the "racy" granted-action pool and the hasFamiliar derivation split (#1142 —
 * the sweep needed a matching turnState.turnToken, see readyTurnState).
 *
 * One full arc through the familiar-command surface:
 *   masthead familiar button → FamiliarModal (maneuvers gated, pool empty)
 *   → Command (owner spends 1 action, familiar granted 2)
 *   → Squox Tricks Trip → FamiliarManeuverModal → target + raw d20 vs Reflex DC
 *   → logged outcome + 1 granted action spent.
 *
 * The owner is seeded with the familiar DATA BLOCK and no 'Familiar' feat —
 * the masthead button rendering at all pins the #1142 data-driven flag fix.
 *
 * Determinism: trained Acrobatics = ownerLevel + 3 = +8 (minionUtils
 * familiarSkillBonus); enemy Reflex mod 5 → DC 15; d20 12 → total 20 →
 * Success (crit needs 25). Trip success → "knocked prone".
 *
 * Selector gotcha (#1131 3b): 'Trip'/'Disarm' also exist as skill-action tiles
 * in the encounter ActionGrid — familiar maneuver clicks must scope to
 * `.familiar-maneuvers`, and target picks to `.fmm-target-picks`.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';

const CHAR_ID = 'e2e-witch';
const CHAR_NAME = 'E2E Witch';
const FAMILIAR_NAME = 'E2E Squox';
const ENEMY_NAME = 'E2E Goblin';

const owner = () => ({
  id: CHAR_ID,
  name: CHAR_NAME,
  level: 5,
  saves: { fortitude: 8, reflex: 10, will: 12 },
  familiar: {
    name: FAMILIAR_NAME,
    type: 'Beast',
    size: 'Tiny',
    hp: 20,
    ac: 18,
    speed: 25,
    skills: ['acrobatics'],
    abilities: [
      { name: 'Squox Tricks', description: 'Disarm or Trip with Acrobatics; +2 vs off-guard.' },
    ],
  },
});

const enemy = () => ({
  entryId: 'e2e-enemy-goblin',
  kind: 'enemy' as const,
  name: ENEMY_NAME,
  initiative: 10,
  defenses: { ac: 16, saves: { fortitude: 6, reflex: 5, will: 4 } },
});

test.describe('Familiar maneuvers', () => {
  test('Command grants the pool, Trip resolves vs Reflex DC and spends it', async ({
    page,
    seed,
    reset,
  }) => {
    await reset();
    await seed({ character: [owner()] });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, {
          order: [
            { entryId: `e2e-${CHAR_ID}`, kind: 'pc', charId: CHAR_ID, name: CHAR_NAME, initiative: 20 },
            enemy(),
          ],
        }),
        // Matching token — without it the turn-begin sweep zeroes the familiar
        // pool on mount, the exact "racy grantFamiliar" from #1131.
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    await page
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Encounter', exact: true })
      .click();

    // Masthead familiar button (data-driven hasFamiliar, #1142 — no feat seeded).
    const mastheadBtn = page.getByRole('button', { name: new RegExp(`^${FAMILIAR_NAME}`) });
    await mastheadBtn.click();
    await expect(page.getByRole('heading', { name: FAMILIAR_NAME, level: 2 })).toBeVisible();

    // Pool empty → maneuvers hard-blocked until Command.
    const maneuvers = page.locator('.familiar-maneuvers');
    await expect(maneuvers.getByRole('button', { name: 'Trip' })).toBeDisabled();
    await page.getByRole('button', { name: '×' }).click();

    // Command: owner spends 1 action, familiar granted 2 (cross-actor key).
    await page.getByRole('button', { name: `Command ${FAMILIAR_NAME}` }).click();
    await session.expectSent(`cnmh_turnstate_${CHAR_ID}-familiar`, (v) => v?.actionsGranted === 2);
    await session.expectSent(`cnmh_turnstate_${CHAR_ID}`, (v) => v?.actionsSpent === 1);

    // Reopen — the granted pool unblocks Squox Tricks. Forced single dispatch:
    // the turnstate updates from Command re-render the sheet just as the click
    // lands, and Playwright's retry loop then finds its target under the modal
    // the successful click opened — an unforced click here flip-flops until
    // timeout. The unforced first open above already proves real reachability.
    await mastheadBtn.click({ force: true });
    await expect(page.getByRole('heading', { name: FAMILIAR_NAME, level: 2 })).toBeVisible();
    await expect(page.getByRole('status')).toHaveAttribute('aria-label', '2 granted actions left');
    await maneuvers.getByRole('button', { name: 'Trip' }).click();
    await expect(
      page.getByRole('heading', { name: `${FAMILIAR_NAME} — Trip`, level: 2 }),
    ).toBeVisible();

    // Target → the resolver surfaces the derived Reflex DC (10 + 5).
    await page.locator('.fmm-target-picks').getByRole('button', { name: ENEMY_NAME }).click();
    await expect(page.locator('.trr-dc-badge')).toHaveText(`${ENEMY_NAME}: 15`);

    // d20 12 + Acrobatics 8 = 20 vs DC 15 → Success.
    await page.getByLabel('raw d20').fill('12');
    await expect(page.locator('.trr-result-degree')).toHaveText('Success');

    await page.getByRole('button', { name: 'Log Trip' }).click();

    // Outcome goes to the GM via the combat log; the maneuver costs the
    // familiar 1 granted action.
    await session.expectSent(
      'cnmh_encounter_global',
      (v) =>
        Array.isArray(v?.log) &&
        v.log.some((e: any) =>
          String(e.text).includes(
            `${FAMILIAR_NAME} Trip vs ${ENEMY_NAME} (Reflex DC 15): 20 → Success — ${ENEMY_NAME} knocked prone`,
          ),
        ),
    );
    await session.expectSent(
      `cnmh_turnstate_${CHAR_ID}-familiar`,
      (v) => v?.actionsGranted === 2 && v?.actionsSpent === 1,
    );
  });
});
