import { test, expect } from '../fixtures/gm';

// Smoke suite — verifies the app is alive and all three service layers are
// reachable: static asset serving, public API, and Access-protected GM API.
// No data mutations; no reset needed.

test('public content endpoint returns a snapshot', async ({ request }) => {
  const res = await request.get('/api/content');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('payload');
  // Every collection key should be present even if empty
  for (const col of ['quest', 'faction', 'lore', 'character', 'item', 'spell']) {
    expect(body.payload).toHaveProperty(col);
  }
});

test('app shell loads', async ({ page }) => {
  // Register the error listener BEFORE navigating so load-time crashes are caught.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  // Nav bar is the first meaningful structural element
  await expect(page.locator('nav')).toBeVisible();
  // `networkidle` never settles under the persistent session relay WS; wait for
  // the document load + a concrete app-ready signal (the SyncStatus badge) instead.
  await page.waitForLoadState('load');
  await expect(page.getByTestId('sync-status')).toBeVisible();
  expect(errors).toHaveLength(0);
});

test('GM whoami returns identity via service token', async ({ request }) => {
  const res = await request.get('/api/gm/whoami');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('email');
  expect(typeof body.email).toBe('string');
  expect(body.email.length).toBeGreaterThan(0);
});

test('staging reset endpoint is reachable', async ({ reset }) => {
  // Verifies the _test/reset plumbing works end-to-end.
  // If this fails in CI, every other test's beforeEach will also fail.
  await reset();
});
