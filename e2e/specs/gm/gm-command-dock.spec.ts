/**
 * GM Command Dock (#1525): the dock mounts the REAL player encounter controls
 * for the PC whose turn it is (S2), lists every other PC's reactions with
 * trigger text in the rail (S3), fires reaction prompts from a rail row and
 * pins any PC onto the stage (S4).
 *
 * The relay is mocked (mockSession) so acting-on-behalf is asserted the same
 * way player specs assert their own writes: the dock's End turn must produce
 * the identical cnmh_encounter_global advance the player's client would send.
 * Hydration gate: the deck's "End turn" button is the encounter-only element
 * (same gate as the player lifecycle spec).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { encounterState, pcEntry, enemyEntry, readyTurnState } from '../../helpers/encounter';

const FIGHTER_ID = 'e2e-fighter';
const FIGHTER_NAME = 'E2E Fighter';
const CLERIC_ID = 'e2e-cleric';
const CLERIC_NAME = 'E2E Cleric';

const CHARACTERS = [
  { id: FIGHTER_ID, name: FIGHTER_NAME, level: 5 },
  {
    id: CLERIC_ID,
    name: CLERIC_NAME,
    level: 5,
    reactions: [
      {
        name: 'E2E Riposte',
        actions: 'Reaction',
        triggerType: 'attack-melee',
        trigger: 'A melee attack hits you',
      },
    ],
  },
];

// Fighter acting at index 0; cleric + an enemy behind them.
const dockEncounter = () =>
  encounterState({
    phase: 'in-progress',
    round: 2,
    currentTurnIndex: 0,
    order: [
      pcEntry(FIGHTER_ID, FIGHTER_NAME, 20),
      pcEntry(CLERIC_ID, CLERIC_NAME, 15),
      enemyEntry('E2E Ghoul', 10),
    ],
  });

const sessionSeed = () => ({
  cnmh_encounter_global: dockEncounter(),
  // The cleric's reaction must be armed (defaultTurnState has it unavailable
  // until a first turn).
  [`cnmh_turnstate_${CLERIC_ID}`]: readyTurnState(),
});

const gotoDock = async (page: import('@playwright/test').Page) => {
  await page.goto('/gm/dock');
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible({ timeout: 15_000 });
};

test.describe('GM Command Dock', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: CHARACTERS });
  });

  test('follows the turn, lists other PCs in the rail, and End turn advances the shared encounter', async ({ page }) => {
    const session = await mockSession(page, { seed: sessionSeed() });
    await gotoDock(page);

    // Acting pane = the active PC's real deck.
    await expect(page.getByRole('region', { name: `Acting as ${FIGHTER_NAME}` })).toBeVisible();

    // Rail: the cleric (with trigger text) but not the acting fighter.
    const rail = page.getByRole('complementary', { name: 'Party reactions' });
    await expect(rail.getByRole('region', { name: `${CLERIC_NAME} reactions` })).toBeVisible();
    await expect(rail).toContainText('E2E Riposte');
    await expect(rail).toContainText('A melee attack hits you');
    await expect(rail.getByRole('region', { name: `${FIGHTER_NAME} reactions` })).not.toBeVisible();

    // Acting on the player's behalf: End turn writes the same advance the
    // player's own client would.
    await page.getByRole('button', { name: 'End turn' }).click();
    await session.expectSent('cnmh_encounter_global', (v: any) => v?.currentTurnIndex === 1);

    // The dock hands off to the next PC; the fighter joins the rail.
    await expect(page.getByRole('region', { name: `Acting as ${CLERIC_NAME}` })).toBeVisible();
    await expect(rail.getByRole('region', { name: `${FIGHTER_NAME} reactions` })).toBeVisible();
  });

  test('Prompt on a rail reaction fires the matching trigger event at that PC', async ({ page }) => {
    const session = await mockSession(page, { seed: sessionSeed() });
    await gotoDock(page);

    await page.getByRole('button', { name: 'Prompt E2E Riposte' }).click();

    await session.expectSent(
      `cnmh_reactprompt_${CLERIC_ID}`,
      (v: any) => v?.eventId === 'melee-attack' && v?.round === 2 && typeof v?.reqId === 'string',
    );
  });

  test('pin stages an off-turn PC and Follow turn returns to the pointer', async ({ page }) => {
    await mockSession(page, { seed: sessionSeed() });
    await gotoDock(page);

    const pins = page.getByRole('group', { name: 'Stage a character' });
    await pins.getByRole('button', { name: CLERIC_NAME }).click();

    // The cleric takes the stage off-turn (their deck renders its off-turn
    // view) and drops out of the rail, replaced by the fighter.
    await expect(page.getByRole('region', { name: `Acting as ${CLERIC_NAME}` })).toBeVisible();
    await expect(page.getByText('pinned')).toBeVisible();
    const rail = page.getByRole('complementary', { name: 'Party reactions' });
    await expect(rail.getByRole('region', { name: `${FIGHTER_NAME} reactions` })).toBeVisible();
    await expect(rail.getByRole('region', { name: `${CLERIC_NAME} reactions` })).not.toBeVisible();

    await pins.getByRole('button', { name: 'Follow turn' }).click();
    await expect(page.getByRole('region', { name: `Acting as ${FIGHTER_NAME}` })).toBeVisible();
  });
});
