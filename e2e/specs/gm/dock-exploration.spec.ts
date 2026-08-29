/**
 * GM Command Dock — exploration pane (#1811, epic #1804 S7, closing slice).
 *
 * S4-S6 built the pane's three surfaces: the party-framed map + tap-to-select/
 * tap-to-move (`DockExplorationPane`), the scene's door glyphs
 * (`DoorGlyphsOverlay`), and the roster strip's GM activity control
 * (`DockExplorationRoster`). This file is their first E2E coverage — proving
 * the real tap → relay-write path end to end, the way `map-bridge.spec.ts`
 * proves the player-side snapshot rail.
 *
 * BRIDGELESS STACK: the local wrangler stack has no Foundry peer, so
 * `mockSession` plays the bridge exactly as `map-bridge.spec.ts` and
 * `movement.spec.ts` do — it answers `cnmh_snapreq_global` with a party-shaped
 * ack (`usePartyMapSurface` adopts ANY ok ack carrying `tokens[]` while
 * active, no id correlation required for that broadcast path, though this
 * file still echoes the request id like every other capture spec) and the
 * `movereq`/`moveplan` pair with `moveopts`/`moveplanned`. The pane's NO
 * CONFIRM GATE ruling (epic #1804) means a planned route is auto-confirmed
 * the instant it lands — so simulating the `moveplanned` ack is what makes
 * the `moveconfirm` write reachable at all on a bridgeless stack; there is no
 * "document why it isn't reachable" caveat here, unlike specs that stop at a
 * bridge-only rail.
 *
 * `cnmh_dooropts_global` needs no round-trip at all: `useSceneDoors` reads it
 * directly off synced state (the bridge re-pushes on every native door change,
 * so there is nothing to correlate) — seeding it in the initial `mockSession`
 * seed is the whole story.
 *
 * PROTOCOL GATING: party map + door glyphs both need `bridgeHello(21)`
 * (`PARTY_MAP_PROTOCOL` — strictly above `SCENE_DOORS_PROTOCOL`, 20) or
 * neither rail renders at all — presence alone (what `mockSession` reports
 * by default) is not enough, per `helpers/bridge.ts`.
 */

import { test, expect, type APIRequestContext, type Page } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { gotoExplorationDock } from '../../helpers/dock';
import { bridgeHello, PARTY_MAP_PROTOCOL, PATHFIND_PROTOCOL } from '../../helpers/bridge';

const PELLIAS_ID = 'e2e-pellias';
const PELLIAS_NAME = 'E2E Pellias';
const ASHKA_ID = 'e2e-ashka';
const ASHKA_NAME = 'E2E Ashka';

const CHARACTERS = [
  { id: PELLIAS_ID, name: PELLIAS_NAME, level: 5 },
  { id: ASHKA_ID, name: ASHKA_NAME, level: 5 },
];

// An IDENTITY capture transform (map-bridge.spec.ts's convention): world
// pixels == capture-space pixels, so a tap at (nx, ny) resolves to world
// (nx·1000, ny·1000) and, at gridSize 100, to cell (⌊nx·10⌋, ⌊ny·10⌋).
const CAPTURE = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 1000, screenH: 1000, sceneId: 'e2e-scene' };
const WORLD_RECT = { x1: 0, y1: 0, x2: 1000, y2: 1000 };
const GRID_SIZE = 100;

// Two PC tokens, each centered in its own grid cell — a tap at its exact
// (nx, ny) is therefore a direct footprint hit (buildPartyMarkers +
// hitTestMarkers), never a nearest-within-tolerance judgment call.
const TOKENS = [
  { moverId: PELLIAS_ID, x: 150, y: 150 }, // cell (1,1) → nx 0.15, ny 0.15
  { moverId: ASHKA_ID, x: 350, y: 150 },   // cell (3,1) → nx 0.35, ny 0.15
];

// A destination well clear of both tokens and both doors below.
const DEST_NX = 0.55;
const DEST_NY = 0.15; // world (550, 150) → cell (5, 1)

// Every door on the scene (cnmh_dooropts_global carries ALL of them, not a
// proximity-filtered list) — one openable, one already locked.
const DOOR_OPEN = { wallId: 'e2e-door-open', state: 0, x: 700, y: 150 };     // nx 0.7
const DOOR_LOCKED = { wallId: 'e2e-door-locked', state: 2, x: 850, y: 150 }; // nx 0.85

// An 8×8 PNG (84 bytes) — square, so it renders as a square that fits inside
// the viewer frame's clip at any reasonable viewport (map-bridge.spec.ts's
// same fixture).
const SNAPSHOT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAG0lEQVR4nGNY5RJq7BKKSTJgFV3l' +
    'EsowKHUAAMQfQeFax4r+AAAAAElFTkSuQmCC',
  'base64',
);

/** Upload the snapshot PNG through the worker's real GM image endpoint (same
 *  as map-bridge.spec.ts) so the party ack's `url` is genuinely servable —
 *  MapSnapshotViewer's tap math divides through the IMAGE's rendered rect,
 *  and an image that never decodes leaves that rect 0×0. */
async function uploadSnapshotImage(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/gm/images', {
    multipart: {
      file: { name: 'e2e-dock-exploration.png', mimeType: 'image/png', buffer: SNAPSHOT_PNG },
      name: 'E2E dock exploration snapshot',
      folder: 'Scene Snapshots',
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return `/api/images/${id}`;
}

/** A party-framed `snapdone` ack (#1807/#1808): `tokens[]` present,
 *  `moverId: null` at the top level — the shape `usePartyMapSurface` adopts,
 *  distinct from the mover-centered/legacy GM-view acks other specs push. */
const partyAck = (id: string, url: string) => ({
  id,
  ok: true,
  url,
  capture: CAPTURE,
  worldRect: WORLD_RECT,
  gridSize: GRID_SIZE,
  tokens: TOKENS,
  moverId: null,
  trigger: 'request',
  ts: Date.now(),
});

/** Play the bridge for the party capture: answer every `snapreq` with the
 *  party ack, echoing the request's own id (harmless — `usePartyMapSurface`'s
 *  adoption effect doesn't require it, but `useSceneSnapshot`'s own promise
 *  does, and that's what actually resolves `capture()`). */
function answerPartyCaptures(session: MockSession, url: string) {
  session.onSent('cnmh_snapreq_global', (req) => {
    session.push('cnmh_snapdone_global', partyAck(req.id, url));
  });
}

const baseSeed = (protocol: number) => ({
  cnmh_bridgehello_global: bridgeHello(protocol, 'e2e-dock-exploration'),
  cnmh_exploremove_global: true,
  cnmh_dooropts_global: { doors: [DOOR_OPEN, DOOR_LOCKED], sceneId: 'e2e-scene', reqTs: null },
});

/** Wait for the map image to actually decode — its rendered rect drives every
 *  tap's nx/ny math (mirrors map-bridge.spec.ts's `tapSnapshot`) — then tap it
 *  at a normalized point. No `map-snapshot-pin` assertion here: unlike the
 *  player's placement viewer, `DockExplorationPane` never passes a `marker`
 *  prop (selection is drawn by `PartyTokensOverlay` instead), so a tap leaves
 *  no pin behind to check. */
async function tapMap(page: Page, nx: number, ny: number) {
  const img = page.getByRole('img', { name: 'Battlefield snapshot' });
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
    .toBe(true);
  const box = (await img.boundingBox())!;
  const frame = (await page.getByTestId('map-snapshot-frame').boundingBox())!;
  const x = box.x + nx * box.width;
  const y = box.y + ny * box.height;
  // .msv-frame clips at max-height:60vh — a tap past the fold lands on
  // whatever sits under the viewer instead of the map.
  if (y < frame.y || y > frame.y + frame.height) {
    throw new Error(`tapMap: ny=${ny} falls outside the clipped frame — pick a point nearer the top`);
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

test.describe('GM dock exploration pane (#1811, epic #1804 S7)', () => {
  let imageUrl: string;

  test.beforeEach(async ({ reset, seed, request }) => {
    await reset();
    await seed({ character: CHARACTERS });
    imageUrl = await uploadSnapshotImage(request);
  });

  // ── (1) hydration + tap-to-select/tap-to-move ───────────────────────────────

  test('hydrates the party map; tapping a PC then a destination sends moveplan and auto-confirms', async ({
    page,
  }) => {
    const session = await mockSession(page, { seed: baseSeed(PARTY_MAP_PROTOCOL) });
    answerPartyCaptures(session, imageUrl);
    // Bridge half of the movement machine: answer movereq with opts (just
    // enough to correlate the reqTs and open the picker), and moveplan with a
    // planned route to the tapped cell.
    session.onSent(`cnmh_movereq_${PELLIAS_ID}`, (req) => {
      session.push(`cnmh_moveopts_${PELLIAS_ID}`, {
        reqTs: req.ts,
        origin: { col: 1, row: 1 },
        reachable: [],
        blocked: [],
      });
    });
    session.onSent(`cnmh_moveplan_${PELLIAS_ID}`, (req) => {
      session.push(`cnmh_moveplanned_${PELLIAS_ID}`, {
        reqTs: req.ts,
        path: [{ col: 5, row: 1, x: 550, y: 150 }],
        costFeet: 20,
        clipped: false,
      });
    });

    // Hydration gate: the pane's own heading first (mounted immediately —
    // exploration is the dock's default mode), THEN the rendered snapshot
    // image, which only appears once the seeded bridgehello has hydrated
    // eligible and the mocked capture round-trip has landed.
    await gotoExplorationDock(page);
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toBeVisible();

    // Tap the seeded Pellias token: selects them as the active mover and
    // fires their movereq (mirrors DockExplorationRoster.test.jsx's own
    // pane-selection coverage, just through the real tap path instead of the
    // roster chip).
    await tapMap(page, 0.15, 0.15);
    await expect(page.locator('[data-mover-id="e2e-pellias"].pto-marker--selected')).toHaveCount(1);
    await session.expectSent(`cnmh_movereq_${PELLIAS_ID}`);
    await expect(page.getByText(`Tap a destination for ${PELLIAS_NAME}.`)).toBeVisible();

    // Tap a destination clear of every marker: the pane resolves it as a move
    // target and sends moveplan with the tapped cell.
    await tapMap(page, DEST_NX, DEST_NY);
    await session.expectSent(
      `cnmh_moveplan_${PELLIAS_ID}`,
      (v) => Array.isArray(v?.waypoints) && v.waypoints[0]?.col === 5 && v.waypoints[0]?.row === 1,
    );

    // NO CONFIRM GATE (epic #1804 ruling): the instant the planned route
    // lands, the pane confirms it itself — moveconfirm carries the planned
    // path verbatim, with no second GM tap in between.
    const confirm = await session.expectSent(`cnmh_moveconfirm_${PELLIAS_ID}`);
    expect(confirm.waypoints).toEqual([{ col: 5, row: 1, x: 550, y: 150 }]);
  });

  // #1833 (epic #1831 P2): on a protocol-23+ (pathfinding) bridge, a planned
  // route can be a dense multi-corner dog-leg around a wall instead of a
  // straight line to the tapped cell (the bridge routes around it itself
  // now, PR #1834). This pane's NO CONFIRM GATE auto-confirms the instant
  // moveplanned lands, so this proves the routed shape survives that
  // auto-confirm verbatim — not collapsed to the tapped destination — and
  // that the route overlay draws every corner, not just the endpoints.
  test('a dog-legged routed plan auto-confirms with every corner intact and renders on the overlay', async ({
    page,
  }) => {
    const session = await mockSession(page, { seed: baseSeed(PATHFIND_PROTOCOL) });
    answerPartyCaptures(session, imageUrl);
    session.onSent(`cnmh_movereq_${PELLIAS_ID}`, (req) => {
      session.push(`cnmh_moveopts_${PELLIAS_ID}`, {
        reqTs: req.ts,
        origin: { col: 1, row: 1 },
        reachable: [],
        blocked: [],
      });
    });
    // A dog-leg from origin (1,1) toward the tapped (5,1): east, jog south
    // around an obstacle, east again, then back north onto the target row —
    // 4 corners, 6 cells, deliberately NOT collinear with origin→destination.
    const dogLeg = [
      { col: 2, row: 1, x: 250, y: 150 },
      { col: 2, row: 2, x: 250, y: 250 },
      { col: 3, row: 2, x: 350, y: 250 },
      { col: 4, row: 2, x: 450, y: 250 },
      { col: 4, row: 1, x: 450, y: 150 },
      { col: 5, row: 1, x: 550, y: 150 },
    ];
    session.onSent(`cnmh_moveplan_${PELLIAS_ID}`, (req) => {
      session.push(`cnmh_moveplanned_${PELLIAS_ID}`, {
        reqTs: req.ts,
        path: dogLeg,
        costFeet: 60,
        clipped: false,
      });
    });

    await gotoExplorationDock(page);
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toBeVisible();

    await tapMap(page, 0.15, 0.15);
    await session.expectSent(`cnmh_movereq_${PELLIAS_ID}`);
    await tapMap(page, DEST_NX, DEST_NY);
    await session.expectSent(`cnmh_moveplan_${PELLIAS_ID}`);

    // Auto-confirm echoes the ENTIRE routed path verbatim — every corner, in
    // order — not just the tapped destination cell.
    const confirm = await session.expectSent(`cnmh_moveconfirm_${PELLIAS_ID}`);
    expect(confirm.waypoints).toEqual(dogLeg);

    // The route overlay (SnapshotRouteOverlay, claimed polyline-shape-
    // agnostic) draws the origin plus every routed cell — 7 points total,
    // not a 2-point straight shortcut.
    const routeLine = page.locator('svg.sro--own .sro-line');
    await expect(routeLine).toHaveCount(1);
    const pointCount = await routeLine.evaluate(
      (el) => (el.getAttribute('points') || '').trim().split(/\s+/).filter(Boolean).length,
    );
    expect(pointCount).toBe(7);
  });

  // ── (2) door glyphs ──────────────────────────────────────────────────────

  test('door glyphs: tapping an openable door sends doorinteract; a locked door sends nothing', async ({
    page,
  }) => {
    const session = await mockSession(page, { seed: baseSeed(PARTY_MAP_PROTOCOL) });
    answerPartyCaptures(session, imageUrl);

    await gotoExplorationDock(page);
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toBeVisible();
    // Both doors render once the snapshot frame is up — dooropts_global needs
    // no round-trip (useSceneDoors reads it straight off synced state).
    await expect(page.locator('[data-wall-id="e2e-door-open"]')).toHaveCount(1);
    await expect(page.locator('[data-wall-id="e2e-door-locked"]')).toHaveCount(1);

    await tapMap(page, 0.7, 0.15);
    const first = await session.expectSent(
      'cnmh_doorinteract_global',
      (v) => v?.wallId === 'e2e-door-open',
    );
    expect(first.op).toBe('open');

    // The locked door's tap is a no-op (DockExplorationPane never calls
    // interactDoor for state 2). Absence needs an anchor (dock.ts's own
    // rule): tap the openable door a SECOND time right after, and wait for
    // that second write — since the mock's message handling is in click
    // order, by the time it lands anything the locked tap was going to send
    // would already be on the wire too.
    await tapMap(page, 0.85, 0.15);
    await tapMap(page, 0.7, 0.15);
    await expect
      .poll(() => session.sent.filter((m) => m.stateType === 'doorinteract').length)
      .toBe(2);

    const lockedWrites = session.sent.filter(
      (m) => m.stateType === 'doorinteract' && (m.value as any)?.wallId === 'e2e-door-locked',
    );
    expect(lockedWrites).toHaveLength(0);
  });

  // ── (3) roster: activity picks, readiness override, new beat ──────────────

  test('roster: an activity pick writes cnmh_exploration_<id>; readiness override and new beat behave', async ({
    page,
  }) => {
    // No bridgehello at all — the roster strip is "rendered whether or not
    // the bridge is up" by design (DockExplorationRoster.jsx's own header
    // comment), so this proves that degraded-pane promise independently of
    // the map/door coverage above.
    const session = await mockSession(page, { seed: {} });
    await gotoExplorationDock(page);

    const pelliasChip = page.getByTestId(`dock-exp-chip-${PELLIAS_ID}`);
    const ashkaChip = page.getByTestId(`dock-exp-chip-${ASHKA_ID}`);
    await expect(pelliasChip).toBeVisible();
    await expect(page.locator('.dock-exp-roster-ready')).toHaveText('0 / 2 picked');

    // Act-as pick: the GM sets Pellias's activity from the dock, on the same
    // key the player's own picker writes.
    await pelliasChip.getByRole('button', { name: `Set activity for ${PELLIAS_NAME}` }).click();
    await pelliasChip.getByRole('button', { name: /^Defend/ }).click();
    await session.expectSent(`cnmh_exploration_${PELLIAS_ID}`, (v) => v === 'Defend');
    await expect(pelliasChip).toContainText('Defend');
    await expect(page.locator('.dock-exp-roster-ready')).toHaveText('1 / 2 picked');
    await expect(ashkaChip).toContainText('No activity');

    // Readiness override: "Start movement" lets the party move before every
    // PC has picked.
    const startBtn = page.getByRole('button', { name: 'Start movement' });
    await expect(startBtn).toHaveAttribute('aria-pressed', 'false');
    await startBtn.click();
    await session.expectSent('cnmh_exploreoverride_global', (v) => v === true);
    await expect(startBtn).toHaveAttribute('aria-pressed', 'true');

    // New beat: nulls every PC's pick in one tap and drops the override with it.
    await page.getByRole('button', { name: 'New beat' }).click();
    await session.expectSent(`cnmh_exploration_${PELLIAS_ID}`, (v) => v === null);
    await session.expectSent('cnmh_exploreoverride_global', (v) => v === false);
    await expect(pelliasChip).toContainText('No activity');
    await expect(page.locator('.dock-exp-roster-ready')).toHaveText('0 / 2 picked');
    await expect(startBtn).toHaveAttribute('aria-pressed', 'false');
  });
});
