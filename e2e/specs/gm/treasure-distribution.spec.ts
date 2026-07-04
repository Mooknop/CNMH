/**
 * Room treasure distribution flow (epic #1085 T4/T5, #1090/#1091) — the
 * GM→players→GM loot-drop lifecycle had no E2E before this file. The whole
 * lifecycle rides one synced global, `cnmh_lootdrop_global`, so the relay is
 * mocked (mockSession, #293) and every write asserted via `expectSent`, the
 * same idiom the shop checkout spec uses. Three vertical steps:
 *
 *   1. GM opens a drop from a room's treasure cache (World → Rooms).
 *   2. A player claims/steps lines on their sheet (LootClaimSheet).
 *   3. GM finalizes — claimed items + gold land on the proven
 *      cnmh_acquired_/cnmh_gold_ overlays, the leftover returns to the cache,
 *      and the room is stamped `distributedAt` in content.
 *
 * Rooms are a capture-only collection the seed route refuses to touch, so they
 * go in via the import route (helpers/content importDocs). Desktop-only (GM
 * Tools has no responsive layout).
 */

import { test, expect } from '../../fixtures/gm';
import { mockSession } from '../../fixtures/session';
import { importDocs, waitForContent, findInCollection, fetchContent } from '../../helpers/content';
import { expectOnSheet } from '../../helpers/sheet';

const CHAR_ID = 'e2e-fighter';
const CHAR_NAME = 'E2E Fighter';
const ROOM_ID = 'e2e-room-vault';
const ROOM_NAME = 'V1. E2E Treasure Vault';

const FLASK = { id: 'e2e-loot-flask', name: 'E2E Loot Flask', price: 3, level: 1 };
const RING = { id: 'e2e-loot-ring', name: 'E2E Loot Ring', price: 8, level: 2 };

// A room doc with a bound (ref'd) treasure cache — the shape RoomTreasureEditor
// produces and roomDistributable accepts.
const vaultRoom = (cache: object, extra: object = {}) => ({
  id: ROOM_ID,
  code: 'V1',
  name: 'E2E Treasure Vault',
  site: 'E2E Site',
  sort: 1,
  treasureCache: cache,
  ...extra,
});

// Total units a character has claimed on one line of a drop payload.
const claimedQty = (drop: any, lineId: string, charId: string) =>
  ((drop?.items || []).find((l: any) => l.lineId === lineId)?.claims || [])
    .filter((c: any) => c.charId === charId)
    .reduce((s: number, c: any) => s + (Number(c.qty) || 0), 0);

test.describe('Room treasure distribution', () => {
  test.beforeEach(async ({ reset, seed }) => {
    await reset();
    await seed({
      character: [{ id: CHAR_ID, name: CHAR_NAME, level: 5 }],
      item: [FLASK, RING],
    });
  });

  test('GM opens a distribution from a room cache → writes an open drop', async ({ page, request }) => {
    await importDocs(request, 'room', [
      vaultRoom({ gold: 30, items: [{ ref: FLASK.id, name: FLASK.name, qty: 2 }] }),
    ]);

    const session = await mockSession(page, { seed: {} });
    await page.goto('/gm/world/rooms');

    // Single imported room auto-selects; the distribute control is under it.
    await page.getByRole('button', { name: 'Distribute treasure…' }).click();

    // Confirm/preview shows exactly what's about to drop. (These GM panels are
    // plain aria-labelled divs, not role=region — locate by the label attr.)
    const confirm = page.locator('[aria-label="Confirm treasure distribution"]');
    await expect(confirm).toContainText('30 gp');
    await expect(confirm).toContainText('E2E Loot Flask');
    await expect(confirm).toContainText('×2');

    await confirm.getByRole('button', { name: 'Start distribution' }).click();

    const drop = await session.expectSent(
      'cnmh_lootdrop_global',
      (v) =>
        v?.status === 'open' &&
        v?.roomId === ROOM_ID &&
        v?.gold === 30 &&
        Array.isArray(v.items) &&
        v.items.length === 1,
    );
    expect(drop.items[0].ref).toBe(FLASK.id);
    expect(drop.items[0].qty).toBe(2);
    expect(drop.items[0].claims).toEqual([]);
  });

  test('a player claims a single line and steps a stacked line on their sheet', async ({ page }) => {
    const openDrop = {
      id: 'drop-claim',
      roomId: ROOM_ID,
      roomName: ROOM_NAME,
      gold: 0,
      items: [
        { lineId: 'line-ring', ref: RING.id, name: RING.name, qty: 1, claims: [] },
        { lineId: 'line-flask', ref: FLASK.id, name: FLASK.name, qty: 2, claims: [] },
      ],
      goldSplit: null,
      status: 'open',
      ts: 1,
    };
    const session = await mockSession(page, { seed: { cnmh_lootdrop_global: openDrop } });

    await page.goto(`/character/${CHAR_ID}`);
    await expectOnSheet(page, CHAR_ID);

    const sheet = page.getByRole('region', { name: 'Treasure to claim' });
    await expect(sheet).toContainText(ROOM_NAME);

    // Single-qty line: one Claim toggle.
    await sheet.getByRole('button', { name: 'Claim', exact: true }).click();
    await session.expectSent(
      'cnmh_lootdrop_global',
      (v) => claimedQty(v, 'line-ring', CHAR_ID) === 1,
    );

    // Stacked line: step up to 2, then release one back to 1.
    await sheet.getByRole('button', { name: 'Claim one E2E Loot Flask' }).click();
    await sheet.getByRole('button', { name: 'Claim one E2E Loot Flask' }).click();
    await session.expectSent(
      'cnmh_lootdrop_global',
      (v) => claimedQty(v, 'line-flask', CHAR_ID) === 2,
    );

    await sheet.getByRole('button', { name: 'Release one E2E Loot Flask' }).click();
    await session.expectSent(
      'cnmh_lootdrop_global',
      (v) => claimedQty(v, 'line-flask', CHAR_ID) === 1,
    );
  });

  test('GM finalizes → claimed loot + gold credited, leftover returns to cache, room stamped', async ({ page, request }) => {
    await importDocs(request, 'room', [
      vaultRoom({ gold: 30, items: [{ ref: FLASK.id, name: FLASK.name, qty: 2 }] }),
    ]);

    const openDrop = {
      id: 'drop-final',
      roomId: ROOM_ID,
      roomName: ROOM_NAME,
      gold: 30,
      items: [
        {
          lineId: 'line-flask',
          ref: FLASK.id,
          name: FLASK.name,
          qty: 2,
          claims: [{ charId: CHAR_ID, qty: 1 }], // one claimed, one left over
        },
      ],
      goldSplit: null,
      status: 'open',
      ts: 1,
    };
    const session = await mockSession(page, {
      seed: {
        cnmh_lootdrop_global: openDrop,
        [`cnmh_gold_${CHAR_ID}`]: 5,
      },
    });

    await page.goto('/gm/world/rooms');

    // The room's active-drop panel shows the live claim.
    const panel = page.locator('[aria-label="Active treasure distribution"]');
    await expect(panel).toContainText(CHAR_NAME);
    await panel.getByRole('button', { name: 'Finalize' }).click();

    // Claimed item lands on the acquired overlay (one re-resolvable ref entry).
    const acquired = await session.expectSent(
      `cnmh_acquired_${CHAR_ID}`,
      (v) => Array.isArray(v) && v.some((e: any) => e.ref === FLASK.id),
    );
    expect(acquired.filter((e: any) => e.ref === FLASK.id)).toHaveLength(1);

    // Sole party member → even split is the whole 30 gp, on top of the seeded 5.
    await session.expectSent(`cnmh_gold_${CHAR_ID}`, (v) => v === 35);

    // The drop is cleared for everyone.
    await session.expectSent('cnmh_lootdrop_global', (v) => v === null);

    // The room is stamped distributed and the unclaimed flask returns to the cache.
    await waitForContent(request, 'room', ROOM_ID, (r) => r?.distributedAt != null);
    const room = findInCollection(await fetchContent(request), 'room', ROOM_ID) as any;
    expect(room.treasureCache.gold).toBe(0);
    expect(room.treasureCache.items).toEqual([
      expect.objectContaining({ ref: FLASK.id, qty: 1 }),
    ]);
  });
});
