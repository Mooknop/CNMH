/**
 * GM dashboard Quick Action modals (#350) — the dashboard-modals half of the
 * issue, complementing gm-dashboard.spec.ts (play mode, advance time, Adjust HP,
 * Apply Effect — do not duplicate those here).
 *
 * Every modal writes synced state, so the relay is mocked (mockSession #293)
 * and each write asserted via expectSent. All interactions are scoped to the
 * shared Modal's role="dialog" (aria-label = title) so quick-action launcher
 * buttons with similar names never collide with in-dialog controls.
 *
 * Drift from the issue text (surfaces changed since #350 was filed):
 *  - "Start Encounter" is no longer a dashboard modal. Encounters are started
 *    in Foundry and relayed by the bridge into cnmh_encounter_global — the
 *    dashboard's InitiativePanel ("Waiting for combat to start in Foundry")
 *    is the replacement surface. Its GM-actionable control is the Foundry
 *    actor → PC assignment, which writes cnmh_actormap_global; that is what
 *    the last test covers, seeding an active encounter through mockSession.
 *  - /gm/encounter (GmEncounter) was retired in #1554: App.jsx now redirects
 *    `encounter` → /gm/dock. Nothing to test there.
 *
 * Desktop-only (GM Tools has no responsive layout).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { encounterState, pcEntry } from '../../helpers/encounter';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';

test.describe('GM dashboard Quick Action modals', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
  });

  test('Set Location picks a Location lore entry and writes cnmh_campaign_global', async ({
    page,
    seed,
  }) => {
    // Seeding `lore` REPLACES the bundled catalog, so the picker offers exactly
    // this entry. visibility stays 'gm' on purpose: the GM picker reads
    // allLoreEntries, so an unrevealed location must still be pickable.
    await seed({
      lore: [
        {
          id: 'e2e-sandpoint',
          title: 'E2E Sandpoint',
          category: 'Location',
          summary: 'A test town.',
          visibility: 'gm',
        },
      ],
    });
    const session = await mockSession(page, { seed: {} });
    await page.goto('/gm');

    await page.getByRole('button', { name: 'Set party location' }).click();
    const dialog = page.getByRole('dialog', { name: 'Set Location' });
    await dialog.getByRole('button', { name: /E2E Sandpoint/ }).click();

    await session.expectSent(
      'cnmh_campaign_global',
      (v) => v?.location === 'E2E Sandpoint' && v?.locationLoreId === 'e2e-sandpoint',
    );
    // Picking closes the modal.
    await expect(dialog).toBeHidden();
  });

  test('Party Gold edits a character row and writes cnmh_gold_<id>', async ({ page }) => {
    const session = await mockSession(page, { seed: { 'cnmh_gold_e2e-fighter': 25 } });
    await page.goto('/gm');

    await page.getByRole('button', { name: 'Set party gold' }).click();
    const dialog = page.getByRole('dialog', { name: 'Party Gold' });
    const input = dialog.getByLabel(`${CHAR_NAME} gold`);
    await expect(input).toHaveValue('25'); // seeded value hydrated
    await input.fill('150');

    await session.expectSent('cnmh_gold_e2e-fighter', (v) => v === 150);
  });

  test('Recall Knowledge sends a skill prompt to the targeted character', async ({ page }) => {
    const session = await mockSession(page, { seed: {} });
    await page.goto('/gm');

    await page.getByRole('button', { name: 'Send Recall Knowledge prompt' }).click();
    const dialog = page.getByRole('dialog', { name: 'Recall Knowledge' });

    await dialog.getByLabel('creature or subject label').fill('E2E Dragon');
    await dialog.getByLabel('knowledge skill').selectOption('nature');
    // Suggested-DC rail: level + rarity derive a DC the GM can adopt.
    await dialog.getByLabel('creature level').fill('3');
    await dialog.getByRole('button', { name: /Use suggested DC/ }).click();
    await expect(dialog.getByLabel('recall knowledge DC')).not.toHaveValue('');
    // Override with an explicit DC so the asserted value is spec-owned.
    await dialog.getByLabel('recall knowledge DC').fill('18');
    await dialog.getByLabel('target characters').selectOption(CHAR_ID);
    await dialog.getByLabel('Send recall knowledge prompt').click();

    await session.expectSent(
      'cnmh_skillprompt_e2e-fighter',
      (v) => v?.skill === 'nature' && v?.dc === 18 && v?.label === 'E2E Dragon' && !!v?.reqId,
    );
    // The send is also journaled to the session log.
    await session.expectSent(
      'cnmh_sessionlog_global',
      (v) => JSON.stringify(v).includes('E2E Dragon'),
    );
  });

  test('Skill Challenge starts a Victory Point track on cnmh_vpchallenge_global', async ({
    page,
  }) => {
    const session = await mockSession(page, { seed: {} });
    await page.goto('/gm');

    await page.getByRole('button', { name: 'Start a skill challenge' }).click();
    const dialog = page.getByRole('dialog', { name: 'Skill Challenge' });

    await dialog.getByLabel('challenge name').fill('E2E Ford the River');
    await dialog.getByLabel('skill 1', { exact: true }).selectOption('athletics');
    await dialog.getByLabel('skill 1 DC').fill('15');
    await dialog.getByLabel('victory point threshold').fill('3');
    await dialog.getByLabel('Start skill challenge').click();

    await session.expectSent('cnmh_vpchallenge_global', (v) => {
      const tracks = Object.values(v || {}) as any[];
      return tracks.some(
        (t) =>
          t?.name === 'E2E Ford the River' &&
          t?.threshold === 3 &&
          t?.skills?.[0]?.skill === 'athletics' &&
          t?.skills?.[0]?.dc === 15 &&
          (t?.targetIds || []).includes(CHAR_ID),
      );
    });
    await expect(dialog).toBeHidden();
  });

  test('encounter start is Foundry-driven: seeded encounter renders the Initiative panel and actor assignment writes cnmh_actormap_global', async ({
    page,
  }) => {
    // No "Start Encounter" modal exists on the dashboard (see header comment) —
    // the bridge writes cnmh_encounter_global when combat starts in Foundry.
    // Seed that state as the bridge peer and drive the panel it unlocks.
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: encounterState({
          phase: 'in-progress',
          order: [
            pcEntry(CHAR_ID, CHAR_NAME, 18),
            {
              entryId: 'e2e-enemy-goblin',
              kind: 'enemy',
              name: 'E2E Goblin',
              initiative: 15,
              foundryActorId: 'e2e-factor-1',
            },
          ],
        }),
      },
    });
    await page.goto('/gm');

    // encounterMode-only element = the hydration gate before asserting
    // encounter-gated state (wave rule; usePlayMode: encounter.active wins).
    const panel = page.getByRole('region', { name: 'Initiative' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Round 1')).toBeVisible();

    await panel.getByLabel('assign-e2e-enemy-goblin').selectOption(CHAR_ID);
    await session.expectSent(
      'cnmh_actormap_global',
      (v) => v?.['e2e-factor-1'] === CHAR_ID,
    );
  });
});
