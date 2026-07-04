import { expect, type APIRequestContext } from '@playwright/test';

// Fetch the full /api/content snapshot and return the payload.
export async function fetchContent(request: APIRequestContext) {
  const res = await request.get('/api/content');
  if (!res.ok()) throw new Error(`/api/content failed: ${res.status()}`);
  const body = await res.json();
  return body.payload as Record<string, unknown[]>;
}

// Find a document by id in a collection from the /api/content snapshot.
export function findInCollection(
  payload: Record<string, unknown>,
  collection: string,
  id: string,
): Record<string, unknown> | undefined {
  const items = payload[collection];
  if (!Array.isArray(items)) return undefined;
  return items.find((item: unknown) => (item as Record<string, unknown>).id === id) as
    | Record<string, unknown>
    | undefined;
}

// Import docs into a capture-only collection (e.g. `room`, `event`), the write
// path the seed fixture deliberately refuses to touch (#1074/#1112). Mirrors the
// app's importDocs (POST /api/gm/import/:collection) and, like the seed fixture,
// blocks on a propagation barrier so a spec can't navigate ahead of its own data.
export async function importDocs(
  request: APIRequestContext,
  collection: string,
  docs: Array<Record<string, unknown> & { id: string }>,
) {
  const res = await request.post(`/api/gm/import/${collection}`, { data: { docs } });
  if (!res.ok()) {
    throw new Error(`import ${collection} failed: ${res.status()} ${await res.text()}`);
  }
  const ct = res.headers()['content-type'] || '';
  if (!ct.includes('application/json')) {
    throw new Error(`import ${collection} returned non-JSON (likely Access interstitial): ${ct}`);
  }
  for (const doc of docs) {
    await waitForContent(request, collection, doc.id, (entry) => !!entry);
  }
}

// Poll /api/content until `match(entry)` returns truthy or the timeout elapses.
//
// Read-after-write should be guaranteed within a single Durable Object, but
// post-save reads via Playwright's request fixture occasionally observe the
// pre-save value on staging — most likely a propagation race we don't want
// to chase into CF internals. This helper just retries with backoff: first
// poll usually passes immediately (one extra GET); a transient race takes
// 1-2 retries.
export async function waitForContent(
  request: APIRequestContext,
  collection: string,
  id: string,
  match: (entry: Record<string, unknown> | undefined) => boolean,
  timeout = 5000,
) {
  await expect(async () => {
    const payload = await fetchContent(request);
    const entry = findInCollection(payload, collection, id);
    expect(match(entry)).toBe(true);
  }).toPass({ timeout, intervals: [200, 500, 1000, 2000] });
}
