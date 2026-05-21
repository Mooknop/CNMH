import type { APIRequestContext } from '@playwright/test';

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
