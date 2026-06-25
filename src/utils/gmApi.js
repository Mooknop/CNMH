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
// Covers:
//   - spell docs: patch any bundled spell with a `chain` field whose live copy
//     is missing or has a different `chain` value.
//   - character docs: patch bundled feat actions AND top-level character actions
//     that carry a `chain` field (matched by feat-id + action-name / action-name)
//     onto the matching live character doc, preserving all other fields.
// All patches are idempotent (JSON equality short-circuit) and non-destructive.
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

  // ── Characters ────────────────────────────────────────────────────────────
  const liveCharById = new Map(
    (Array.isArray(liveCharacters) ? liveCharacters : [])
      .filter((c) => c && c.id != null)
      .map((c) => [String(c.id), c])
  );

  // Patch an array of actions against their bundled counterparts (matched by name).
  const patchActionArray = (liveActions, bundledActions) => {
    if (!Array.isArray(bundledActions) || !Array.isArray(liveActions)) return liveActions;
    const next = liveActions.map((la) => {
      const ba = bundledActions.find((a) => a.name === la.name);
      if (!ba?.chain) return la;
      if (JSON.stringify(la.chain) === JSON.stringify(ba.chain)) return la;
      return { ...la, chain: ba.chain };
    });
    return JSON.stringify(next) === JSON.stringify(liveActions) ? liveActions : next;
  };

  for (const bundledChar of (bundled.character || [])) {
    if (!bundledChar?.id) continue;
    const live = liveCharById.get(String(bundledChar.id));
    if (!live) continue;

    let doc = live;

    // Patch feat actions (e.g. Jade's Reach Spell, Harrow Casting).
    if (Array.isArray(bundledChar.feats) && Array.isArray(doc.feats)) {
      const patchedFeats = doc.feats.map((liveFeat) => {
        const bf = bundledChar.feats.find((f) => f.id === liveFeat.id);
        const next = patchActionArray(liveFeat.actions, bf?.actions);
        return next === liveFeat.actions ? liveFeat : { ...liveFeat, actions: next };
      });
      if (JSON.stringify(patchedFeats) !== JSON.stringify(doc.feats)) {
        doc = { ...doc, feats: patchedFeats };
      }
    }

    // Patch top-level character actions (e.g. Blu-Kakke's Flurry of Blows).
    if (Array.isArray(bundledChar.actions) && Array.isArray(doc.actions)) {
      const patchedActions = patchActionArray(doc.actions, bundledChar.actions);
      if (patchedActions !== doc.actions) {
        doc = { ...doc, actions: patchedActions };
      }
    }

    if (doc === live) continue;
    await saveDocument('character', String(bundledChar.id), doc);
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

// Image GC audit (#399): read-only dry-run report of orphaned R2 objects + stale
// catalog rows. Returns { unreferenced, catalogWithoutBytes, bytesWithoutCatalog,
// referencedCount, totalR2, totalCatalog, graceWindowHours, scannedAt }.
export const auditImages = () =>
  fetch('/api/gm/images/audit', { credentials: 'include' }).then(json);

// Reclaim the given orphaned image ids. The server re-validates each id is still
// an orphan (and outside the grace window) before deleting, so a stale dry-run
// never reaps a now-referenced image. Returns { reclaimed: [...], skipped: [...] }.
export const sweepImages = (ids) =>
  fetch('/api/gm/images/audit/sweep', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }).then(json);

// Adopt (#757): list R2 objects with no catalog row, so a GM can register and
// manage them in GM Tools → Images. Returns { unregistered: [{ id, size,
// uploaded }], scannedAt }.
export const listUnregisteredImages = () =>
  fetch('/api/gm/images/unregistered', { credentials: 'include' }).then(json);

// Adopt the given unregistered image ids — mints a default catalog entry for
// each. Non-destructive + idempotent: the server re-validates each id is still
// an unregistered R2 object, so an already-registered or missing-bytes id is
// skipped. Returns { adopted: [...], skipped: [{ id, reason }] }.
export const adoptImages = (ids) =>
  fetch('/api/gm/images/adopt', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }).then(json);
