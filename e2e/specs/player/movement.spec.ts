/**
 * First E2E of the token-movement state machine
 * (movereq → moveopts → moveconfirm → movedone, src/hooks/useTokenMovement.jsx),
 * driven through the real exploration UI (ExplorationMove → MoveGridPicker).
 *
 * This is the proving spec for the WebSocket intercept fixture (#293): there's
 * no Foundry peer on the local stack (or staging), so the bridge half of the
 * relay can only be simulated. `mockSession` plays the bridge — it answers the
 * app's movereq with reachable squares and confirms the completed move — while
 * the character itself still loads from the real content DO.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';

test.describe('Exploration token movement (bridge-driven)', () => {
  test('movereq → mocked opts → pick a step → moveconfirm → mocked done', async ({
    page,
    reset,
    seed,
  }) => {
    await reset();
    await seed({ character: [{ id: 'e2e-mover', name: 'E2E Mover', level: 1 }] });

    // Seed the synced state that puts the sheet into exploration Movement:
    //  - playmode exploration  (usePlayMode → mode)
    //  - exploremove enabled   (usePlayMode → moveEnabled)
    //  - exploreoverride        (useExplorationReady → ready, skips the party
    //                            activity-ready check so the move pad shows)
    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_exploremove_global: true,
        cnmh_exploreoverride_global: true,
      },
    });

    // Play the Foundry bridge: answer every movereq with one reachable square to
    // the east. The app correlates opts by `reqTs === the ts it sent`.
    session.onSent('cnmh_movereq_e2e-mover', (req) => {
      session.push('cnmh_moveopts_e2e-mover', {
        reqTs: req.ts,
        origin: { col: 5, row: 5 },
        reachable: [{ col: 6, row: 5, feet: 5 }],
        blocked: [],
      });
    });

    await page.goto('/character/e2e-mover');

    // Sheet lands on the Stats tab; open the mode-aware play tab (Exploration).
    await page
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Exploration' })
      .click();

    // ExplorationMove auto-fires movereq on mount (no button); the mock answers,
    // so the step pad renders an eastward step.
    const stepEast = page.getByRole('button', { name: 'Step east' });
    await expect(stepEast).toBeVisible();
    await stepEast.click();

    // The app emits moveconfirm with the picked destination.
    const confirm = await session.expectSent(
      'cnmh_moveconfirm_e2e-mover',
      (v) => v?.destination?.col === 6 && v?.destination?.row === 5,
    );

    // Bridge reports the move completed → the distance tally updates, no reload.
    session.push('cnmh_movedone_e2e-mover', { reqTs: confirm.ts, feetMoved: 5 });
    await expect(page.getByLabel('Distance walked')).toContainText('5 ft');
  });
});
