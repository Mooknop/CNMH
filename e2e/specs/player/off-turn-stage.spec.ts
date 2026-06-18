/**
 * Off-turn stage: player-driven armed reactions (epic #479, closeout #478).
 *
 * When the encounter is in-progress and it ISN'T this device's turn, the
 * encounter tab shows the stage — a spotlight on whoever is acting, plus the
 * armed-reaction footer (#474). Pressing an armed reaction declares the PC onto
 * the shared cnmh_reactors_global key so every device shows them stepping in
 * (#476), opens the resolver (UseAbilityModal at reaction cost, #475), and
 * resolving clears the declaration.
 *
 * mockSession (#293) plays the GM/bridge peer: it seeds the off-turn encounter +
 * a ready turn state, then records the app's writes so we can assert the
 * declare → resolve → broadcast-clear lifecycle on cnmh_reactors_global.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { encounterState, pcEntry, enemyEntry, readyTurnState } from '../../helpers/encounter';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';

const openEncounterTab = (page: import('@playwright/test').Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();

const declaredMe = (v: unknown) =>
  Array.isArray(v) && v.some((r: any) => r?.pcId === CHAR_ID);
const cleared = (v: unknown) =>
  Array.isArray(v) && !v.some((r: any) => r?.pcId === CHAR_ID);

test.describe('Off-turn stage armed reactions', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('declare → resolve → broadcast clear', async ({ page, seed }) => {
    await seed({
      character: [{
        id: CHAR_ID,
        name: CHAR_NAME,
        level: 5,
        reactions: [{ name: 'E2E Riposte', actions: 'Reaction', triggerType: 'attack-any' }],
      }],
    });

    // In-progress, but the GOBLIN is acting (currentTurnIndex 1) → off-turn for
    // the fighter, so the stage replaces the action dial.
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_encounter_global: encounterState({
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 1,
          order: [pcEntry(CHAR_ID, CHAR_NAME, 20), enemyEntry('E2E Goblin', 15)],
        }),
        'cnmh_turnstate_e2e-fighter': readyTurnState(),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });
    await openEncounterTab(page);

    // The off-turn stage is up, spotlighting the acting enemy.
    const stage = page.getByRole('region', { name: 'Off-turn encounter stage' });
    await expect(stage).toBeVisible();
    await expect(stage).toContainText('E2E Goblin');

    // The reaction is armed in the footer.
    const armed = stage.getByRole('button', { name: 'Use E2E Riposte' });
    await expect(armed).toBeVisible();

    // Declare → the PC is broadcast onto the shared reactor key.
    await armed.click();
    await session.expectSent('cnmh_reactors_global', declaredMe);

    // Resolve through the existing reaction flow → spends + closes → clears.
    await page.getByRole('button', { name: 'confirm-cast' }).click();
    await session.expectSent('cnmh_reactors_global', cleared);
    await expect(page.getByRole('button', { name: 'confirm-cast' })).toBeHidden();
  });

  test('blocked reaction shows why and does not declare', async ({ page, seed }) => {
    await seed({
      character: [{
        id: CHAR_ID,
        name: CHAR_NAME,
        level: 5,
        reactions: [{ name: 'E2E Riposte', actions: 'Reaction', triggerType: 'attack-any' }],
      }],
    });

    await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_encounter_global: encounterState({
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 1,
          order: [pcEntry(CHAR_ID, CHAR_NAME, 20), enemyEntry('E2E Goblin', 15)],
        }),
        // Reaction already spent → the footer shows it blocked, not armed.
        'cnmh_turnstate_e2e-fighter': { ...readyTurnState(), reactionSpent: true },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });
    await openEncounterTab(page);

    const stage = page.getByRole('region', { name: 'Off-turn encounter stage' });
    await expect(stage).toBeVisible();
    // The reaction renders blocked (not an actionable "Use …" button).
    await expect(stage.getByRole('button', { name: 'Use E2E Riposte' })).toHaveCount(0);
    await expect(stage.getByText('reaction spent')).toBeVisible();
  });
});
