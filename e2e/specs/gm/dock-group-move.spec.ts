/**
 * GM Command Dock — exploration group move (#1826, epic #1822's closing
 * slice). Proves the multi-select-and-dispatch loop A2/B1 built
 * (`DockExplorationPane`'s selection SET + `useGroupMove`) over the real
 * relay, on the local wrangler stack, the way `dock-exploration.spec.ts`
 * already proves the size-1 tap-to-move flow.
 *
 * SIBLING FILE, NOT AN EXTENSION of dock-exploration.spec.ts: that file's
 * three specs (party map, door glyphs, roster activity) already run a full
 * `beforeEach` (reset + seed + image upload) and share one two-PC roster
 * shaped for door-glyph geometry. Group move needs a THIRD PC to exercise
 * every outcome bucket (reached/partial/failed) in one settle, and a protocol
 * floor one above `PARTY_MAP_PROTOCOL` — layering that onto the existing file
 * would mean every one of its specs re-deciding whether the extra PC and the
 * higher hello affect party-map/door assertions that never asked for either.
 * A dedicated file keeps this slice's fixture shape (and its own copy of
 * `tapMap`, per this directory's established per-spec-file convention — see
 * `map-bridge.spec.ts`'s `tapSnapshot` / `dock-exploration.spec.ts`'s
 * `tapMap`) isolated from that.
 *
 * SELECTION VIA ROSTER CHIPS: `DockExplorationPane`'s selection is a single
 * `Set` toggled identically by a marker tap or a roster chip tap
 * (`DockExplorationRoster`'s `Select ${name} to move` button) — the pane
 * doesn't know or care which path picked a PC. Every spec below except the
 * single-select regression selects through the chips: it sidesteps needing
 * per-token tap math for three precisely-placed markers just to prove
 * membership, and is exactly the "roster chips" option the issue calls out.
 * The regression spec taps the token directly, since proving the ORIGINAL
 * tap-a-marker-to-select path still resolves to a single mover is the point
 * of that one.
 *
 * BRIDGELESS STACK: as `dock-exploration.spec.ts`, `mockSession` plays the
 * bridge — answering `cnmh_snapreq_global` with a party-shaped ack, and
 * `cnmh_groupmovereq_global` with a correlated `cnmh_groupmovedone_global`
 * this file pushes explicitly (there is no automatic responder for it, since
 * every spec wants a different results shape).
 *
 * PROTOCOL GATING: `GROUP_MOVE_PROTOCOL` (22) is a full floor above
 * `PARTY_MAP_PROTOCOL` (21, `dock-exploration.spec.ts`'s own floor) — a
 * bridge at 21 renders the party map and the size-1 flow just fine, but a 2+
 * selection's destination tap is a deliberate no-op below 22 (#1824's
 * degradation note). The protocol-gate spec below is the one place this file
 * seeds 21 instead of 22.
 */

import { test, expect, type APIRequestContext, type Page } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { gotoExplorationDock } from '../../helpers/dock';
import { bridgeHello, PARTY_MAP_PROTOCOL, GROUP_MOVE_PROTOCOL } from '../../helpers/bridge';

const PELLIAS_ID = 'e2e-pellias';
const PELLIAS_NAME = 'E2E Pellias';
const ASHKA_ID = 'e2e-ashka';
const ASHKA_NAME = 'E2E Ashka';
const CASS_ID = 'e2e-cass';
const CASS_NAME = 'E2E Cass';

const CHARACTERS = [
  { id: PELLIAS_ID, name: PELLIAS_NAME, level: 5 },
  { id: ASHKA_ID, name: ASHKA_NAME, level: 5 },
  { id: CASS_ID, name: CASS_NAME, level: 5 },
];

// IDENTITY capture transform (dock-exploration.spec.ts's own convention):
// world pixels == capture-space pixels, so a tap at (nx, ny) resolves to
// world (nx·1000, ny·1000) and, at gridSize 100, to cell (⌊nx·10⌋, ⌊ny·10⌋).
const CAPTURE = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 1000, screenH: 1000, sceneId: 'e2e-scene' };
const WORLD_RECT = { x1: 0, y1: 0, x2: 1000, y2: 1000 };
const GRID_SIZE = 100;

// Three PC tokens, each centered in its own grid cell — footprint hits, never
// a nearest-within-tolerance judgment call.
const PELLIAS_TOKEN = { moverId: PELLIAS_ID, x: 150, y: 150 }; // cell (1,1)
const ASHKA_TOKEN = { moverId: ASHKA_ID, x: 350, y: 150 }; // cell (3,1)
const CASS_TOKEN = { moverId: CASS_ID, x: 150, y: 350 }; // cell (1,3)
const TOKENS = [PELLIAS_TOKEN, ASHKA_TOKEN, CASS_TOKEN];

// A destination well clear of every seeded token above.
const DEST_NX = 0.55;
const DEST_NY = 0.15; // world (550, 150) → cell (5, 1)

// An 8×8 PNG (84 bytes) — same fixture map-bridge.spec.ts and
// dock-exploration.spec.ts reuse, square so it renders inside the viewer
// frame's clip at any reasonable viewport.
const SNAPSHOT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAG0lEQVR4nGNY5RJq7BKKSTJgFV3l' +
    'EsowKHUAAMQfQeFax4r+AAAAAElFTkSuQmCC',
  'base64',
);

async function uploadSnapshotImage(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/gm/images', {
    multipart: {
      file: { name: 'e2e-dock-group-move.png', mimeType: 'image/png', buffer: SNAPSHOT_PNG },
      name: 'E2E dock group-move snapshot',
      folder: 'Scene Snapshots',
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return `/api/images/${id}`;
}

/** A party-framed `snapdone` ack (#1807/#1808), `tokens` defaulting to the
 *  three seeded PCs' original positions — pass an override to simulate the
 *  bridge's post-group-move rebroadcast landing at NEW positions. */
const partyAck = (id: string, url: string, tokens: Array<Record<string, unknown>> = TOKENS) => ({
  id,
  ok: true,
  url,
  capture: CAPTURE,
  worldRect: WORLD_RECT,
  gridSize: GRID_SIZE,
  tokens,
  moverId: null,
  trigger: 'request',
  ts: Date.now(),
});

function answerPartyCaptures(session: MockSession, url: string) {
  session.onSent('cnmh_snapreq_global', (req) => {
    session.push('cnmh_snapdone_global', partyAck(req.id, url));
  });
}

const baseSeed = (protocol: number) => ({
  cnmh_bridgehello_global: bridgeHello(protocol, 'e2e-dock-group-move'),
  cnmh_exploremove_global: true,
});

/** As `dock-exploration.spec.ts`'s own `tapMap` — waits for the snapshot
 *  image to decode (its rendered rect drives every tap's nx/ny math), then
 *  taps it at a normalized point, guarding against the `.msv-frame` clip. */
async function tapMap(page: Page, nx: number, ny: number) {
  const img = page.getByRole('img', { name: 'Battlefield snapshot' });
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
    .toBe(true);
  const box = (await img.boundingBox())!;
  const frame = (await page.getByTestId('map-snapshot-frame').boundingBox())!;
  const x = box.x + nx * box.width;
  const y = box.y + ny * box.height;
  if (y < frame.y || y > frame.y + frame.height) {
    throw new Error(`tapMap: ny=${ny} falls outside the clipped frame — pick a point nearer the top`);
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

/** Select a PC through their roster chip — the toggle-membership act shared
 *  with a marker tap (see file header). */
const selectChip = (page: Page, name: string) => page.getByRole('button', { name: `Select ${name} to move` }).click();

test.describe('GM dock exploration — group move (#1826, epic #1822 C1)', () => {
  let imageUrl: string;

  test.beforeEach(async ({ reset, seed, request }) => {
    await reset();
    await seed({ character: CHARACTERS });
    imageUrl = await uploadSnapshotImage(request);
  });

  // ── (1) group dispatch ───────────────────────────────────────────────────

  test('multi-selecting two PCs and tapping a destination sends the outbound groupmovereq', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(GROUP_MOVE_PROTOCOL) });
    answerPartyCaptures(session, imageUrl);

    await gotoExplorationDock(page);
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toBeVisible();

    await selectChip(page, PELLIAS_NAME);
    await selectChip(page, ASHKA_NAME);
    await expect(page.getByText('2 selected — tap a destination to move them together.')).toBeVisible();

    await tapMap(page, DEST_NX, DEST_NY);

    const req = await session.expectSent(
      'cnmh_groupmovereq_global',
      (v) => Array.isArray(v?.moverIds)
        && [...v.moverIds].sort().join(',') === [PELLIAS_ID, ASHKA_ID].sort().join(',')
        && v?.target?.col === 5
        && v?.target?.row === 1,
    );
    expect(req.id).toEqual(expect.any(String));
    await expect(page.getByText('Moving 2 party members…')).toBeVisible();
  });

  // ── (2) results + refresh ────────────────────────────────────────────────

  test('a settled groupmovedone renders reached/partial/failed outcome chips, and a fresh party capture moves the markers', async ({
    page,
  }) => {
    const session = await mockSession(page, { seed: baseSeed(GROUP_MOVE_PROTOCOL) });
    answerPartyCaptures(session, imageUrl);

    await gotoExplorationDock(page);
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toBeVisible();

    await page.getByRole('button', { name: 'Select all' }).click();
    await expect(page.getByText('3 selected — tap a destination to move them together.')).toBeVisible();

    await tapMap(page, DEST_NX, DEST_NY);
    const req = await session.expectSent(
      'cnmh_groupmovereq_global',
      (v) => Array.isArray(v?.moverIds) && v.moverIds.length === 3,
    );

    session.push('cnmh_groupmovedone_global', {
      id: req.id,
      results: [
        { moverId: PELLIAS_ID, ok: true, dest: { col: 5, row: 1, x: 550, y: 150 }, feetMoved: 5, reached: true },
        { moverId: ASHKA_ID, ok: true, dest: { col: 6, row: 1, x: 600, y: 150 }, feetMoved: 15, reached: false },
        { moverId: CASS_ID, ok: false, dest: null, feetMoved: 0, reached: false },
      ],
      ts: Date.now(),
    });

    await expect(page.getByTestId(`dock-exp-groupmove-${PELLIAS_ID}`)).toHaveClass(/dock-exp-chip-groupmove--reached/);
    await expect(page.getByTestId(`dock-exp-groupmove-${ASHKA_ID}`)).toHaveClass(/dock-exp-chip-groupmove--partial/);
    await expect(page.getByTestId(`dock-exp-groupmove-${CASS_ID}`)).toHaveClass(/dock-exp-chip-groupmove--failed/);

    // Party-semantic MAX accrual (epic ruling): 15, not the naive 20 ft sum
    // three sequential single moves would tally.
    await expect(page.locator('.dock-exp-distance')).toContainText('15 ft');

    // A fresh, UNSOLICITED party capture — the bridge's post-group-move
    // rebroadcast (epic ruling: one party capture fires after the whole group
    // settles). `usePartyMapSurface` adopts ANY ok ack carrying `tokens[]`
    // while active, no id correlation required (dock-exploration.spec.ts's
    // header documents the same adoption rule for the single-move rail).
    session.push(
      'cnmh_snapdone_global',
      partyAck('grp-refresh', imageUrl, [
        { moverId: PELLIAS_ID, x: 750, y: 150 }, // moved from cell (1,1) to (7,1)
        { moverId: ASHKA_ID, x: 350, y: 150 },
        { moverId: CASS_ID, x: 150, y: 350 },
      ]),
    );

    await expect(page.locator(`[data-mover-id="${PELLIAS_ID}"] .pto-dot`)).toHaveAttribute('cx', '75');
  });

  // ── (3) selection mechanics ──────────────────────────────────────────────

  test('Select all selects every roster PC; Clear empties it; toggling one off leaves the other selected', async ({
    page,
  }) => {
    const session = await mockSession(page, { seed: baseSeed(GROUP_MOVE_PROTOCOL) });
    answerPartyCaptures(session, imageUrl);

    await gotoExplorationDock(page);
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toBeVisible();

    await page.getByRole('button', { name: 'Select all' }).click();
    await expect(page.locator('.pto-marker--selected')).toHaveCount(3);
    await expect(page.getByRole('button', { name: `Select ${PELLIAS_NAME} to move` })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: `Select ${ASHKA_NAME} to move` })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: `Select ${CASS_NAME} to move` })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.locator('.pto-marker--selected')).toHaveCount(0);
    await expect(page.getByText('Tap a party member to move them.')).toBeVisible();

    // Re-select two, then toggle one off — the survivor stays selected (the
    // single-select machine re-arms on the drop back to size 1).
    await selectChip(page, PELLIAS_NAME);
    await selectChip(page, ASHKA_NAME);
    await expect(page.locator('.pto-marker--selected')).toHaveCount(2);

    await selectChip(page, PELLIAS_NAME); // toggle Pellias back off
    await expect(page.locator('.pto-marker--selected')).toHaveCount(1);
    await expect(page.getByRole('button', { name: `Select ${ASHKA_NAME} to move` })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: `Select ${PELLIAS_NAME} to move` })).toHaveAttribute('aria-pressed', 'false');
  });

  // ── (4) single-select regression ─────────────────────────────────────────

  test('single-select regression: with exactly one PC selected, a destination tap still runs movereq/moveplan/auto-confirm', async ({
    page,
  }) => {
    const session = await mockSession(page, { seed: baseSeed(GROUP_MOVE_PROTOCOL) });
    answerPartyCaptures(session, imageUrl);
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

    await gotoExplorationDock(page);
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toBeVisible();

    // Select via the token tap itself (not a chip) — proving the ORIGINAL
    // tap-a-marker-to-select path still resolves to a single mover, unlike
    // the chip-based selection every other spec in this file uses, is the
    // point of this regression.
    await tapMap(page, 0.15, 0.15);
    await expect(page.locator(`[data-mover-id="${PELLIAS_ID}"].pto-marker--selected`)).toHaveCount(1);
    await session.expectSent(`cnmh_movereq_${PELLIAS_ID}`);
    await expect(page.getByText(`Tap a destination for ${PELLIAS_NAME}.`)).toBeVisible();

    await tapMap(page, DEST_NX, DEST_NY);
    await session.expectSent(
      `cnmh_moveplan_${PELLIAS_ID}`,
      (v) => Array.isArray(v?.waypoints) && v.waypoints[0]?.col === 5 && v.waypoints[0]?.row === 1,
    );

    // NO CONFIRM GATE (epic #1804 ruling, unaffected by the group-move rail):
    // the planned route auto-confirms the instant it lands.
    const confirm = await session.expectSent(`cnmh_moveconfirm_${PELLIAS_ID}`);
    expect(confirm.waypoints).toEqual([{ col: 5, row: 1, x: 550, y: 150 }]);

    // The size-1 path never touches the group rail, even with a
    // GROUP_MOVE_PROTOCOL-eligible bridge seeded above.
    expect(session.sent.filter((m) => m.stateType === 'groupmovereq')).toHaveLength(0);
  });

  // ── (5) protocol gate ────────────────────────────────────────────────────

  test('protocol gate: below GROUP_MOVE_PROTOCOL, a 2-PC destination tap sends no groupmovereq', async ({ page }) => {
    // PARTY_MAP_PROTOCOL (21) — the party map itself still renders (its own
    // floor is one below GROUP_MOVE_PROTOCOL), but the group rail stays gated.
    const session = await mockSession(page, { seed: baseSeed(PARTY_MAP_PROTOCOL) });
    answerPartyCaptures(session, imageUrl);

    await gotoExplorationDock(page);
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toBeVisible();

    await selectChip(page, PELLIAS_NAME);
    await selectChip(page, ASHKA_NAME);
    await expect(page.getByText('2 selected — group move arrives with the next bridge update.')).toBeVisible();

    await tapMap(page, DEST_NX, DEST_NY);

    // Absence needs an anchor (helpers/dock.ts's own rule): "New beat" is a
    // confirmed write (per-PC cnmh_exploration_<id> = null) that only lands
    // once the mock has processed everything already queued ahead of it on
    // the wire — including whatever the destination tap above was going to
    // send, if anything.
    await page.getByRole('button', { name: 'New beat' }).click();
    await session.expectSent(`cnmh_exploration_${PELLIAS_ID}`, (v) => v === null);

    expect(session.sent.filter((m) => m.stateType === 'groupmovereq')).toHaveLength(0);
  });
});
