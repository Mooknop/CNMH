/**
 * Ready an Action (#501) — the on-turn declare surface, untested before this
 * file (part of the encounter-modals gap #1127, under epic #519). On the PC's
 * own turn a 2-action Ready stores a free-text action + trigger in
 * `cnmh_readied_<charId>`, which the off-turn stage later arms. Seeded via
 * mockSession (#293).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import {
  activeEncounter,
  readyTurnState,
  encounterState,
  pcEntry,
  enemyEntry,
  expectOffTurnLive,
} from '../../helpers/encounter';
import { expectSheet, openPlayTab } from '../../helpers/sheet';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';

test.describe('Ready an Action', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }] });
  });

  test('declaring a readied action writes the synced key + logs, spending 2 actions', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME), // PC is the current turn
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page, CHAR_NAME);
    await openPlayTab(page, 'Encounter');

    await page.getByRole('button', { name: 'Ready an action' }).click();
    await page.getByLabel('Action to ready').fill('Strike');
    await page.getByLabel('Trigger').fill('when an enemy enters my reach');
    await page.getByRole('button', { name: 'Confirm ready' }).click();

    await session.expectSent(
      `cnmh_readied_${CHAR_ID}`,
      (v) => v?.actionName === 'Strike' && v?.trigger === 'when an enemy enters my reach',
    );
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log) && v.log.some((e: any) => String(e.text).includes('readies Strike')),
    );

    // The standing declaration is shown with an undo…
    const status = page.getByRole('status');
    await expect(status).toContainText('Readied');
    await expect(status).toContainText('Strike');

    // …and cancelling it clears the key.
    await page.getByRole('button', { name: 'Cancel readied action' }).click();
    await session.expectSent(`cnmh_readied_${CHAR_ID}`, (v) => v === null);
  });

  // #1131 item 1 resolution: cnmh_readied DOES hydrate from FULL_STATE. The
  // earlier "didn't hydrate" observation was TurnTrackerPanel's turn-begin
  // sweep: seeding the PC as current turn WITHOUT a matching turnState.turnToken
  // reads as a turn that just began, which lapses the readied action by design.
  // These two tests pin both halves.
  test('a standing readied action hydrates mid-turn (reconnect shape)', async ({ page }) => {
    await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        // Matching token = the turn was already in progress, as a real client
        // rejoining mid-turn would have persisted.
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
        [`cnmh_readied_${CHAR_ID}`]: { actionName: 'Raise a Shield', trigger: '', round: 1, ts: 1 },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page, CHAR_NAME);
    await openPlayTab(page, 'Encounter');

    const status = page.getByRole('status');
    await expect(status).toContainText('Readied');
    await expect(status).toContainText('Raise a Shield');
  });

  test('a readied action lapses when the owner\'s turn begins (token mismatch)', async ({ page }) => {
    const session = await mockSession(page, {
      seed: {
        cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
        // No turnToken → the panel treats this as the turn starting NOW; a
        // declaration left over from last round expires (#501).
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
        [`cnmh_readied_${CHAR_ID}`]: { actionName: 'Raise a Shield', trigger: '', round: 1, ts: 1 },
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page, CHAR_NAME);
    await openPlayTab(page, 'Encounter');

    await session.expectSent(`cnmh_readied_${CHAR_ID}`, (v) => v === null);
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log) && v.log.some((e: any) => String(e.text).includes('readied action (Raise a Shield) expired')),
    );
    await expect(page.getByRole('button', { name: 'Ready an action' })).toBeVisible();
  });

  // Out-of-turn guard (#518): Ready is an on-turn-only declare surface —
  // ReadyActionButton (src/components/encounter/ReadyActionButton.jsx) returns
  // null outright unless isCharTurn(encounter, charId), unlike the soft
  // OutOfTurnNotice warning other actions get. Off-turn the encounter stage
  // (#471) takes over the play area entirely, so this pins both halves: the
  // stage is up, and Ready never renders anywhere on the page while it is.
  test('Ready an action does not render off-turn — it is an on-turn-only surface', async ({ page }) => {
    await mockSession(page, {
      seed: {
        cnmh_encounter_global: encounterState({
          phase: 'in-progress',
          round: 1,
          currentTurnIndex: 1, // the goblin is acting, not the fighter
          order: [pcEntry(CHAR_ID, CHAR_NAME, 20), enemyEntry('E2E Goblin', 15)],
        }),
        [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState(),
      },
    });

    await page.goto(`/character/${CHAR_ID}`);
    await expectSheet(page, CHAR_NAME);
    await openPlayTab(page, 'Encounter');

    await expectOffTurnLive(page);
    await expect(page.getByRole('button', { name: 'Ready an action' })).toHaveCount(0);
  });
});
