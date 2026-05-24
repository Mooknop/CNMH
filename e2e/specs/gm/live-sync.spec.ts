/**
 * GM ↔ GM live-sync suite.
 *
 * Two independent browser contexts both connected as GM. One creates a quest;
 * the other must see it WITHOUT reloading. Verifies the WebSocket broadcast
 * pipeline end-to-end — exactly the class of bug Slice A shipped
 * ("sender doesn't receive own broadcast"). Originally planned as
 * GM-desktop ↔ player-mobile per the plan, but two-GM is the same broadcast
 * invariant and avoids the player-surface redirect risk that parked Slice 4b.
 *
 * Desktop-only (GM Tools have no responsive layout).
 *
 * Reset-free: uses a unique quest ID per run. Cost: ~3 writes (1 UI save).
 */

import { test, expect } from '../../fixtures/gm';
import { testId, testTitle } from '../../helpers/ids';

// New browser contexts created via browser.newContext() do NOT inherit the
// per-project `use.extraHTTPHeaders`; pass them explicitly so CF Access lets
// the page + WS handshake through.
const ctxOptions = () => {
  const base: Record<string, unknown> = {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
  };
  if (process.env.CF_ACCESS_CLIENT_ID) {
    base.extraHTTPHeaders = {
      'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID,
      'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET!,
    };
  }
  return base;
};

test.describe('GM live-sync', () => {
  test('quest created in one GM tab broadcasts to another GM tab', async ({
    browser,
  }) => {
    const id = testId('live');
    const title = testTitle('live', id);

    const contextA = await browser.newContext(ctxOptions());
    const contextB = await browser.newContext(ctxOptions());
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // Both tabs land on /gm/quests and wait for the editor shell to be ready.
      // We don't poll for WS connection state directly — instead we sanity-check
      // that the editor is interactive on both sides.
      await Promise.all([pageA.goto('/gm/quests'), pageB.goto('/gm/quests')]);
      await Promise.all([
        expect(pageA.getByRole('button', { name: '+ New quest' })).toBeVisible(),
        expect(pageB.getByRole('button', { name: '+ New quest' })).toBeVisible(),
      ]);

      // Give the WebSocket subscription on each context a brief moment to
      // settle. Without this, the broadcast can race the second tab's WS open.
      await pageA.waitForTimeout(1000);

      // --- pageA: create a quest ---
      await pageA.getByRole('button', { name: '+ New quest' }).click();
      const formA = pageA.getByTestId('quest-form-new');
      await formA.getByLabel('title').fill(title);
      await formA.getByLabel('status').selectOption('active');
      await formA.getByLabel('priority').selectOption('high');
      await formA.getByLabel('description').fill('Broadcast test.');
      await formA.getByRole('button', { name: 'Create quest' }).click();

      // pageA: the saved form appears
      await expect(pageA.getByTestId(`quest-form-${id}`)).toBeVisible({ timeout: 20_000 });

      // pageB: same form must appear via WebSocket CONTENT_UPDATE — no reload
      await expect(pageB.getByTestId(`quest-form-${id}`)).toBeVisible({ timeout: 20_000 });
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
