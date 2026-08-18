/**
 * GM image catalog round-trip suite (#517) — /gm/catalog/images (GmImages).
 *
 * Runs against the locally-simulated R2 bucket (wrangler dev --env e2e):
 *  - Upload via the hidden file input (setInputFiles): the client resizes and
 *    re-encodes to JPEG, POSTs to /api/gm/images (bytes → R2, catalog row →
 *    content DO `image` collection), and the new entry's form auto-selects.
 *  - Name/folder edit round-trips through the DO; the folder becomes a tab.
 *  - Delete removes both the catalog row and the R2 bytes (typed confirm).
 *  - A non-image file is rejected client-side before any upload.
 *  - Delete is BLOCKED with a reference list while a content doc's `image`
 *    field points at the catalog id (server-side 409 guard).
 *
 * Reset-free: unique file names per test (upload ids are server-minted UUIDs).
 * Desktop-only — gm/ specs run on the chromium project only by config convention.
 */

import { test, expect } from '../../fixtures/gm';
import { fetchContent, findInCollection, waitForContent } from '../../helpers/content';
import { testId, testTitle } from '../../helpers/ids';

type Page = import('@playwright/test').Page;
type APIRequestContext = import('@playwright/test').APIRequestContext;

// 1x1 transparent PNG — a real decodable image, so the client-side canvas
// resize (resizeImageToBlob) has something to draw.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

async function uploadPng(page: Page, fileName: string) {
  await page
    .getByLabel('upload-file')
    .setInputFiles({ name: fileName, mimeType: 'image/png', buffer: PNG_1PX });
  await expect(page.getByRole('status')).toContainText('Image uploaded.', { timeout: 20_000 });
}

// The upload id is server-minted (img_<uuid>.jpg), so resolve it from the
// catalog by the uploaded file name.
async function waitForImageByName(request: APIRequestContext, name: string) {
  let found: Record<string, unknown> | undefined;
  await expect(async () => {
    const payload = await fetchContent(request);
    const list = payload.image as Array<Record<string, unknown>> | undefined;
    found = Array.isArray(list) ? list.find((d) => d.name === name) : undefined;
    expect(found).toBeTruthy();
  }).toPass({ timeout: 10_000, intervals: [200, 500, 1000, 2000] });
  return found as Record<string, unknown>;
}

test.describe('Image catalog editor', () => {
  test('upload, edit name/folder, and delete round-trip through R2 and the catalog', async ({
    page,
    request,
  }) => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const fileName = `e2e-portrait-${suffix}.png`;
    const newName = `E2E Portrait ${suffix}`;
    const folderName = `E2E-Folder-${suffix}`;

    await page.goto('/gm/catalog/images');
    await uploadPng(page, fileName);

    const entry = await waitForImageByName(request, fileName);
    const imageId = String(entry.id);
    // The client re-encodes to JPEG before upload.
    expect(imageId).toMatch(/^img_.+\.jpg$/);
    expect(entry).toMatchObject({ name: fileName, mimeType: 'image/jpeg' });

    // The new entry's form auto-selects, and the bytes are served from R2.
    const form = page.getByTestId(`image-form-${imageId}`);
    await expect(form).toBeVisible();
    const served = await request.get(`/api/images/${imageId}`);
    expect(served.status()).toBe(200);
    expect(served.headers()['content-type']).toBe('image/jpeg');

    // Rename + move into a folder.
    await form.getByLabel('name', { exact: true }).fill(newName);
    await form.getByLabel('folder').fill(folderName);
    await form.getByRole('button', { name: 'Save' }).click();
    await waitForContent(
      request,
      'image',
      imageId,
      (e) => e?.name === newName && e?.folder === folderName,
    );

    // The folder surfaces as a tab and the tile files under it.
    const folderNav = page.getByRole('navigation', { name: 'image folders' });
    await folderNav.getByRole('button', { name: folderName }).click();
    await expect(page.getByTestId(`image-tile-${imageId}`)).toBeVisible();

    // Delete (typed confirmation against the current name).
    await form.getByRole('button', { name: 'Delete' }).click();
    await page.getByLabel('confirm-input').fill(newName);
    await page.getByRole('button', { name: 'Delete forever' }).click();

    await expect(page.getByTestId(`image-form-${imageId}`)).not.toBeVisible();
    await expect(page.getByTestId(`image-tile-${imageId}`)).not.toBeVisible();
    await waitForContent(request, 'image', imageId, (e) => !e);
    // The R2 bytes are gone too.
    await expect(async () => {
      const res = await request.get(`/api/images/${imageId}`);
      expect(res.status()).toBe(404);
    }).toPass({ timeout: 10_000, intervals: [200, 500, 1000, 2000] });
  });

  test('rejects a non-image file client-side', async ({ page, request }) => {
    await page.goto('/gm/catalog/images');

    const badName = `e2e-notes-${Math.random().toString(36).slice(2, 8)}.txt`;
    await page
      .getByLabel('upload-file')
      .setInputFiles({ name: badName, mimeType: 'text/plain', buffer: Buffer.from('not an image') });

    await expect(page.getByRole('alert')).toContainText('Only JPEG, PNG, and WebP are allowed.');
    // Nothing was registered.
    const payload = await fetchContent(request);
    const list = payload.image as Array<Record<string, unknown>> | undefined;
    expect((list ?? []).some((d) => d.name === badName)).toBe(false);
  });

  test('delete is blocked while a content doc references the image', async ({
    page,
    request,
    seed,
  }) => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const fileName = `e2e-refimg-${suffix}.png`;
    const itemId = testId('idol');
    const itemName = testTitle('idol', itemId);

    await page.goto('/gm/catalog/images');
    await uploadPng(page, fileName);
    const entry = await waitForImageByName(request, fileName);
    const imageId = String(entry.id);

    // Reference the image from an item (bare catalog id in an `image` field).
    await seed({ item: [{ id: itemId, name: itemName, image: imageId }] });

    // Attempt the delete — the server answers 409 with the reference list.
    const form = page.getByTestId(`image-form-${imageId}`);
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: 'Delete' }).click();
    await page.getByLabel('confirm-input').fill(fileName);
    await page.getByRole('button', { name: 'Delete forever' }).click();

    const blocked = page.getByRole('alert');
    await expect(blocked).toContainText('image is in use by');
    await expect(blocked).toContainText(itemName);
    await blocked.getByRole('button', { name: 'Dismiss' }).click();

    // Catalog row and bytes both survive.
    const payload = await fetchContent(request);
    expect(findInCollection(payload, 'image', imageId)).toMatchObject({ id: imageId });
    const served = await request.get(`/api/images/${imageId}`);
    expect(served.status()).toBe(200);
  });
});
