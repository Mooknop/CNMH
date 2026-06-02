// Thin client for the GM write API. Same-origin, so the Cloudflare Access
// cookie rides automatically; the Worker re-verifies it before the write
// reaches the content Durable Object, which then broadcasts the change live.

import { buildSeedPayload, defaultContent, repointFocusSpells } from './contentUtils';

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

// Add bundled default documents that are absent from the DO without touching
// existing ones. Safe to run on a populated world; idempotent. Reusable for
// any future content drop.
export const seedMissing = () =>
  fetch('/api/gm/seed', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'fill-missing', collections: defaultContent() }),
  }).then(json);

// For each bundled character whose focus-spell arrays were re-pointed to
// spellRef form in Slice C, find the matching live document (by id) in
// liveCharacters and patch it if needed. Uses a read-modify-write so all
// other live fields (inventory, GM edits) are preserved.
// Returns { repointed: [charId, ...] }.
export const repointFocusSpellsToCatalog = async (liveCharacters) => {
  const bundled = defaultContent().character;
  const liveById = new Map(
    (Array.isArray(liveCharacters) ? liveCharacters : [])
      .filter((c) => c && c.id != null)
      .map((c) => [String(c.id), c])
  );
  const repointed = [];
  for (const bundledChar of bundled) {
    if (!bundledChar || bundledChar.id == null) continue;
    const live = liveById.get(String(bundledChar.id));
    if (!live) continue;
    const patched = repointFocusSpells(live, bundledChar);
    if (patched === live) continue;
    await saveDocument('character', String(bundledChar.id), patched);
    repointed.push(String(bundledChar.id));
  }
  return { repointed };
};

// Propagate `chain` config from the bundled defaults to the live (seeded) DO.
// Covers two document kinds:
//   - spell docs: patch any bundled spell that carries a `chain` field but the
//     live doc is missing or has a different `chain` value.
//   - character docs: patch bundled feat actions that carry a `chain` field
//     (matched by feat id + action name) onto the matching live character doc.
// Both are idempotent (JSON equality short-circuit) and non-destructive.
// Returns { patched: ['spell:inner-upheaval', 'character:JadeInferno', ...] }.
export const syncChainConfig = async (liveSpells, liveCharacters) => {
  const bundled = defaultContent();
  const patched = [];

  // ── Spells ────────────────────────────────────────────────────────────────
  const liveSpellById = new Map(
    (Array.isArray(liveSpells) ? liveSpells : [])
      .filter((s) => s && s.id != null)
      .map((s) => [String(s.id), s])
  );
  for (const bundledSpell of (bundled.spell || [])) {
    if (!bundledSpell?.id || !bundledSpell.chain) continue;
    const live = liveSpellById.get(String(bundledSpell.id));
    if (!live) continue;
    if (JSON.stringify(live.chain) === JSON.stringify(bundledSpell.chain)) continue;
    await saveDocument('spell', String(bundledSpell.id), { ...live, chain: bundledSpell.chain });
    patched.push(`spell:${bundledSpell.id}`);
  }

  // ── Characters: feat actions ──────────────────────────────────────────────
  const liveCharById = new Map(
    (Array.isArray(liveCharacters) ? liveCharacters : [])
      .filter((c) => c && c.id != null)
      .map((c) => [String(c.id), c])
  );
  for (const bundledChar of (bundled.character || [])) {
    if (!bundledChar?.id || !Array.isArray(bundledChar.feats)) continue;
    const live = liveCharById.get(String(bundledChar.id));
    if (!live) continue;
    let changed = false;
    const patchedFeats = (live.feats || []).map((liveFeat) => {
      const bundledFeat = bundledChar.feats.find((f) => f.id === liveFeat.id);
      if (!bundledFeat || !Array.isArray(bundledFeat.actions)) return liveFeat;
      const patchedActions = (liveFeat.actions || []).map((liveAction) => {
        const bundledAction = bundledFeat.actions.find((a) => a.name === liveAction.name);
        if (!bundledAction?.chain) return liveAction;
        if (JSON.stringify(liveAction.chain) === JSON.stringify(bundledAction.chain)) return liveAction;
        changed = true;
        return { ...liveAction, chain: bundledAction.chain };
      });
      if (!changed) return liveFeat;
      return { ...liveFeat, actions: patchedActions };
    });
    if (!changed) continue;
    await saveDocument('character', String(bundledChar.id), { ...live, feats: patchedFeats });
    patched.push(`character:${bundledChar.id}`);
  }

  return { patched };
};

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
