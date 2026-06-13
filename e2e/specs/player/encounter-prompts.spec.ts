/**
 * Encounter prompt surface (#318, part of #316/#295): the GM/bridge requests an
 * action, the player is prompted on their sheet, resolves it, and the result
 * syncs. Covers SavePrompt, SkillPrompt (Recall Knowledge), and the #221
 * triggerType-driven ReactionPrompt.
 *
 * All three render in the encounter play tab, so each test seeds an active
 * encounter + the per-character prompt key via mockSession (#293), then drives
 * the real resolve UI. Assertions key on deterministic log substrings / synced
 * writes, not the rolled degree (computeSaveDegree is unit-tested elsewhere).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { activeEncounter } from '../../helpers/encounter';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';

const openEncounterTab = (page: import('@playwright/test').Page) =>
  page
    .getByRole('navigation', { name: 'Character sheet sections' })
    .getByRole('button', { name: 'Encounter', exact: true })
    .click();

const gotoSheet = async (page: import('@playwright/test').Page) => {
  await page.goto(`/character/${CHAR_ID}`);
  await expect(page.getByRole('heading', { name: CHAR_NAME, level: 1 })).toBeVisible({ timeout: 15_000 });
  await openEncounterTab(page);
};

test.describe('Encounter prompts', () => {
  test.beforeEach(async ({ reset }) => {
    await reset();
  });

  test('requested save: prompt appears, resolves, and logs the result', async ({ page, seed }) => {
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        'cnmh_saveprompt_e2e-fighter': { reqId: 's1', save: 'reflex', dc: 20, effectName: 'E2E Fireball', basic: true },
      },
    });

    await gotoSheet(page);

    const prompt = page.getByRole('region', { name: 'Reflex save prompt' });
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('DC 20');

    await prompt.getByLabel('d20 roll').fill('15');
    await prompt.getByRole('button', { name: 'Submit Reflex save' }).click();

    await expect(page.getByRole('status', { name: 'Save result' })).toBeVisible();
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log) && v.log.some((e: any) => String(e.text).includes('Reflex save (DC 20')),
    );
  });

  test('recall knowledge: skill prompt appears, resolves, and logs', async ({ page, seed }) => {
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        'cnmh_skillprompt_e2e-fighter': { reqId: 'k1', skill: 'arcana', dc: 18, label: 'Recall: E2E Goblin' },
      },
    });

    await gotoSheet(page);

    const prompt = page.getByRole('region', { name: 'Arcana skill prompt' });
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('DC 18');

    await prompt.getByLabel('d20 roll').fill('12');
    await prompt.getByRole('button', { name: 'Submit Arcana check' }).click();

    await expect(page.getByRole('status', { name: 'Skill check result' })).toBeVisible();
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log) && v.log.some((e: any) => String(e.text).includes('Recall Knowledge')),
    );
  });

  test('reaction trigger: prompt wakes a matching reaction; Pass declines and clears', async ({ page, seed }) => {
    await seed({
      character: [{
        id: CHAR_ID,
        name: CHAR_NAME,
        level: 5,
        reactions: [{ name: 'E2E Riposte', actions: 'Reaction', triggerType: 'attack-any' }],
      }],
    });
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME), // in-progress, round 1
        // defaultTurnState has the reaction unavailable; seed it ready.
        'cnmh_turnstate_e2e-fighter': {
          actionsSpent: 0,
          reactionAvailable: true,
          reactionSpent: false,
          hasStartedFirstTurn: true,
        },
        'cnmh_reactprompt_e2e-fighter': { eventId: 'melee-attack', label: 'Goblin strikes!', round: 1 },
      },
    });

    await gotoSheet(page);

    const prompt = page.getByRole('region', { name: 'Reaction trigger prompt' });
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('Goblin strikes!');
    await expect(prompt.getByRole('button', { name: 'Use E2E Riposte' })).toBeVisible();

    // Pass = decline → clears the synced prompt and removes the region.
    await prompt.getByRole('button', { name: 'Pass on reaction' }).click();
    await session.expectSent('cnmh_reactprompt_e2e-fighter', (v) => v === null);
    await expect(page.getByRole('region', { name: 'Reaction trigger prompt' })).toBeHidden();
  });
});
