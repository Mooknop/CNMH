/**
 * Map bridge rails (#1591) — the snapshot / ping / area-placement relay the
 * #1573 arc landed (B1–B4), driven through the real player UI.
 *
 * There is no Foundry peer on the local stack, so `mockSession` (#293) plays the
 * bridge exactly as it does for token movement: it answers the app's
 * `cnmh_snapreq_global` with a `cnmh_snapdone_global` ack and records the
 * `cnmh_pingpoint_global` / `cnmh_templateplace_global` the app emits back.
 *
 * Two things make this rail different from the movement one, and both are why
 * it earns an E2E on top of its (thorough) unit coverage:
 *
 *  1. THE IMAGE NEVER RIDES THE RELAY. `snapdone` carries a stable `/api/images`
 *     URL and the browser fetches the bytes over HTTP. `MapSnapshotViewer` turns
 *     a tap into normalized (nx, ny) by dividing through the IMAGE's rendered
 *     rect — a src the stack can't serve leaves that rect 0×0 and every tap is
 *     silently dropped. So this spec uploads a real PNG through the worker's own
 *     `POST /api/gm/images` (GM_DEV_BYPASS makes the runner the GM locally) and
 *     hands the bridge the URL that upload returns. Nothing is stubbed: the
 *     R2 round-trip through `GET /api/images/*` is part of what's under test.
 *  2. THE THREE PROTOCOL FLOORS GATE INDEPENDENTLY (snapshotRelay.js:
 *     SNAP = 11, PING = 12, TEMPLATE = 13). Only a real render can show that a
 *     protocol-11 bridge still opens the placement map while hiding "Ping the
 *     map", and that a protocol-12 one still says where the burst landed with a
 *     bare ping because it can't draw the outline. That degradation matrix is
 *     the most load-bearing part of the file.
 *
 * Geometry is asserted with a small slack (see `expectNear`): the tap is a real
 * mouse event at a real pixel, so one pixel of rounding is inherent — but the
 * emitted numbers are world coordinates off `snapshotGeometry`'s inverse matrix,
 * which are nowhere near the raw pixel the finger landed on, and the spec proves
 * that gap explicitly.
 */

import { expect as baseExpect, type APIRequestContext, type Page } from '@playwright/test';
import { test, expect } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';
import {
  snapshotSpells,
  casterCharacter,
  gotoSheet,
  openSpellsSegment,
  castSpell,
} from '../../helpers/spellcasting';
import { openPlayTab } from '../../helpers/sheet';
// The three independent protocol floors, the capture deadline, and the hello
// payload they are read off — copies of src/utils/snapshotRelay.js, kept in
// helpers/bridge.ts because e2e/ never imports from src/ (see that file's
// header). SNAP_TIMEOUT_MS is only used to prove a nack short-circuits it.
import {
  bridgeHello,
  PING_PROTOCOL,
  SNAP_PROTOCOL,
  SNAP_TIMEOUT_MS,
  TEMPLATE_PROTOCOL,
} from '../../helpers/bridge';

const CHAR_ID = 'e2e-map-caster';
const CHAR_NAME = 'E2E Map Caster';

// Illusory Object: a real seeded rank-1 occult spell whose authored area text
// ("20-foot burst") is what `parseSpellArea` reads. Deliberately a spell with no
// save and no damage — the placement section is what's under test, not the
// resolution machinery stacked on top of it.
const SPELL_ID = 'illusory-object';
const SPELL_NAME = 'Illusory Object';
const AREA_LABEL = '20-foot burst';

// Combatants, with stable entryIds so the seeded positions line up by key.
const CASTER_ENTRY = { entryId: 'ent-caster', kind: 'pc', charId: CHAR_ID, name: CHAR_NAME, initiative: 20 };
const GOBLIN = { entryId: 'ent-goblin', kind: 'enemy' as const, name: 'Goblin', initiative: 15 };
const OGRE = { entryId: 'ent-ogre', kind: 'enemy' as const, name: 'Ogre', initiative: 12 };
const TROLL = { entryId: 'ent-troll', kind: 'enemy' as const, name: 'Troll', initiative: 8 };
const ORDER = [CASTER_ENTRY, GOBLIN, OGRE, TROLL];

// Bridge-reported token grid (cnmh_positions_global). All on row 2. A tap near
// the goblin's square snaps to the grid INTERSECTION at col 3 (#1751 OQ-1 —
// bursts originate at an intersection, not a cell), which touches BOTH the
// goblin's (col 2) and the ogre's (col 3) squares — both measure 0 ft. The
// troll (col 9) is 30 ft away and the caster (col 10) 35 ft, both outside the
// 20-ft burst — PF2e grid distance, the same rule the canvas measures with.
const POSITIONS = {
  gridSize: 100,
  positions: {
    [CASTER_ENTRY.entryId]: { col: 10, row: 2 },
    [GOBLIN.entryId]: { col: 2, row: 2 },
    [OGRE.entryId]: { col: 3, row: 2 },
    [TROLL.entryId]: { col: 9, row: 2 },
  },
};

// An IDENTITY stage transform: world pixels == capture-space pixels, so a tap at
// (nx, ny) resolves to world (nx·1000, ny·1000) and — at gridSize 100 — to cell
// (⌊nx·10⌋, ⌊ny·10⌋). Used by the placement tests, where the assertion that
// matters is which SQUARE the burst landed on.
const IDENTITY_CAPTURE = {
  a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 1000, screenH: 1000, sceneId: 'e2e-scene',
};

// A 2× zoomed stage whose viewport origin sits at world (200, 100) — the same
// shape as the bridge's real worldTransform. Used by the ping test, because the
// world point it yields (500, 200 for a tap at 0.5/0.25) is nothing like the
// pixel the finger landed on, which is the whole point of `snapshotGeometry`.
const ZOOMED_CAPTURE = {
  a: 2, b: 0, c: 0, d: 2, tx: -400, ty: -200, screenW: 1200, screenH: 800, sceneId: 'e2e-scene',
};

// An 8×8 PNG (84 bytes). Square, so `width:100%;height:auto` renders it as a
// square that fits inside the viewer frame's `max-height:60vh` clip on both the
// desktop and mobile projects.
const SNAPSHOT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAG0lEQVR4nGNY5RJq7BKKSTJgFV3l' +
    'EsowKHUAAMQfQeFax4r+AAAAAElFTkSuQmCC',
  'base64',
);

const caster = () =>
  casterCharacter({
    id: CHAR_ID,
    name: CHAR_NAME,
    level: 5,
    slots: { '1': 3 },
    repertoire: [SPELL_ID],
  });

// Seeded synced state every test starts from: a live bridge at `protocol`, an
// active encounter with the caster up, a fresh turn budget (token '1:0' or
// TurnTrackerPanel's turn-begin sweep wipes it), and the bridge's token grid.
const baseSeed = (protocol: number) => ({
  cnmh_bridgehello_global: bridgeHello(protocol, 'e2e-map-bridge'),
  cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, { order: ORDER }),
  [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
  cnmh_positions_global: POSITIONS,
});

/**
 * Upload the snapshot PNG through the worker's real GM image endpoint and
 * return the `/api/images/<id>` URL it mints. This is what the mock bridge puts
 * in its `snapdone` ack — a URL the local stack genuinely serves from R2, so the
 * <img> actually loads and the tap → (nx, ny) math has a non-zero rect to divide
 * through. `reset()` wipes the DOs but not the R2 bucket, so ordering is free.
 */
async function uploadSnapshotImage(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/gm/images', {
    multipart: {
      file: { name: 'e2e-scene-snapshot.png', mimeType: 'image/png', buffer: SNAPSHOT_PNG },
      name: 'E2E scene snapshot',
      folder: 'Scene Snapshots',
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return `/api/images/${id}`;
}

/** A full `snapdone` ack for request `id`. */
const ackFor = (
  id: string,
  url: string,
  capture: Record<string, unknown> = IDENTITY_CAPTURE,
) => ({
  id,
  ok: true,
  url,
  capture,
  worldRect: { x1: 0, y1: 0, x2: 1000, y2: 1000 },
  gridSize: 100,
  ts: Date.now(),
});

/** Play the bridge: answer every capture request with `ack(id)`. */
function answerCaptures(session: MockSession, ack: (id: string) => Record<string, unknown>) {
  session.onSent('cnmh_snapreq_global', (req) => {
    session.push('cnmh_snapdone_global', ack(req.id));
  });
}

const sentValues = (session: MockSession, stateType: string) =>
  session.sent.filter((m) => m.stateType === stateType).map((m) => m.value as any);

// A world coordinate is derived from a REAL mouse event at a real pixel, so a
// pixel of rounding is inherent; ±20 world units is well under a grid square
// (100) here and still fails loudly if the transform is wrong.
const expectNear = (actual: number, expected: number, slack = 20) =>
  baseExpect(
    Math.abs(actual - expected),
    `expected ${actual} to be within ${slack} of ${expected}`,
  ).toBeLessThanOrEqual(slack);

// A burst's placed WORLD point is the nearest grid intersection to the tap,
// not the raw tapped point (#1751 OQ-1 — mirrors `snapToGridIntersection` in
// src/utils/spellArea.js; e2e/ never imports from src/, so this is a small
// standalone copy of the same round-to-nearest-multiple rule). Under
// IDENTITY_CAPTURE, world == capture-space pixels == `nx * screenW`.
const identityWorld = (nx: number) => nx * IDENTITY_CAPTURE.screenW;
const nearestIntersection = (world: number, gridSize = POSITIONS.gridSize) =>
  Math.round(world / gridSize) * gridSize;

/**
 * Tap the rendered snapshot at normalized (nx, ny) and return the image's box.
 *
 * Waits for the image to have actually DECODED first: MapSnapshotViewer divides
 * the tap by `getBoundingClientRect()` on the <img>, and a 0×0 rect makes
 * `endPointer` bail without ever calling onPick — the failure would otherwise
 * surface as a mystifying "pin never appeared".
 */
async function tapSnapshot(page: Page, nx: number, ny: number) {
  const img = page.getByRole('img', { name: 'Battlefield snapshot' });
  await img.scrollIntoViewIfNeeded();
  await expect
    .poll(
      () => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
      { message: 'the snapshot image never loaded — is the snapdone url servable?' },
    )
    .toBe(true);

  const box = (await img.boundingBox())!;
  const frame = (await page.getByTestId('map-snapshot-frame').boundingBox())!;
  const x = box.x + nx * box.width;
  const y = box.y + ny * box.height;
  // .msv-frame clips at max-height:60vh, so a tap past the fold lands on
  // whatever sits under the viewer instead of the map.
  if (y < frame.y || y > frame.y + frame.height) {
    throw new Error(`tapSnapshot: ny=${ny} falls outside the clipped frame — pick a point nearer the top`);
  }

  // A mouse down/up at one point: MapSnapshotViewer only counts a pointer
  // sequence as a tap when it moved < 8px and no second finger joined.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByTestId('map-snapshot-pin')).toBeVisible();
  return box;
}

/** Sheet → Encounter tab, gated on encounter hydration before anything else. */
async function openEncounterTab(page: Page) {
  await gotoSheet(page, CHAR_ID, CHAR_NAME);
  await openPlayTab(page, 'Encounter');
  // `cnmh_encounter_global` is a global key and can land a beat late; the
  // self-status bar's End turn button renders only for an active, in-progress
  // encounter on this PC's turn, so its visibility proves encounterMode is live
  // before any bridge surface is asserted on.
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible();
}

/** Encounter tab → deck's Spells segment → the area spell's cast modal. */
async function openAreaCast(page: Page) {
  await openEncounterTab(page);
  await openSpellsSegment(page);
  await castSpell(page, SPELL_NAME);
  await expect(page.getByRole('button', { name: 'confirm-cast' })).toBeVisible();
}

test.describe('Map bridge rails (#1573 B1–B4)', () => {
  let imageUrl: string;

  test.beforeEach(async ({ reset, seed, request }) => {
    await reset();
    await seed({ spell: snapshotSpells(SPELL_ID), character: [caster()] });
    imageUrl = await uploadSnapshotImage(request);
  });

  // ── B1: capture ────────────────────────────────────────────────────────────

  test('capture: snapreq → snapdone renders the served image in the viewer', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(PING_PROTOCOL) });
    answerCaptures(session, (id) => ackFor(id, imageUrl));

    await openEncounterTab(page);
    await page.getByRole('button', { name: 'Ping the map' }).click();

    // The app asks the GM's client for a photo of the battlefield…
    const req = await session.expectSent('cnmh_snapreq_global', (v) => typeof v?.id === 'string');
    expect(req.id).toMatch(/^snap-/);

    // …and the ack's /api/images URL is what the viewer renders. Asserting the
    // src pins the contract (the bytes never ride the relay); the naturalWidth
    // poll proves the local stack actually served them.
    const img = page.getByRole('img', { name: 'Battlefield snapshot' });
    await expect(img).toHaveAttribute('src', imageUrl);
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true);
  });

  // ── B2: Ping the Map ───────────────────────────────────────────────────────

  test('ping: a tap emits WORLD coordinates off the capture matrix, not raw pixels', async ({
    page,
  }) => {
    const session = await mockSession(page, { seed: baseSeed(PING_PROTOCOL) });
    answerCaptures(session, (id) => ackFor(id, imageUrl, ZOOMED_CAPTURE));

    await openEncounterTab(page);
    await page.getByRole('button', { name: 'Ping the map' }).click();
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toBeVisible();

    // Confirm is disarmed until the player has actually marked a spot.
    await expect(page.getByRole('button', { name: 'Ping here' })).toBeDisabled();
    const box = await tapSnapshot(page, 0.5, 0.25);
    await page.getByRole('button', { name: 'Ping here' }).click();

    // Tap (0.5, 0.25) → capture-space (600, 200) → inverse of the 2×/(-400,-200)
    // matrix → world (500, 200).
    const ping = await session.expectSent('cnmh_pingpoint_global');
    expectNear(ping.x, 500);
    expectNear(ping.y, 200);
    expect(ping.sceneId).toBe('e2e-scene');
    expect(ping.name).toBe(CHAR_NAME);
    expect(ping.id).toMatch(/^ping-/);

    // Raw-pixel proof: the finger landed ~box.width/2 CSS px into a ~400–600px
    // wide image. If the app had shipped pixels instead of world coordinates,
    // x would be in the low hundreds, not 500.
    expect(Math.abs(ping.x - box.width / 2)).toBeGreaterThan(100);

    // …and the button disarms so a second tap on it can't double-ping.
    await expect(page.getByRole('button', { name: 'Pinged ✓' })).toBeDisabled();
  });

  // ── B3 + B4: area placement and the measured template ──────────────────────

  test('area placement: a burst on a protocol-13 bridge draws the template where it landed', async ({
    page,
  }) => {
    const session = await mockSession(page, { seed: baseSeed(TEMPLATE_PROTOCOL) });
    answerCaptures(session, (id) => ackFor(id, imageUrl));

    await openAreaCast(page);

    // The section is titled from the spell's own authored area text.
    const section = page.getByTestId('area-placement-section');
    await expect(section).toContainText(`Area — ${AREA_LABEL}`);
    await section.getByRole('button', { name: 'Place on the map' }).click();

    // Tap (0.25, 0.25) → world (250, 250) → snaps to the nearest grid
    // intersection (300, 300) (#1751 OQ-1 — a burst originates at an
    // intersection, not a cell).
    await tapSnapshot(page, 0.25, 0.25);

    // Occupancy comes from the bridge's real token positions, measured from
    // that intersection with PF2e grid distance: the intersection at col 3
    // touches both the goblin's (col 2) and the ogre's (col 3) squares, so
    // both are 0 ft; the troll (30 ft) and the caster (35 ft) are outside the
    // 20-ft burst.
    const occupants = page.getByTestId('area-occupants');
    await expect(occupants).toContainText('Goblin (0 ft)');
    await expect(occupants).toContainText('Ogre (0 ft)');
    await expect(occupants).not.toContainText('Troll');

    // …and they can be adopted as the cast's targets in one tap.
    await page.getByRole('button', { name: 'Target these 2' }).click();
    await expect(page.getByRole('button', { name: 'Targets set ✓' })).toBeDisabled();

    await page.getByRole('button', { name: 'confirm-cast' }).click();

    // The log line is written inside applyOnConfirm, AFTER the relay send — so
    // waiting on it means any template/ping the flow was going to emit is
    // already recorded, and the absence assertions below can't race.
    await session.expectSent('cnmh_encounter_global', (v) =>
      (v?.log || []).some((e: any) => String(e.text).includes(`${SPELL_NAME} placed (${AREA_LABEL})`)),
    );

    const [template] = sentValues(session, 'templateplace');
    expect(template).toMatchObject({ shape: 'burst', feet: 20, sceneId: 'e2e-scene', name: SPELL_NAME });
    // The SNAPPED intersection, not the raw tapped world point.
    const origin = nearestIntersection(identityWorld(0.25));
    expectNear(template.x, origin);
    expectNear(template.y, origin);
    // The bridge pings the template's centre itself, so the app doesn't double up.
    expect(sentValues(session, 'pingpoint')).toHaveLength(0);
  });

  // ── The independent-gate matrix (SNAP 11 · PING 12 · TEMPLATE 13) ──────────

  test('protocol 11: capture works for placement, but Ping the Map self-hides', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(SNAP_PROTOCOL) });
    answerCaptures(session, (id) => ackFor(id, imageUrl));

    await openEncounterTab(page);
    // The ping channel landed in protocol 12, so the standalone button is gone…
    await expect(page.getByRole('button', { name: 'Ping the map' })).toHaveCount(0);

    // …but capture is its own floor: the placement flow still gets its snapshot.
    await openSpellsSegment(page);
    await castSpell(page, SPELL_NAME);
    const section = page.getByTestId('area-placement-section');
    await expect(section).toBeVisible();
    await section.getByRole('button', { name: 'Place on the map' }).click();
    await tapSnapshot(page, 0.25, 0.25);
    await expect(page.getByTestId('area-occupants')).toContainText('Goblin (0 ft)');

    // Confirming casts normally — placement is never a gate — and simply emits
    // neither rail this bridge can't speak.
    await page.getByRole('button', { name: 'confirm-cast' }).click();
    await session.expectSent('cnmh_encounter_global', (v) =>
      (v?.log || []).some((e: any) => String(e.text).includes(`${SPELL_NAME} placed`)),
    );
    expect(sentValues(session, 'templateplace')).toHaveLength(0);
    expect(sentValues(session, 'pingpoint')).toHaveLength(0);
  });

  test('protocol 12: no outline, but the burst still pings where it landed', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(PING_PROTOCOL) });
    answerCaptures(session, (id) => ackFor(id, imageUrl));

    await openAreaCast(page);
    await page
      .getByTestId('area-placement-section')
      .getByRole('button', { name: 'Place on the map' })
      .click();
    await tapSnapshot(page, 0.25, 0.25);
    await page.getByRole('button', { name: 'confirm-cast' }).click();

    await session.expectSent('cnmh_encounter_global', (v) =>
      (v?.log || []).some((e: any) => String(e.text).includes(`${SPELL_NAME} placed`)),
    );

    // Measured templates need protocol 13; the fallback is B2's bare ping, so
    // the table still sees the spot even without the outline — at the SNAPPED
    // intersection (#1751 OQ-1), same as the drawn template above.
    expect(sentValues(session, 'templateplace')).toHaveLength(0);
    const [ping] = sentValues(session, 'pingpoint');
    const origin = nearestIntersection(identityWorld(0.25));
    expectNear(ping.x, origin);
    expectNear(ping.y, origin);
  });

  test('protocol 10: below every floor, the area label survives but all placement UI is gone (#1751 OQ-6)', async ({ page }) => {
    await mockSession(page, { seed: baseSeed(SNAP_PROTOCOL - 1) });

    await openEncounterTab(page);
    await expect(page.getByRole('button', { name: 'Ping the map' })).toHaveCount(0);

    await openSpellsSegment(page);
    await castSpell(page, SPELL_NAME);
    await expect(page.getByRole('button', { name: 'confirm-cast' })).toBeVisible();

    // The section itself is gated on `hasArea` alone (#1751 OQ-6) — this
    // spell needs placement (a burst), so with no bridge there's still
    // nothing to compute occupancy from, but the area label survives. What's
    // actually gone is everything that needs a capture: the "Place on the
    // map" button and the snapshot viewer.
    const section = page.getByTestId('area-placement-section');
    await expect(section).toContainText(`Area — ${AREA_LABEL}`);
    await expect(section).toContainText('No live map available');
    await expect(section.getByRole('button', { name: 'Place on the map' })).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toHaveCount(0);
    await expect(page.getByTestId('area-occupants')).toHaveCount(0);

    // The spell is still perfectly castable.
    await page.getByRole('button', { name: 'confirm-cast' }).click();
  });

  // ── ok:false and stale-ack correlation ─────────────────────────────────────

  test('ok:false surfaces "no snapshot" at once instead of waiting out the timeout', async ({
    page,
  }) => {
    const session = await mockSession(page, { seed: baseSeed(PING_PROTOCOL) });
    // Nack the first request, serve the second — "Try again" must genuinely
    // re-ask rather than replay the dead ack.
    let answered = 0;
    session.onSent('cnmh_snapreq_global', (req) => {
      answered += 1;
      session.push(
        'cnmh_snapdone_global',
        answered === 1 ? { id: req.id, ok: false, ts: Date.now() } : ackFor(req.id, imageUrl),
      );
    });

    await openEncounterTab(page);
    const started = Date.now();
    await page.getByRole('button', { name: 'Ping the map' }).click();

    await expect(page.getByText(/No snapshot came back/)).toBeVisible({ timeout: 5_000 });
    // The whole point: a nack short-circuits SNAP_TIMEOUT_MS (20s) rather than
    // leaving the player staring at a spinner. The 30s spec timeout means a
    // regression here can't even be reported as a timing failure — it just
    // times out — so assert the elapsed time explicitly.
    expect(Date.now() - started).toBeLessThan(SNAP_TIMEOUT_MS / 2);

    // Retry re-requests with a FRESH id and the second ack lands the map.
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toBeVisible();
    const ids = sentValues(session, 'snapreq').map((v) => v.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  test('a persisted snapdone hydrated at mount never satisfies a live request', async ({ page }) => {
    // `cnmh_snapdone_global` is synced state, so the LAST ack the campaign ever
    // saw replays in FULL_STATE on every connect. Correlation is by request id
    // precisely so that ghost is inert.
    const session = await mockSession(page, {
      seed: {
        ...baseSeed(PING_PROTOCOL),
        cnmh_snapdone_global: ackFor('snap-from-a-previous-session', imageUrl),
      },
    });

    await openEncounterTab(page);
    await page.getByRole('button', { name: 'Ping the map' }).click();
    const req = await session.expectSent('cnmh_snapreq_global');

    // The hydrated ack is on record and points at a servable image, yet the
    // sheet is still waiting: it was not answering THIS request.
    await expect(page.getByText(/Asking the GM screen/)).toBeVisible();
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toHaveCount(0);

    // Nor does a live ack meant for somebody else's request settle it.
    session.push('cnmh_snapdone_global', ackFor('snap-someone-elses-request', imageUrl));
    await expect(page.getByText(/Asking the GM screen/)).toBeVisible();
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toHaveCount(0);

    // The matching id — and only it — resolves the wait.
    session.push('cnmh_snapdone_global', ackFor(req.id, imageUrl));
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toBeVisible();
  });
});
