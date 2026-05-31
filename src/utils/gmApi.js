// Thin client for the GM write API. Same-origin, so the Cloudflare Access
// cookie rides automatically; the Worker re-verifies it before the write
// reaches the content Durable Object, which then broadcasts the change live.

import { buildSeedPayload } from './contentUtils';

const json = async (res) => {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${text}`.trim());
  }
  return res.json();
};

export const saveDocument = (collection, id, data) =>
  fetch(`/api/gm/${collection}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(json);

export const deleteDocument = (collection, id) =>
  fetch(`/api/gm/${collection}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  }).then(json);

export const seedDefaults = (force = false) =>
  fetch('/api/gm/seed', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSeedPayload(force)),
  }).then(json);

// Restore from a downloaded backup: a force reseed whose collections come from
// the backup file rather than the bundled defaults. Reuses the existing seed
// route (force replaces each provided collection wholesale).
export const seedFromBackup = (collections) =>
  fetch('/api/gm/seed', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: true, collections }),
  }).then(json);

// Prior versions of one entity, newest-first: [{ archived_at, data }].
export const fetchHistory = (collection, id) =>
  fetch(`/api/gm/history/${collection}/${encodeURIComponent(id)}`, {
    credentials: 'include',
  }).then(json);

// Re-publish a specific archived version; the Worker archives the current
// state first, then broadcasts the restore live like any other edit.
export const restoreVersion = (collection, id, archivedAt) =>
  fetch(`/api/gm/restore/${collection}/${encodeURIComponent(id)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived_at: archivedAt }),
  }).then(json);

export const saveTheme = (themeDoc) =>
  fetch('/api/gm/theme/campaign', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(themeDoc),
  }).then(json);

// In-memory write counter since the DO last restarted.
export const fetchUsage = () =>
  fetch('/api/gm/usage', { credentials: 'include' }).then(json);

// Upload an image file to R2 and register it in the image catalog.
// `resizeImageToBlob` should be called before this to keep uploads small.
export const uploadImage = async (blob, { name, folder } = {}) => {
  const body = new FormData();
  body.append('file', blob, name || 'image');
  if (name) body.append('name', name);
  if (folder) body.append('folder', folder);
  return json(await fetch('/api/gm/images', {
    method: 'POST',
    credentials: 'include',
    body,
  }));
};

// Delete an image from R2 + the catalog. On 409 the server returns
// { references: [{collection, id, name}] } and this throws a ReferenceError
// with `.references` attached so callers can surface the list.
export const deleteImage = async (id) => {
  const res = await fetch(`/api/gm/images/${encodeURIComponent(id)}/delete`, {
    method: 'POST',
    credentials: 'include',
  });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    const err = new Error('Image is in use');
    err.references = body.references || [];
    throw err;
  }
  return json(res);
};
