/**
 * PC Stride plan/confirm rail (epic #1736 S4) — the destination-tap + confirm
 * gate MoveActionSheet grew on a protocol-14+ bridge (PR #1739), on top of the
 * bridge's moveplan/moveplanned relay pair + waypoint moveconfirm (PR #1738).
 *
 * Sibling to movement.spec.ts rather than an extension of it: that file drives
 * ExplorationMove's old stepper (movereq/moveopts/moveconfirm/movedone,
 * destination-only). This file drives the ENCOUNTER surface — ActionsList's
 * Stride tile → MoveActionSheet — which is where the new tap-plan-confirm
 * stages (`awaiting-plan`/`planned`, useTokenMovement.jsx) actually render.
 * The fake bridge here is the same `mockSession` mechanism (#293), extended
 * with the two new relay legs:
 *
 *   cnmh_moveplan_<id>    (app → bridge)  { waypoints:[{col,row}], moveType, ts }
 *   cnmh_moveplanned_<id> (bridge → app)  { path:[{col,row,x,y}], costFeet, clipped, reqTs }
 *
 * — both declared in src/sync/keys.js RELAY (folded onto the bridge-relay
 * re-export) and foundry-bridge/syncKeys.js RELAY (#1738), so no drift risk to
 * restate here.
 *
 * Bridge protocol gate: MoveActionSheet reads `useBridgeStatus().protocol` off
 * `cnmh_bridgehello_global` (helpers/bridge.ts's `bridgeHello`). The tap flow
 * is eligible only for Stride at protocol >= FULL_MOVE_PROTOCOL (14, mirrored
 * from src/utils/movement.js — see that constant's doc comment in
 * helpers/bridge.ts for the drift-risk note shared by every protocol floor in
 * this file). Below that floor — or with no hello at all — there is no more
 * D-pad fallback for Stride: #1736 S5 retired it once the tap flow was
 * table-verified, so the sheet shows a compact outdated-bridge notice
 * instead. The last test in this file proves that notice renders correctly.
 *
 * Speed is seeded at a deliberately small 10 ft (character.speed, the SP1-SP4
 * derive-speed spine) so the tap-mode grid's radius (3x-Speed, capped at 12
 * cells) stays small — 13x13 — and each cell's action-cost band is exact:
 * 10 ft = 1 action, 20 ft = 2 actions.
 *
 * Hydration gate (#843/#1366): every test opens Encounter and waits for the
 * self-status bar's "End turn" button (`expectMyTurnLive`) before touching the
 * deck — the classic false-negative here is asserting on the Actions tab
 * before the encounter-mode surface has actually mounted.
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState, deckBody, budget } from '../../helpers/encounter';
import { expectSheet, openPlayTab, expectMyTurnLive } from '../../helpers/sheet';
import { bridgeHello, FULL_MOVE_PROTOCOL } from '../../helpers/bridge';

const CHAR_ID = 'e2e-move-confirm';
const CHAR_NAME = 'E2E Move Confirm';
const SPEED = 10; // ft — keeps the tap grid small (radius 6) and the math exact.
const ORIGIN = { col: 5, row: 5 };

const character = () => ({ id: CHAR_ID, name: CHAR_NAME, level: 1, speed: SPEED });

const baseSeed = (protocol: number, turnOverrides: Record<string, unknown> = {}) => ({
  cnmh_bridgehello_global: bridgeHello(protocol, 'e2e-move-confirm-bridge'),
  cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
  [`cnmh_turnstate_${CHAR_ID}`]: { ...readyTurnState('1:0'), ...turnOverrides },
});

/** Answer every `movereq` with a fixed origin/speed and one eastward reachable
 *  step. The tap flow ignores `reachable` — it's carried for the below-floor
 *  test (test 6), where MoveActionSheet requests opts on open regardless of
 *  protocol but has no pad left to render them into (#1736 S5). */
function answerMoveReq(session: MockSession) {
  session.onSent(`cnmh_movereq_${CHAR_ID}`, (req) => {
    session.push(`cnmh_moveopts_${CHAR_ID}`, {
      reqTs: req.ts,
      origin: ORIGIN,
      reachable: [{ col: ORIGIN.col + 1, row: ORIGIN.row, feet: 5, terrain: 'normal' }],
      blocked: [],
      speed: SPEED,
    });
  });
}

/** Answer every `moveplan` with a straight-east route of the given cost,
 *  landing on the LAST tapped waypoint (or `clipped` short of it). */
function answerMovePlan(
  session: MockSession,
  opts: { costFeet: number; clipped?: boolean; landCol?: number },
) {
  session.onSent(`cnmh_moveplan_${CHAR_ID}`, (req) => {
    const waypoints = req.waypoints as Array<{ col: number; row: number }>;
    const last = waypoints[waypoints.length - 1];
    const landCol = opts.landCol ?? last.col;
    session.push(`cnmh_moveplanned_${CHAR_ID}`, {
      reqTs: req.ts,
      path: [{ col: landCol, row: ORIGIN.row, x: landCol * 100, y: ORIGIN.row * 100 }],
      costFeet: opts.costFeet,
      clipped: !!opts.clipped,
    });
  });
}

/** Answer every `moveconfirm` with a `movedone` landing at the given cell. */
function answerMoveConfirm(session: MockSession, feetMoved: number, landCol: number) {
  session.onSent(`cnmh_moveconfirm_${CHAR_ID}`, (req) => {
    session.push(`cnmh_movedone_${CHAR_ID}`, {
      reqTs: req.ts,
      newPosition: { col: landCol, row: ORIGIN.row },
      feetMoved,
    });
  });
}

const tapCell = (page: import('@playwright/test').Page, col: number, row: number) =>
  page.getByRole('button', { name: new RegExp(`^Move to ${col},${row} —`) }).click();

/** Sheet → Encounter tab → deck's Actions segment, gated on hydration. */
async function openActionsSegment(page: import('@playwright/test').Page) {
  await page.goto(`/character/${CHAR_ID}`);
  await expectSheet(page, CHAR_NAME);
  await openPlayTab(page, 'Encounter');
  await expectMyTurnLive(page);
  await page.getByRole('tab', { name: 'Actions' }).click();
}

/** Tap the deck's Stride tile and confirm through ConfirmSheet — opens the
 *  MoveActionSheet dialog. */
async function openStrideSheet(page: import('@playwright/test').Page) {
  await deckBody(page).getByRole('button', { name: 'Stride', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Stride' }).click();
  await expect(page.getByRole('dialog', { name: 'Stride' })).toBeVisible();
}

const confirmBar = (page: import('@playwright/test').Page) => page.getByRole('group', { name: 'Confirm move' });

test.describe('PC Stride plan/confirm gate (#1736 S4)', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({ character: [character()] });
  });

  // ── 1: full-speed stride ────────────────────────────────────────────────

  test('destination tap → plan → confirm → the move executes and the sheet closes', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(FULL_MOVE_PROTOCOL) });
    answerMoveReq(session);
    answerMovePlan(session, { costFeet: 10 }); // 2 cells east = 10 ft = 1 action at Speed 10
    answerMoveConfirm(session, 10, 7);

    await openActionsSegment(page);
    await openStrideSheet(page);

    await tapCell(page, 7, 5);
    await session.expectSent(`cnmh_moveplan_${CHAR_ID}`, (v) => v?.waypoints?.length === 1 && v.waypoints[0].col === 7);

    await expect(confirmBar(page)).toContainText('10 ft — 1 action');
    const confirmBtn = page.getByRole('button', { name: 'Confirm', exact: true });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Actions are spent AT CONFIRM, before the bridge even answers movedone.
    await expect(budget(page)).toHaveAttribute('aria-valuenow', '2'); // 3 - 1

    const confirm = await session.expectSent(
      `cnmh_moveconfirm_${CHAR_ID}`,
      (v) => Array.isArray(v?.waypoints) && v.waypoints[0]?.col === 7 && v.actionCost === 1,
    );
    expect(confirm.moveType).toBe('stride');

    // The sheet closes once movedone lands (mockSession's answerMoveConfirm
    // already pushed it in response to the moveconfirm above).
    await expect(page.getByRole('dialog', { name: 'Stride' })).toHaveCount(0);

    // Action economy AND the session log both reflect one full 10-ft move.
    await expect(budget(page)).toHaveAttribute('aria-valuenow', '2');
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log) && v.log.some((e: any) => String(e.text).includes(`${CHAR_NAME} moved 10 ft`)),
    );
  });

  // ── 2: multi-action charge ──────────────────────────────────────────────

  test('a plan costing more than one Speed charges multiple actions at confirm', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(FULL_MOVE_PROTOCOL) });
    answerMoveReq(session);
    answerMovePlan(session, { costFeet: 20 }); // 4 cells east = 20 ft = 2 actions at Speed 10
    answerMoveConfirm(session, 20, 9);

    await openActionsSegment(page);
    await openStrideSheet(page);

    await tapCell(page, 9, 5);
    await expect(confirmBar(page)).toContainText('20 ft — 2 actions');

    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(budget(page)).toHaveAttribute('aria-valuenow', '1'); // 3 - 2

    const confirm = await session.expectSent(`cnmh_moveconfirm_${CHAR_ID}`, (v) => v?.actionCost === 2);
    expect(confirm.waypoints[0].col).toBe(9);

    // Landed exactly as planned (no stop-short) — no refund, budget holds at 1.
    await expect(page.getByRole('dialog', { name: 'Stride' })).toHaveCount(0);
    await expect(budget(page)).toHaveAttribute('aria-valuenow', '1');
  });

  // ── 3: disable-when-short ───────────────────────────────────────────────

  test('Confirm disables with a hint when the plan costs more actions than remain', async ({ page }) => {
    // Pre-spend 2 of the 3 actions this turn — only 1 remains, but the planned
    // route below prices at 2.
    const session = await mockSession(page, {
      seed: baseSeed(FULL_MOVE_PROTOCOL, { actionsSpent: 2, actionsLog: [{ name: 'Test setup', cost: 2, ts: 1 }] }),
    });
    answerMoveReq(session);
    answerMovePlan(session, { costFeet: 20 });

    await openActionsSegment(page);
    await expect(budget(page)).toHaveAttribute('aria-valuenow', '1');
    await openStrideSheet(page);

    await tapCell(page, 9, 5);
    await expect(confirmBar(page)).toContainText('20 ft — 2 actions');
    await expect(page.getByText('Not enough actions left this turn.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();

    // Budget is untouched — nothing was ever charged.
    await expect(budget(page)).toHaveAttribute('aria-valuenow', '1');
  });

  // ── 4: stop-short refund ────────────────────────────────────────────────

  test('a legal stop-short refunds the over-charged action and logs the refund', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(FULL_MOVE_PROTOCOL) });
    answerMoveReq(session);
    answerMovePlan(session, { costFeet: 20 }); // planned 2 actions
    answerMoveConfirm(session, 10, 7); // actually only walked 10 ft (1 action's worth)

    await openActionsSegment(page);
    await openStrideSheet(page);

    await tapCell(page, 9, 5);
    await expect(confirmBar(page)).toContainText('20 ft — 2 actions');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    // Confirm charged 2 actions up front — asserted off the SENT payload
    // rather than a transient meter read, since the mocked movedone answers
    // moveconfirm essentially immediately and a live poll could easily only
    // ever observe the post-refund value.
    const confirm = await session.expectSent(`cnmh_moveconfirm_${CHAR_ID}`, (v) => v?.actionCost === 2);
    expect(confirm.waypoints[0].col).toBe(9);

    // The bridge's movedone lands short, and 1 action is refunded (2 charged
    // - 1 actually needed for 10 ft at Speed 10) — this is the settled state.
    await expect(budget(page)).toHaveAttribute('aria-valuenow', '2'); // 3 - 2 + 1
    await expect(page.getByRole('dialog', { name: 'Stride' })).toHaveCount(0);

    await session.expectSent(
      `cnmh_turnstate_${CHAR_ID}`,
      (v) => Array.isArray(v?.actionsLog) && v.actionsLog.some((e: any) => e.name === 'Stride refund' && e.cost === -1),
    );
    await session.expectSent(
      'cnmh_encounter_global',
      (v) => Array.isArray(v?.log) && v.log.some((e: any) => String(e.text).includes(`${CHAR_NAME} moved 10 ft`)),
    );
  });

  // ── 5: clipped plan → waypoint chain ────────────────────────────────────

  test('a clipped plan shows the wall note; tapping further chains a waypoint', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(FULL_MOVE_PROTOCOL) });
    answerMoveReq(session);

    // First plan: 1 cell east, clipped at a "wall" — 5 ft only.
    session.onSent(`cnmh_moveplan_${CHAR_ID}`, (req) => {
      const waypoints = req.waypoints as Array<{ col: number; row: number }>;
      if (waypoints.length === 1) {
        session.push(`cnmh_moveplanned_${CHAR_ID}`, {
          reqTs: req.ts,
          path: [{ col: 6, row: ORIGIN.row, x: 600, y: ORIGIN.row * 100 }],
          costFeet: 5,
          clipped: true,
        });
      } else {
        // Second (chained) plan: both waypoints go through, 15 ft total.
        session.push(`cnmh_moveplanned_${CHAR_ID}`, {
          reqTs: req.ts,
          path: [
            { col: 6, row: ORIGIN.row, x: 600, y: ORIGIN.row * 100 },
            { col: 8, row: ORIGIN.row, x: 800, y: ORIGIN.row * 100 },
          ],
          costFeet: 15,
          clipped: false,
        });
      }
    });

    await openActionsSegment(page);
    await openStrideSheet(page);

    // First tap — clipped short of the requested cell.
    await tapCell(page, 6, 5);
    await session.expectSent(`cnmh_moveplan_${CHAR_ID}`, (v) => v?.waypoints?.length === 1 && v.waypoints[0].col === 6);
    await expect(page.getByText('Path stops at a wall — tap further to add a waypoint.')).toBeVisible();

    // Second tap — the app CHAINS this cell onto the existing plan rather than
    // replacing it, per the clipped-plan corner-waypoint gesture.
    await tapCell(page, 8, 5);
    const chained = await session.expectSent(
      `cnmh_moveplan_${CHAR_ID}`,
      (v) => Array.isArray(v?.waypoints) && v.waypoints.length === 2,
    );
    expect(chained.waypoints).toEqual([
      { col: 6, row: ORIGIN.row },
      { col: 8, row: ORIGIN.row },
    ]);

    // The re-planned route (now unclipped) prices the full 15 ft chain.
    await expect(confirmBar(page)).toContainText('15 ft — 2 actions');
  });

  // ── 6: below-protocol-floor notice (#1736 S5) ───────────────────────────

  test('a protocol-13 bridge shows the outdated-bridge notice — the Stride D-pad fallback is retired', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(FULL_MOVE_PROTOCOL - 1) });
    answerMoveReq(session);

    await openActionsSegment(page);
    await openStrideSheet(page);

    // No confirm-gate UI and no D-pad at all below FULL_MOVE_PROTOCOL — #1736
    // S5 retired the Stride stepper fallback, so there's nothing left to drive
    // a move with. A compact notice explains why and names the fix.
    await expect(confirmBar(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Step east' })).toHaveCount(0);
    await expect(page.getByTestId('mas-outdated-notice')).toBeVisible();
    await expect(page.getByTestId('mas-outdated-notice')).toContainText(
      'Full-speed Stride needs the CNMH Bridge module updated to protocol 14+.',
    );

    // Budget untouched — nothing was ever charged, and no relay traffic was
    // sent besides the initial movereq (there's no pad to tap).
    await expect(budget(page)).toHaveAttribute('aria-valuenow', '3');

    // The sheet still closes normally via its own Cancel/close affordance.
    await page.getByRole('dialog', { name: 'Stride' }).getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog', { name: 'Stride' })).toHaveCount(0);
  });
});
