/**
 * Template placement — caster-centered capture + shape preview (#1751 S6).
 *
 * S1-S5 (PRs #1754, #1757, #1759) are all merged on main: the OQ-1 origin
 * rework (bursts snap to the nearest grid INTERSECTION, not a cell),
 * `useTemplatePlacementSection.capture()` sending a caster-centered
 * `snapreq { moverId: casterEntryId, radiusFeet }` (protocol
 * MAP_TARGET_PROTOCOL = 17, shared with #1749), `SnapshotAreaOverlay`'s live
 * shape preview, `templateRangeGate`'s OQ-5 hard block folded into
 * `confirmEnabled` (`placement.gateOk`, PR #1759), the `templatedone` ack
 * consumer (S3), and the OQ-3 staleness banner. This file extends the
 * existing `map-bridge.spec.ts` harness (snapshot upload trick, spell-cast
 * navigation, IDENTITY_CAPTURE geometry) to drive all of it through the real
 * player UI.
 *
 * Three real seeded spells carry the different scenarios, exactly as the
 * epic's own OQ-5 ruling wants tested:
 *   - Illusory Object (`illusory-object`) — range 500 ft, 20-foot burst, no
 *     defense. Its range is generous enough that nothing in this file's
 *     IDENTITY_CAPTURE world (0..1000, i.e. 0..50 ft at gridSize 100) can
 *     ever trip the hard block, so it drives the "everything works" path:
 *     the caster-centered capture, the live preview, and the staleness
 *     banner.
 *   - Localized Eclipse (`localized-eclipse`) — range 30 ft, 10-foot burst,
 *     no defense. Short enough that a tap near the far edge of its own
 *     capture radius is genuinely out of range, which is what the hard-block
 *     scenario needs.
 *   - Sleep (`sleep`) — range 30 ft, 5-foot burst, Will save. The ONLY one of
 *     the three with a `defense` field, needed for the `templatedone`
 *     scenario: `runConfirm()`'s classic-footer path calls `onClose()`
 *     immediately after confirming (see `handleConfirm`), which unmounts
 *     `useTemplatePlacementSection` before an async ack could ever land. The
 *     RollSheet SAVE path's `onCommit` does not — it parks the sheet on
 *     "waiting for the GM" instead — so only a save spell, with a target
 *     actually adopted (which flips the sheet from classic to `useSaveSheet`
 *     BEFORE the commit), keeps the section mounted long enough to observe
 *     the ack. This is a genuine, load-bearing UI constraint, not a spec
 *     convenience — see that scenario's own comment for the wiring.
 * All three are occult, so one caster with one repertoire covers them.
 */

import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect } from '../../fixtures/gm';
import { mockSession, type MockSession } from '../../fixtures/session';
import { activeEncounter, readyTurnState } from '../../helpers/encounter';
import {
  snapshotSpells, casterCharacter, gotoSheet, openSpellsSegment, castSpell,
} from '../../helpers/spellcasting';
import { openPlayTab } from '../../helpers/sheet';
import { openEdit, commitSave } from '../../helpers/rollSheet';
import { bridgeHello, MAP_TARGET_PROTOCOL, SNAP_PROTOCOL } from '../../helpers/bridge';

const CHAR_ID = 'e2e-map-template-caster';
const CHAR_NAME = 'E2E Map Template Caster';
const SCENE_ID = 'e2e-map-template-scene';

const ILLUSORY_OBJECT = { id: 'illusory-object', name: 'Illusory Object', area: '20-foot burst', rangeFeet: 500, areaFeet: 20 };
const LOCALIZED_ECLIPSE = { id: 'localized-eclipse', name: 'Localized Eclipse', area: '10-foot burst', rangeFeet: 30, areaFeet: 10 };
const SLEEP = { id: 'sleep', name: 'Sleep', area: '5-foot burst', rangeFeet: 30, areaFeet: 5 };

const CASTER_ENTRY = { entryId: 'ent-template-caster', kind: 'pc', charId: CHAR_ID, name: CHAR_NAME, initiative: 20 };
// Sits exactly on the (5,1) intersection Sleep's own scenario taps (see
// `tapAreaMap(page, 0.5, 0.1)` there) — 0 ft from that origin, so it is a
// guaranteed occupant for the "Target these 1" adopt button. Placed FAR
// enough from the caster (20 ft — legal within Sleep's 30-ft range, but well
// outside its 5-ft burst) that the caster themselves is NOT also caught —
// unlike an emanation, a burst does not exclude its own caster from
// occupancy (see `areaOccupants`'s doc comment), so a closer tap point would
// have made "Target these 1" actually read "Target these 2".
const SLEEPER_ENTRY = { entryId: 'ent-sleepy-goblin', kind: 'enemy' as const, name: 'Sleepy Goblin', initiative: 10 };
const ORDER = [CASTER_ENTRY, SLEEPER_ENTRY];

// Caster at (1,1), gridSize 100 — matching map-bridge.spec.ts's IDENTITY_CAPTURE
// convention (world pixels == capture-space pixels) so tap math stays simple.
const POSITIONS = {
  gridSize: 100,
  positions: {
    [CASTER_ENTRY.entryId]: { col: 1, row: 1 },
    [SLEEPER_ENTRY.entryId]: { col: 5, row: 1 },
  },
};

const IDENTITY_CAPTURE = {
  a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, screenW: 1000, screenH: 1000, sceneId: SCENE_ID,
};

const caster = () =>
  casterCharacter({
    id: CHAR_ID,
    name: CHAR_NAME,
    level: 5,
    slots: { '1': 3 },
    repertoire: [ILLUSORY_OBJECT.id, LOCALIZED_ECLIPSE.id, SLEEP.id],
  });

const baseSeed = (protocol: number) => ({
  cnmh_bridgehello_global: bridgeHello(protocol, 'e2e-map-template-bridge'),
  cnmh_encounter_global: activeEncounter(CHAR_ID, CHAR_NAME, { order: ORDER }),
  [`cnmh_turnstate_${CHAR_ID}`]: readyTurnState('1:0'),
  cnmh_positions_global: POSITIONS,
});

// An 8x8 PNG (84 bytes) — the same fixture map-bridge.spec.ts uses.
const SNAPSHOT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAG0lEQVR4nGNY5RJq7BKKSTJgFV3l' +
    'EsowKHUAAMQfQeFax4r+AAAAAElFTkSuQmCC',
  'base64',
);

async function uploadSnapshotImage(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/gm/images', {
    multipart: {
      file: { name: 'e2e-map-template-snapshot.png', mimeType: 'image/png', buffer: SNAPSHOT_PNG },
      name: 'E2E map-template snapshot',
      folder: 'Scene Snapshots',
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return `/api/images/${id}`;
}

const ackFor = (id: string, url: string) => ({
  id, ok: true, url, capture: IDENTITY_CAPTURE,
  worldRect: { x1: 0, y1: 0, x2: 1000, y2: 1000 }, gridSize: 100, ts: Date.now(),
});

/** Play the bridge: answer every capture request with `ack(id)`. */
function answerCaptures(session: MockSession, imageUrl: string) {
  session.onSent('cnmh_snapreq_global', (req) => {
    session.push('cnmh_snapdone_global', ackFor(req.id, imageUrl));
  });
}

const sentValues = (session: MockSession, stateType: string) =>
  session.sent.filter((m) => m.stateType === stateType).map((m) => m.value as any);

// A world coordinate is derived from a REAL mouse event at a real pixel, so a
// pixel of rounding is inherent (mirrors map-bridge.spec.ts's expectNear).
const expectNear = (actual: number, expected: number, slack = 20) =>
  expect(
    Math.abs(actual - expected),
    `expected ${actual} to be within ${slack} of ${expected}`,
  ).toBeLessThanOrEqual(slack);

// Under IDENTITY_CAPTURE, world == capture-space pixels == nx * screenW.
const identityWorld = (nx: number) => nx * IDENTITY_CAPTURE.screenW;
// A burst's placed WORLD point snaps to the nearest grid intersection
// (#1751 OQ-1 — mirrors `snapToGridIntersection` in src/utils/spellArea.js).
const nearestIntersection = (world: number, gridSize = POSITIONS.gridSize) =>
  Math.round(world / gridSize) * gridSize;
// The same intersection in col/row (corner-index) space, what
// `templateRangeGate` measures distance in (mirrors `intersectionFromWorld`).
const intersectionCell = (world: number, gridSize = POSITIONS.gridSize) =>
  Math.round(world / gridSize);
// PF2e 5-10-5 alternating-diagonal grid distance between two cells, matching
// `gridDistanceFeet`/`diagonalSquaresToFeet` (src/utils/rangeIncrement.js).
const gridDistanceFeet = (from: { col: number; row: number }, to: { col: number; row: number }, feetPerSquare = 5) => {
  const dCol = Math.abs(to.col - from.col);
  const dRow = Math.abs(to.row - from.row);
  const diagonals = Math.min(dCol, dRow);
  const straights = Math.max(dCol, dRow) - diagonals;
  return (straights + diagonals + Math.floor(diagonals / 2)) * feetPerSquare;
};

/** Sheet → Encounter tab, gated on encounter hydration. */
async function openEncounterTab(page: Page) {
  await gotoSheet(page, CHAR_ID, CHAR_NAME);
  await openPlayTab(page, 'Encounter');
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible();
}

/** Encounter tab → deck's Spells segment → the named spell's cast modal. */
async function openAreaCast(page: Page, spellName: string) {
  await openEncounterTab(page);
  await openSpellsSegment(page);
  await castSpell(page, spellName);
  await expect(page.getByRole('button', { name: 'confirm-cast' })).toBeVisible();
}

/** Tap the rendered snapshot at normalized (nx, ny) — mirrors
 *  map-bridge.spec.ts's `tapSnapshot`: the placement flow DOES pass a
 *  `marker` prop, so `map-snapshot-pin` is the load-bearing readiness gate. */
async function tapAreaMap(page: Page, nx: number, ny: number) {
  const img = page.getByRole('img', { name: 'Battlefield snapshot' });
  await img.scrollIntoViewIfNeeded();
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
    .toBe(true);

  const box = (await img.boundingBox())!;
  const frame = (await page.getByTestId('map-snapshot-frame').boundingBox())!;
  const x = box.x + nx * box.width;
  const y = box.y + ny * box.height;
  if (y < frame.y || y > frame.y + frame.height) {
    throw new Error(`tapAreaMap: ny=${ny} falls outside the clipped frame — pick a point nearer the top`);
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByTestId('map-snapshot-pin')).toBeVisible();
}

const placementSection = (page: Page) => page.getByTestId('area-placement-section');
const placeOnMapButton = (page: Page) => placementSection(page).getByRole('button', { name: 'Place on the map' });
const confirmCast = (page: Page) => page.getByRole('button', { name: 'confirm-cast' });

test.describe('Template placement — caster-centered capture + preview (#1751 S6)', () => {
  let imageUrl: string;

  test.beforeEach(async ({ reset, seed, request }) => {
    await reset();
    await seed({ spell: snapshotSpells(ILLUSORY_OBJECT.id, LOCALIZED_ECLIPSE.id, SLEEP.id), character: [caster()] });
    imageUrl = await uploadSnapshotImage(request);
  });

  // ── Scenario 1: caster-centered capture + live preview + snapped payload ──

  test('placement fires a caster-centered snapreq; a tap draws the preview and templateplace lands at the snapped intersection', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_TARGET_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAreaCast(page, ILLUSORY_OBJECT.name);
    await expect(placementSection(page)).toContainText(`Area — ${ILLUSORY_OBJECT.area}`);
    await placeOnMapButton(page).click();

    // moverId is the CASTER'S ENTRY id (not charId — #1751's capture is
    // centred on the caster's own token), and radiusFeet is range + area
    // reach (500 + 20), so the far edge of a legally-placed burst stays
    // in frame.
    const req = await session.expectSent(
      'cnmh_snapreq_global',
      (v) => v?.moverId === CASTER_ENTRY.entryId && v?.radiusFeet === ILLUSORY_OBJECT.rangeFeet + ILLUSORY_OBJECT.areaFeet,
    );
    expect(req.id).toMatch(/^snap-/);

    // Tap (0.22, 0.13) → world (220, 130) → snaps to the nearest grid
    // intersection (200, 100).
    await tapAreaMap(page, 0.22, 0.13);

    // The live preview (SnapshotAreaOverlay) is drawn BEFORE confirm.
    await expect(page.locator('svg.sao--burst')).toHaveCount(1);
    await expect(page.locator('.sao-outline')).toHaveCount(1);

    await confirmCast(page).click();

    const [template] = sentValues(session, 'templateplace');
    expect(template).toMatchObject({ shape: 'burst', feet: ILLUSORY_OBJECT.areaFeet, sceneId: SCENE_ID, name: ILLUSORY_OBJECT.name });
    const originX = nearestIntersection(identityWorld(0.22));
    const originY = nearestIntersection(identityWorld(0.13));
    expectNear(template.x, originX);
    expectNear(template.y, originY);
  });

  // ── Scenario 2: the OQ-5 hard block, end to end ────────────────────────────

  test('an out-of-range tap blocks the cast confirm; a legal tap re-enables it and places at the snapped point', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_TARGET_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAreaCast(page, LOCALIZED_ECLIPSE.name);
    await placeOnMapButton(page).click();

    // Tap (0.9, 0.1) → world (900, 100) → intersection cell (9, 1). Caster
    // sits at cell (1, 1): straight-line distance 8 squares = 40 ft, beyond
    // Localized Eclipse's 30-ft range.
    await tapAreaMap(page, 0.9, 0.1);
    const farFeet = gridDistanceFeet({ col: 1, row: 1 }, { col: intersectionCell(identityWorld(0.9)), row: intersectionCell(identityWorld(0.1)) });
    expect(farFeet).toBeGreaterThan(LOCALIZED_ECLIPSE.rangeFeet);

    const blocked = page.getByTestId('area-range-blocked');
    await expect(blocked).toBeVisible();
    await expect(blocked).toContainText('Out of range');
    await expect(blocked).toContainText(`${farFeet} ft`);
    await expect(confirmCast(page)).toBeDisabled();

    // Tap (0.15, 0.1) → world (150, 100) → intersection cell (2, 1): 1 square
    // = 5 ft from the caster, well within range.
    await tapAreaMap(page, 0.15, 0.1);
    await expect(blocked).toHaveCount(0);
    await expect(confirmCast(page)).toBeEnabled();

    await confirmCast(page).click();
    const [template] = sentValues(session, 'templateplace');
    expect(template).toMatchObject({ shape: 'burst', feet: LOCALIZED_ECLIPSE.areaFeet });
    expectNear(template.x, nearestIntersection(identityWorld(0.15)));
    expectNear(template.y, nearestIntersection(identityWorld(0.1)));
  });

  // ── Scenario 3: templatedone ack ────────────────────────────────────────────
  //
  // HARNESS LIMITATION, recorded rather than papered over: the "outline
  // landed" / "didn't land" NOTE (`area-template-outcome`) is unreachable
  // through any live UI path once a real confirm has actually fired the
  // template placement, for a structural reason confirmed by reading both
  // callers of `runConfirm()`:
  //   - The classic-footer path's `handleConfirm` calls `onClose()` the
  //     instant confirm resolves (UseAbilityModal.jsx), which is a real
  //     `usingAbility && <UseAbilityModal .../>` conditional mount at every
  //     call site (ActionsList.jsx, SpellsSegment.jsx) — `onClose` clears
  //     that state and UNMOUNTS the component, tearing down
  //     `useTemplatePlacementSection` (and its `templateAck`-watching
  //     effect) before an async ack could ever arrive.
  //   - The RollSheet SAVE path's `onCommit` does not close the modal, but
  //     RollSheet.jsx's `editPanel` (which is where `placement.section` —
  //     and the outcome note inside it — lives) renders ONLY in phase
  //     'roll' (Screen 1, BEFORE commit); every phase after commit
  //     ('waiting', 'result', 'amount', 'done') renders a DIFFERENT return
  //     branch with no `editPanel` at all. Committing is exactly what sends
  //     `templateplace` (`placement.applyOnConfirm()` inside `runConfirm()`),
  //     so by the time a request id even EXISTS to correlate an ack against,
  //     the one screen able to show the note is already gone.
  // Both were verified empirically before landing on this design: an
  // earlier version of this test drove Illusory Object through the classic
  // footer and asserted the outcome testid — it timed out, never appearing.
  //
  // What IS genuinely observable from outside the UI is the SYNCED SIDE
  // EFFECT `useTemplatePlacementSection`'s ack-watching effect performs on
  // success: `patchLogEntry(pending.logId, { templateId })`, which goes out
  // over `cnmh_encounter_global` regardless of whether anything is on
  // screen to read it — and it is the exact mechanism #1734 S5's cleanup
  // rail is documented to consume later. That effect keeps running as long
  // as UseAbilityModal itself stays mounted (a React hook's lifecycle is
  // independent of what JSX its OWN return value ends up embedded in), and
  // RollSheet's 'waiting' phase keeps UseAbilityModal mounted even though it
  // stops rendering `editPanel` — so this is the honest thing to assert.
  // Reaching it needs an adopted target before commit (`useSaveSheet`
  // requires `saveTargets.length > 0`, which routes the modal onto
  // RollSheet instead of the classic footer) — "Target these 1" (the
  // burst's own occupant-adopt button) provides it: Sleepy Goblin sits on
  // the tapped intersection for zero ft, guaranteeing occupancy.

  test('templatedone ok:true patches the placement log entry with templateId', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_TARGET_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAreaCast(page, SLEEP.name);
    await placeOnMapButton(page).click();
    // Tap (0.5, 0.1) → world (500, 100) → intersection (5, 1) — 0 ft from
    // Sleepy Goblin's cell (5, 1) and 20 ft from the caster: within Sleep's
    // 30-ft range, but outside its 5-ft burst, so only the goblin (not the
    // caster too) is an occupant.
    await tapAreaMap(page, 0.5, 0.1);
    const occupants = page.getByTestId('area-occupants');
    await expect(occupants).toContainText('Sleepy Goblin (0 ft)');
    await expect(occupants).not.toContainText(CHAR_NAME);
    await placementSection(page).getByRole('button', { name: 'Target these 1' }).click();

    // Adopting flips useSaveSheet true — the modal switches from its classic
    // footer to RollSheet's save-mode layout, whose own commit pill (not
    // `confirm-cast`) is the primary control from here on.
    await commitSave(page);

    await expect.poll(() => sentValues(session, 'templateplace').length).toBeGreaterThan(0);
    const [template] = sentValues(session, 'templateplace');
    session.push('cnmh_templatedone_global', { id: template.id, ok: true, templateId: 'tmpl-e2e-1', ts: Date.now() });

    await session.expectSent('cnmh_encounter_global', (v) =>
      (v?.log || []).some((e: any) => String(e.text).includes(`${SLEEP.name} placed`) && e.templateId === 'tmpl-e2e-1'),
    );
  });

  test('templatedone ok:false leaves the log entry\'s templateId null', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_TARGET_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAreaCast(page, SLEEP.name);
    await placeOnMapButton(page).click();
    await tapAreaMap(page, 0.5, 0.1);
    await placementSection(page).getByRole('button', { name: 'Target these 1' }).click();
    await commitSave(page);

    await expect.poll(() => sentValues(session, 'templateplace').length).toBeGreaterThan(0);
    const [template] = sentValues(session, 'templateplace');

    // The placement log line itself (written synchronously inside
    // applyOnConfirm, BEFORE any ack) already carries templateId: null —
    // wait for it first so the negative check below can't race a write that
    // simply hasn't landed yet.
    await session.expectSent('cnmh_encounter_global', (v) =>
      (v?.log || []).some((e: any) => String(e.text).includes(`${SLEEP.name} placed`)),
    );

    session.push('cnmh_templatedone_global', { id: template.id, ok: false, ts: Date.now() });

    // A nack never patches templateId — give the (silent, no-op) effect a
    // moment to have run, then confirm no LATER encounter write set it.
    await page.waitForTimeout(500);
    const patched = sentValues(session, 'encounter').some((v) =>
      (v?.log || []).some((e: any) => String(e.text).includes(`${SLEEP.name} placed`) && e.templateId != null),
    );
    expect(patched).toBe(false);
  });

  // ── Scenario 4: stale-capture banner ─────────────────────────────────────

  test('a positions push after the capture shows the staleness banner and Refresh', async ({ page }) => {
    const session = await mockSession(page, { seed: baseSeed(MAP_TARGET_PROTOCOL) });
    answerCaptures(session, imageUrl);

    await openAreaCast(page, ILLUSORY_OBJECT.name);
    await placeOnMapButton(page).click();
    // No tap needed — staleness only depends on the CAPTURE existing.
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toBeVisible();
    await expect(page.getByTestId('area-stale-banner')).toHaveCount(0);

    session.push('cnmh_positions_global', {
      gridSize: 100,
      positions: { [CASTER_ENTRY.entryId]: { col: 3, row: 1 } },
    });

    const banner = page.getByTestId('area-stale-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('The battlefield has changed since this photo.');
    await expect(banner.getByRole('button', { name: 'Refresh' })).toBeVisible();
  });

  // ── Scenario 5: no-bridge / below-floor degradation ──────────────────────

  test('below every snapshot floor: the area label survives and casting completes with no map UI', async ({ page }) => {
    await mockSession(page, { seed: baseSeed(SNAP_PROTOCOL - 1) });

    await openAreaCast(page, ILLUSORY_OBJECT.name);
    const section = placementSection(page);
    await expect(section).toContainText(`Area — ${ILLUSORY_OBJECT.area}`);
    await expect(section).toContainText('No live map available');
    await expect(placeOnMapButton(page)).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Battlefield snapshot' })).toHaveCount(0);

    await expect(confirmCast(page)).toBeEnabled();
    await confirmCast(page).click();
  });
});
