/**
 * Always-passing diagnostic for the player-sheet load failure.
 *
 * All `/character/:id` tests have been failing at the h1 wait — `expectOnSheet`
 * passes (URL stayed at /character/:id) but the h1 never renders within 15s.
 * Three possible root causes; without local trace data we can't tell which:
 *
 *   1. /api/content fetch hangs from the browser → loading stays true → page
 *      shows "Loading character..." forever
 *   2. Fetch returns 200 but characters don't include the seeded char →
 *      getCharacter returns null → navigate('/') fires (URL would change)
 *   3. useCharacter returns null → characterModel falsy → early-return fires
 *
 * This test seeds a minimal character, navigates, waits 3s, then logs:
 *   - final URL (did we redirect?)
 *   - whether character-loading testid is visible (stuck on early-return?)
 *   - whether the expected h1 rendered (success state)
 *   - every /api/content response status seen by the browser
 *   - any uncaught page errors
 *
 * Always passes. The console.log output lands in the Playwright report and
 * gives us the answer without burning the player-spec write budget on
 * repeated 15s timeouts. After this lands and we read the CI output, the
 * follow-up slice can fix the actual root cause.
 *
 * Underscore prefix in filename keeps this visually separate from real
 * coverage specs in the directory listing.
 */

import { test } from '../../fixtures/gm';

test('DIAGNOSTIC: character sheet load state', async ({ page, seed }) => {
  await seed({
    character: [{ id: 'diag', name: 'Diagnostic Char', level: 1 }],
  });

  const contentResponses: Array<{ status: number; url: string }> = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/content')) {
      contentResponses.push({ status: r.status(), url: r.url() });
    }
  });

  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/character/diag');
  // 3s is enough for ContentContext.loadSnapshot to fire + resolve (or fail)
  // and for CharacterSheet's useEffect to react. Long enough that we capture
  // the steady state; short enough that the test stays cheap.
  await page.waitForTimeout(3000);

  const url = page.url();
  const isOnSheet = /\/character\/diag$/.test(url);
  const hasLoading = await page.getByTestId('character-loading').isVisible().catch(() => false);
  const hasH1 = await page
    .getByRole('heading', { name: 'Diagnostic Char', level: 1 })
    .isVisible()
    .catch(() => false);

  // eslint-disable-next-line no-console
  console.log(
    '=== PLAYER SHEET DIAGNOSTIC ===\n' +
      JSON.stringify(
        {
          url,
          isOnSheet,
          hasLoading,
          hasH1,
          contentResponses,
          pageErrors,
          consoleErrors,
        },
        null,
        2,
      ),
  );

  // Intentionally no assertions — this test only exists to surface the state
  // in CI logs so we know what to fix next. Always passes.
});
