/**
 * Live map — snapshot tap-to-move + pathpreview route ghosts (epic #1744, S8).
 *
 * The two halves the epic joins, both already covered end-to-end elsewhere in
 * isolation — map-bridge.spec.ts drives the snapshot/ping/template rail
 * (#1573 B1-B4) and move-confirm-gate.spec.ts drives the abstract-grid
 * plan/confirm pipeline (#1736 S4) — but nothing yet drives the battlefield
 * SNAPSHOT as the Move sheet's destination picker, nor the `pathpreview` route
 * ghosts drawn on top of it (#1746/#1747/#1748). This file is that coverage.
 * It extends both existing mechanisms rather than inventing a third:
 *
 *   - `mockSession` (#293) plays the bridge, exactly as move-confirm-gate.spec.ts
 *     does for movereq/moveplan/moveconfirm and map-bridge.spec.ts does for
 *     snapreq/snapdone — extended here with the mover-centered fields WS-2
 *     added (`moverId`/`radiusFeet` on the request, `moverId`/`trigger` on the
 *     ack) and the two new global route-ghost channels WS-1 added
 *     (`cnmh_pathpreview_global` PUBLIC, `cnmh_pathpreviewgm_global` GM-only).
 *   - The snapshot image upload is map-bridge.spec.ts's own trick: nothing is
 *     stubbed, the PNG genuinely round-trips through `POST /api/gm/images` →
 *     R2 → `GET /api/images/*`, because `MapSnapshotViewer` divides a tap by
 *     the rendered `<img>`'s rect and a src the stack can't serve leaves that
 *     rect 0×0.
 *
 * ONE DIFFERENCE from map-bridge.spec.ts's `tapSnapshot`: MoveActionSheet
 * never passes MapSnapshotViewer a `marker` prop (there's no drop pin in the
 * move flow — the destination reads back as the drawn route + confirm bar
 * instead), so `map-snapshot-pin` never appears here. `tapMoveMap` below taps
 * the same way but settles on the `moveplan` the tap produced, not a pin.
 *
 * Geometry is deliberately an IDENTITY capture (`a:1,b:0,c:0,d:1,tx:0,ty:0`)
 * over a 1000×1000 world at gridSize 100 — a tap at normalized (nx, ny) lands
 * on cell (⌊nx·10⌋, ⌊ny·10⌋) with no matrix arithmetic to second-guess, and
 * every tap point below sits at a cell's center (±0.05 of margin either side)
 * so a stray pixel of real-mouse rounding can never cross a cell boundary.
 *
 * Route ghosts (`SnapshotRouteOverlay`) are presentational, `aria-hidden` SVG
 * — `.sro--own` / `.sro--ghost` / `.sro-line` are the CSS-class contract the
 * component itself documents (and the unit suites
 * MoveActionSheet.pathpreviewGhosts.test.jsx assert on identically), so
 * locating by class here is the correct, not the fallback, approach.
 *
 * Hydration gate (#843/#1366): every test opens Encounter and waits for the
 * self-status bar's "End turn" button before touching the deck.
 */

import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState, deckBody, budget } from '../../helpers/encounter';
import { expectSheet, openPlayTab, expectMyTurnLive } from '../../helpers/sheet';
import { bridgeHello, MAP_MOVE_PROTOCOL, MOVE_SNAP_TIMEOUT_MS } from '../../helpers/bridge';

const CHAR_ID = 'e2e-live-map-mover';
const CHAR_NAME = 'E2E Live Map Mover';
const SPEED = 10; // ft — 1.5x-Speed mover-centered radius (WS-2/OQ-5) = 15 ft.
const ORIGIN = { col: 5, row: 5 };
const SCENE_ID = 'e2e-live-map-scene';
const GRID_SIZE = 100;

const character = () => ({ id: CHAR_ID, name: CHAR_NAME, level: 1, speed: SPEED });

// An IDENTITY stage transform: world pixels == capture-space pixels over a
// 1000x1000 world at gridSize 100, so a tap at (nx, ny) resolves to world
// (nx*1000, ny*1000) and cell (⌊nx*10⌋, ⌊ny*10⌋) with zero matrix math to
// second-guess — mirrors map-bridge.spec.ts's IDENTITY_CAPTURE.
const IDENTITY_CAPTURE = {
  a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 1000, screenH: 1000, sceneId: SCENE_ID,
};
const WORLD_RECT = { x1: 0, y1: 0, x2: 1000, y2: 1000 };

const baseSeed = (protocol: number) => ({
  cnmh_bridgehello_global: bridgeHello(protocol, 'e2e-live-map-bridge'),
  cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME),
  [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
});

// An 8x8 PNG (84 bytes) — same fixture map-bridge.spec.ts uses. Square, so it
// renders as a square inside the viewer frame's max-height clip.
const SNAPSHOT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAG0lEQVR4nGNY5RJq7BKKSTJgFV3l' +
    'EsowKHUAAMQfQeFax4r+AAAAAElFTkSuQmCC',
  'base64',
);

/** Upload the snapshot PNG through the worker's real GM image endpoint and
 *  return the `/api/images/<id>` URL a mocked `snapdone` can point at. */
async function uploadSnapshotImage(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/gm/images', {
    multipart: {
      file: { name: 'e2e-live-map-snapshot.png', mimeType: 'image/png', buffer: SNAPSHOT_PNG },
      name: 'E2E live map snapshot',
      folder: 'Scene Snapshots',
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return `/api/images/${id}`;
}

/** Answer every `movereq` with a fixed origin/speed — the tap flow only reads
 *  `origin` off this reply; `reachable`/`blocked` back the grid-fallback
 *  scenarios, where MoveGridPicker's tap-mode buttons render off the radius
 *  regardless of what's actually marked reachable. */
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

/** Answer every mover-centered `snapreq` with an identity-matrix ack pointing
 *  at the uploaded image — echoes the request's own `moverId` back, exactly
 *  as the real bridge's mover-centered ack does (WS-2). */
function answerCaptures(session: MockSession, imageUrl: string) {
  session.onSent('cnmh_snapreq_global', (req) => {
    session.push('cnmh_snapdone_global', {
      id: req.id,
      ok: true,
      url: imageUrl,
      capture: IDENTITY_CAPTURE,
      worldRect: WORLD_RECT,
      gridSize: GRID_SIZE,
      moverId: req.moverId,
      trigger: 'request',
      ts: Date.now(),
    });
  });
}

/** Answer every `moveplan` by landing on the LAST tapped waypoint, at a fixed
 *  cost — mirrors move-confirm-gate.spec.ts's `answerMovePlan`. */
function answerMovePlan(session: MockSession, costFeet: number) {
  session.onSent(`cnmh_moveplan_${CHAR_ID}`, (req) => {
    const waypoints = req.waypoints as Array<{ col: number; row: number }>;
    const last = waypoints[waypoints.length - 1];
    session.push(`cnmh_moveplanned_${CHAR_ID}`, {
      reqTs: req.ts,
      path: [{ col: last.col, row: last.row, x: last.col * GRID_SIZE, y: last.row * GRID_SIZE }],
      costFeet,
      clipped: false,
    });
  });
}

/** Answer every `moveconfirm` by landing where the plan said, at the given
 *  feetMoved. */
function answerMoveConfirm(session: MockSession, feetMoved: number) {
  session.onSent(`cnmh_moveconfirm_${CHAR_ID}`, (req) => {
    const waypoints = req.waypoints as Array<{ col: number; row: number }>;
    const last = waypoints[waypoints.length - 1];
    session.push(`cnmh_movedone_${CHAR_ID}`, {
      reqTs: req.ts,
      newPosition: { col: last.col, row: last.row },
      feetMoved,
    });
  });
}

/** A `pathpreview`/`pathpreviewgm` payload for a mover the viewer is not —
 *  shape pinned by foundry-bridge/__fixtures__/relay/pathpreview{,gm}.json. */
const ghostPreview = (overrides: Record<string, unknown> = {}) => ({
  tokenId: 'tok-ghost-mover',
  id: 'e2e-ghost-mover',
  name: 'Ghost Mover',
  disposition: 1,
  sceneId: SCENE_ID,
  origin: { col: 1, row: 1 },
  path: [{ col: 2, row: 1 }, { col: 3, row: 1 }],
  phase: 'move',
  source: 'foundry',
  ts: Date.now(),
  ...overrides,
});

/** Sheet → Encounter tab → deck's Actions segment, gated on hydration. */
async function openActionsSegment(page: Page) {
  await page.goto(`/character/${CHAR_ID}`);
  await expectSheet(page, CHAR_NAME);
  await openPlayTab(page, 'Encounter');
  await expectMyTurnLive(page);
  await page.getByRole('tab', { name: 'Actions' }).click();
}

/** Tap the deck's Stride tile and confirm through ConfirmSheet — opens the
 *  MoveActionSheet dialog. */
async function openStrideSheet(page: Page) {
  await deckBody(page).getByRole('button', { name: 'Stride', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Stride' }).click();
  await expect(page.getByRole('dialog', { name: 'Stride' })).toBeVisible();
}

const surfaceToggle = (page: Page) => page.getByRole('group', { name: 'Movement surface' });
const confirmBar = (page: Page) => page.getByRole('group', { name: 'Confirm move' });

/** Flip the sheet's device-sticky Grid/Map toggle to Map — fires the
 *  mover-centered `snapreq` (useMoverMapSurface's active-edge effect). */
const switchToMap = (page: Page) => surfaceToggle(page).getByRole('button', { name: 'Map' }).click();

/** Wait for the battlefield snapshot to actually be decoded — mirrors
 *  map-bridge.spec.ts's `tapSnapshot`: a 0x0 image rect makes every tap a
 *  silent no-op, so this is the load-bearing gate before any tap math. */
async function waitForMapImage(page: Page) {
  const img = page.getByRole('img', { name: 'Battlefield snapshot' });
  await img.scrollIntoViewIfNeeded();
  await expect
    .poll(
      () => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
      { message: 'the map snapshot never loaded — is the snapdone url servable?' },
    )
    .toBe(true);
  return img;
}

/** Tap the rendered snapshot at normalized (nx, ny). Unlike map-bridge.spec.ts's
 *  `tapSnapshot`, MoveActionSheet never renders a `map-snapshot-pin` (there's
 *  no drop-pin affordance in the move flow — the destination reads back via
 *  the drawn route + confirm bar instead), so this settles on the caller's
 *  own follow-up assertion (the `moveplan` the tap produced) rather than a
 *  pin appearing. */
async function tapMoveMap(page: Page, nx: number, ny: number) {
  const img = await waitForMapImage(page);
  const box = (await img.boundingBox())!;
  const frame = (await page.getByTestId('map-snapshot-frame').boundingBox())!;
  const x = box.x + nx * box.width;
  const y = box.y + ny * box.height;
  if (y < frame.y || y > frame.y + frame.height) {
    throw new Error(`tapMoveMap: ny=${ny} falls outside the clipped frame — pick a point nearer the top`);
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

/** Enter map mode from a freshly-opened Stride sheet: switch the toggle,
 *  answer the mover-centered snapreq it fires, and wait for the image. */
async function enterMapMode(page: Page, session: MockSession) {
  await switchToMap(page);
  const req = await session.expectSent('cnmh_snapreq_global', (v) => v?.moverId === CHAR_ID);
  await waitForMapImage(page);
  return req;
}

test.describe('Live map — snapshot tap-to-move + route ghosts (#1744 S8)', () => {
  let imageUrl: string;

  test.beforeEach(async ({ reset, seed, request }) => {
    await reset();
    await seed({ character: [character()] });
    imageUrl = await uploadSnapshotImage(request);
  });

  // ── Scenario 1: tap-to-move end to end ──────────────────────────────────

  test('map mode: tap the snapshot to plan, confirm, and complete a Stride', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_MOVE_PROTOCOL) });
    answerMoveReq(session);
    answerCaptures(session, imageUrl);
    answerMovePlan(session, 10); // 2 cells = 10 ft = 1 action at Speed 10
    answerMoveConfirm(session, 10);

    await openActionsSegment(page);
    await openStrideSheet(page);

    const req = await enterMapMode(page, session);
    // Mover-centered radius is 1.5x the sheet's own Speed (WS-2/OQ-5), sent
    // only once we actually have one.
    expect(req.radiusFeet).toBe(SPEED * 1.5);

    // (0.75, 0.35) on the identity capture -> world (750, 350) -> cell (7, 3),
    // dead-center of that cell so real-mouse pixel rounding can't cross a
    // boundary either way.
    await tapMoveMap(page, 0.75, 0.35);

    await session.expectSent(
      `cnmh_moveplan_${CHAR_ID}`,
      (v) => v?.waypoints?.length === 1 && v.waypoints[0].col === 7 && v.waypoints[0].row === 3,
    );

    await expect(confirmBar(page)).toContainText('10 ft — 1 action');
    const confirmBtn = page.getByRole('button', { name: 'Confirm', exact: true });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    const confirm = await session.expectSent(
      `cnmh_moveconfirm_${CHAR_ID}`,
      (v) => v?.waypoints?.[0]?.col === 7 && v.waypoints[0]?.row === 3 && v.actionCost === 1,
    );
    expect(confirm.moveType).toBe('stride');

    // The sheet closes once movedone lands, and the turn budget reflects the
    // one charged action — same settled state move-confirm-gate.spec.ts pins
    // for the abstract-grid version of this exact flow.
    await expect(page.getByRole('dialog', { name: 'Stride' })).toHaveCount(0);
    await expect(budget(page)).toHaveAttribute('aria-valuenow', '2'); // 3 - 1
  });

  // ── Scenario 2: ghost render ─────────────────────────────────────────────

  test('ghost render: another mover\'s route draws while map mode is showing, and drops on a scene mismatch', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_MOVE_PROTOCOL) });
    answerMoveReq(session);
    answerCaptures(session, imageUrl);

    await openActionsSegment(page);
    await openStrideSheet(page);
    await enterMapMode(page, session);

    // The viewer's own in-progress plan overlay is always present once the
    // map is showing; no ghost exists yet.
    await expect(page.locator('.sro--own')).toHaveCount(1);
    await expect(page.locator('.sro--ghost')).toHaveCount(0);

    session.push('cnmh_pathpreview_global', ghostPreview());
    const ghost = page.locator('.sro--ghost');
    await expect(ghost).toHaveCount(1);
    // The route line itself renders — proves the geometry pipeline actually
    // ran (forward transform + polyline), not just an empty overlay shell.
    await expect(ghost.locator('.sro-line')).toHaveCount(1);

    // A later payload for the SAME token, on a scene other than the one this
    // capture came from, no longer qualifies — the ghost disappears rather
    // than lingering under stale geometry.
    session.push('cnmh_pathpreview_global', ghostPreview({ sceneId: 'scene-elsewhere', ts: Date.now() }));
    await expect(page.locator('.sro--ghost')).toHaveCount(0);
  });

  // ── Scenario 3: hidden-token absence ────────────────────────────────────

  test('hidden-token absence: a preview reaching only the GM channel never renders on this player surface', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_MOVE_PROTOCOL) });
    answerMoveReq(session);
    answerCaptures(session, imageUrl);

    await openActionsSegment(page);
    await openStrideSheet(page);
    await enterMapMode(page, session);

    // Simulates the bridge's WS-1 filter: a hidden/hostile mover is written
    // ONLY to the GM channel, never to the public one MoveActionSheet reads
    // (usePathPreview({ audience: 'player' }) is hardcoded on this surface —
    // it is never a GM-exclusive mount).
    session.push('cnmh_pathpreviewgm_global', ghostPreview({
      tokenId: 'tok-hidden-ambusher',
      id: 'e2e-hidden-ambusher',
      name: 'Hidden Ambusher',
      disposition: -1,
    }));

    // A second, PUBLIC-channel ghost for a DIFFERENT token, pushed after the
    // GM-only one on the same socket, proves message ordering rather than
    // resting on a blind sleep: once this one is visible, the GM-only push
    // has already been processed by the same synchronous relay pipeline, and
    // the count staying at exactly 1 shows it was never rendered as a ghost.
    session.push('cnmh_pathpreview_global', ghostPreview({ tokenId: 'tok-sentinel', id: 'e2e-sentinel', ts: Date.now() }));

    const ghost = page.locator('.sro--ghost');
    await expect(ghost).toHaveCount(1);
    await expect(ghost.locator('.sro-line')).toHaveCount(1);
  });

  // ── Scenario 4: fallbacks to the abstract grid ──────────────────────────

  test('fallback: an explicit snapdone nack drops straight to the grid, which stays fully usable', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_MOVE_PROTOCOL) });
    answerMoveReq(session);
    session.onSent('cnmh_snapreq_global', (req) => {
      session.push('cnmh_snapdone_global', { id: req.id, ok: false, ts: Date.now() });
    });

    await openActionsSegment(page);
    await openStrideSheet(page);
    await switchToMap(page);

    await expect(page.getByText('Map unavailable — using the grid.')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toHaveCount(0);
    // The tap grid underneath the notice is still fully usable — same buttons
    // move-confirm-gate.spec.ts drives, just reached via the map-mode fallback
    // instead of the toggle staying on Grid the whole time.
    expect(await page.getByRole('button', { name: /^Move to / }).count()).toBeGreaterThan(0);
  });

  test('fallback: no snapdone reply inside the map-mode deadline also drops to the grid', async ({ page }) => {
    test.setTimeout(45_000); // MOVE_SNAP_TIMEOUT_MS (8s) plus normal hydration headroom.
    const session = await mockSession(page, { seed: baseSeed(MAP_MOVE_PROTOCOL) });
    answerMoveReq(session);
    // No handler registered for cnmh_snapreq_global — the request is simply
    // never answered, proving the map-mode deadline (not SNAP_TIMEOUT_MS)
    // governs this picker.

    await openActionsSegment(page);
    await openStrideSheet(page);
    await switchToMap(page);

    await expect(page.getByText('Loading map…')).toBeVisible();
    await expect(page.getByText('Map unavailable — using the grid.')).toBeVisible({
      timeout: MOVE_SNAP_TIMEOUT_MS + 10_000,
    });
  });

  test('fallback: below the map-move protocol floor, no toggle renders at all and the grid still works', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_MOVE_PROTOCOL - 1) });
    answerMoveReq(session);
    answerMovePlan(session, 10);

    await openActionsSegment(page);
    await openStrideSheet(page);

    // A protocol-15 bridge speaks the full plan/confirm pipeline (>= 14) but
    // not the WS-1/WS-2 map rail (>= 16) — the toggle simply never mounts,
    // not merely stays disabled.
    await expect(surfaceToggle(page)).toHaveCount(0);
    expect(await page.getByRole('button', { name: /^Move to / }).count()).toBeGreaterThan(0);

    // …and the grid still genuinely drives a plan, not just renders buttons.
    await page.getByRole('button', { name: new RegExp(`^Move to ${ORIGIN.col + 1},${ORIGIN.row} —`) }).click();
    await session.expectSent(
      `cnmh_moveplan_${CHAR_ID}`,
      (v) => v?.waypoints?.length === 1 && v.waypoints[0].col === ORIGIN.col + 1 && v.waypoints[0].row === ORIGIN.row,
    );
    await expect(confirmBar(page)).toContainText('10 ft — 1 action');
  });
});
