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

  // #451: when movedone carries the next cell's options (nextOpts), a chained
  // step refreshes the pad immediately without a second movereq round-trip.
  test('movedone nextOpts refreshes the pad with no extra movereq round-trip', async ({
    page,
    reset,
    seed,
  }) => {
    await reset();
    await seed({ character: [{ id: 'e2e-mover', name: 'E2E Mover', level: 1 }] });

    const session = await mockSession(page, {
      seed: {
        cnmh_playmode_global: 'exploration',
        cnmh_exploremove_global: true,
        cnmh_exploreoverride_global: true,
      },
    });

    // Count movereqs; answer each with an eastward step from origin (5,5).
    let movereqs = 0;
    session.onSent('cnmh_movereq_e2e-mover', (req) => {
      movereqs += 1;
      session.push('cnmh_moveopts_e2e-mover', {
        reqTs: req.ts,
        origin: { col: 5, row: 5 },
        reachable: [{ col: 6, row: 5, feet: 5 }],
        blocked: [],
      });
    });

    await page.goto('/character/e2e-mover');
    await page
      .getByRole('navigation', { name: 'Character sheet sections' })
      .getByRole('button', { name: 'Exploration' })
      .click();

    const stepEast = page.getByRole('button', { name: 'Step east' });
    await expect(stepEast).toBeVisible();
    expect(movereqs).toBe(1); // the auto-fired probe on mount
    await stepEast.click();

    const confirm = await session.expectSent(
      'cnmh_moveconfirm_e2e-mover',
      (v) => v?.destination?.col === 6 && v?.destination?.row === 5,
    );

    // Piggyback the NEXT cell's options (a northward step from the new origin).
    session.push('cnmh_movedone_e2e-mover', {
      reqTs: confirm.ts,
      feetMoved: 5,
      nextOpts: { origin: { col: 6, row: 5 }, reachable: [{ col: 6, row: 4, feet: 5 }], blocked: [] },
    });

    // The pad re-renders straight from nextOpts — a north step is now offered —
    // and the distance tally advances, all without another movereq.
    await expect(page.getByRole('button', { name: 'Step north' })).toBeVisible();
    await expect(page.getByLabel('Distance walked')).toContainText('5 ft');
    expect(movereqs).toBe(1);
  });
});
