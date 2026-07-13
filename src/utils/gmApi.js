// Thin client for the GM write API. Same-origin, so the Cloudflare Access
// cookie rides automatically; the Worker re-verifies it before the write
// reaches the content Durable Object, which then broadcasts the change live.

import { buildSeedPayload, defaultContent } from './contentUtils';

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

// Bulk import into a capture-only collection (the adventure-room guide,
// #1074/#1075; the chapter-event tracker, #1112). The browser's Cloudflare
// Access cookie rides along; the Worker re-verifies it. Per-doc upsert by id —
// reports { created, updated, unchanged, skipped }.
export const importDocs = (collection, docs) =>
  fetch(`/api/gm/import/${collection}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docs }),
  }).then(json);

export const importRooms = (docs) => importDocs('room', docs);
export const importEvents = (docs) => importDocs('event', docs);

export const seedDefaults = (force = false) =>
  fetch('/api/gm/seed', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSeedPayload(force)),
  }).then(json);

// Authored-only collections that are safe to overwrite at the document level:
// pure content with no live player/GM-session state mixed in. Deliberately
// EXCLUDES character (live inventory/gold/loadout — needs field-level merge),
// theme (GM-customized via the theme editor), image (R2 upload/delete flow),
// monster (bestiary capture), and lore — those have their own write paths and
// must never be clobbered by a wholesale doc overwrite.
//
// lore is owned by the Obsidian vault: content (summary/body/parent/related/…)
// is authored there and pushed by the lore-sync workflow, and the app only
// toggles reveal `visibility`. The committed seed is a stale snapshot that owns
// nothing on a lore doc, so a content apply overwriting it would wipe the
// vault's parent/related edges (and silently revert any vault prose edit) — the
// exact incident in #849. Lore still ships in the seed for INITIAL seeding
// (/api/gm/seed); it's only the incremental apply that must leave it alone.
export const DIFFABLE_COLLECTIONS = [
  'quest', 'faction', 'calendar', 'trait', 'item', 'spell', 'effect', 'rune',
  'fxAnimations',
];

// Order-insensitive structural equality — used only to decide whether a doc
// actually changed. Avoids re-writing (and archiving) docs whose stored key
// order merely differs from the freshly-built bundle, which would otherwise
// burn writes and flood history with no real change.
const deepEqual = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
};

// Live (GM-assigned) image-reference fields on catalog docs. The GM editors
// assign artwork to a live doc via ImageField (image = R2 image id,
// imagePosition = focal point) — a live GM action, not seed-authored content,
// exactly like a player's inventory/gold on a character doc. The committed
// seed only ever carries a stale copy from the last snapshot pull, so a
// content apply overwriting these would silently revert any assignment made
// since that pull (the 2026-07-02 incident: item art wiped by an apply).
// Mirror of LIVE_CHARACTER_FIELDS: the live doc wins for these fields,
// including their absence (a GM removing an image must stay removed).
export const LIVE_IMAGE_FIELDS = ['image', 'imagePosition'];

// Apply a content drop the SAFE way: diff the bundled defaults against the
// CURRENT live store and write ONLY the docs that are new or actually changed,
// one PUT each. The PUT route archives the prior version before overwriting, so
// every write is restorable from history — unlike a force reseed, which deletes
// whole collections and bypasses history entirely.
//
// Never deletes: a live doc absent from the bundle is reported as `liveOnly`
// for manual review, not removed. Scoped to DIFFABLE_COLLECTIONS so characters,
// theme, images, and monsters are never touched.
//
// Cost: one /api/content read (off which the diff is computed against the most
// current state, minimizing the drift window) plus one PUT per changed doc —
// versus a force reseed's delete-and-replace of every collection. Returns a
// per-collection report: { quest: { added, changed, unchanged, liveOnly } }.
export const applyContentDiff = async () => {
  const res = await fetch('/api/content', { credentials: 'include' });
  if (!res.ok) throw new Error(`Couldn’t read live content (HTTP ${res.status}).`);
  const body = await res.json();
  const live = (body && body.payload && typeof body.payload === 'object' ? body.payload : body) || {};
  const bundled = defaultContent();

  const report = {};
  for (const collection of DIFFABLE_COLLECTIONS) {
    const bundledDocs = Array.isArray(bundled[collection]) ? bundled[collection] : [];
    const liveDocs = Array.isArray(live[collection]) ? live[collection] : [];
    const liveById = new Map(
      liveDocs.filter((d) => d && d.id != null).map((d) => [String(d.id), d])
    );
    const bundledIds = new Set();
    const added = [];
    const changed = [];
    let unchanged = 0;
    for (const doc of bundledDocs) {
      if (!doc || doc.id == null) continue;
      const id = String(doc.id);
      bundledIds.add(id);
      const liveDoc = liveById.get(id);
      if (!liveDoc) {
        await saveDocument(collection, id, doc);
        added.push(id);
        continue;
      }
      // Overwrites are merged: authored fields from the bundle, image
      // references from the live doc (see LIVE_IMAGE_FIELDS). The merge
      // happens BEFORE the equality check so a doc whose only drift is a
      // live image assignment counts as unchanged — no write, no archive.
      const merged = { ...doc, id };
      for (const f of LIVE_IMAGE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(liveDoc, f)) merged[f] = liveDoc[f];
        else delete merged[f];
      }
      if (deepEqual(merged, { ...liveDoc, id })) {
        unchanged += 1;
      } else {
        await saveDocument(collection, id, merged);
        changed.push(id);
      }
    }
    const liveOnly = liveDocs
      .filter((d) => d && d.id != null && !bundledIds.has(String(d.id)))
      .map((d) => String(d.id));
    if (added.length || changed.length || unchanged || liveOnly.length) {
      report[collection] = { added, changed, unchanged, liveOnly };
    }
  }
  return report;
};

// Live (player-mutated) character-doc fields. These are preserved from the live
// doc and NEVER overwritten by a content apply. Derived from the only app paths
// that write a character doc from player state — the reconciliation engine
// (consumed/gold/acquired/removed, utils/reconcile.js), Quick Craft
// (utils/applyCrafting.js), and training grants (utils/applyTraining.js,
// #1191 S2: abilities granted into `trained`, folded into feats/reactions at
// content-resolve time). Everything else on a character doc is authored
// content and flows from the bundle. (loadout #559 manifests as
// inventory-entry changes, already covered.)
export const LIVE_CHARACTER_FIELDS = ['inventory', 'gold', 'trained'];

// Top-level field names where two character docs differ (deep), unioning keys
// present in only one. Used to report which authored fields a merge changed.
const changedFieldNames = (a, b) => {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  return [...keys].filter((k) => !deepEqual(a?.[k], b?.[k])).sort();
};

// Apply authored character content WITHOUT clobbering live player state — the
// character counterpart of applyContentDiff (characters are excluded there
// because a wholesale overwrite would revert live inventory/gold). For each
// bundled character: one absent from the live store is added whole (no live
// state to protect); an existing one is FIELD-MERGED — authored fields come
// from the bundle, LIVE_CHARACTER_FIELDS are kept from the live doc. Each write
// goes through saveDocument (archives the prior version → restorable) and is
// idempotent (a no-op merge is skipped). Never deletes: characters only in the
// live store are reported as `liveOnly`. Returns
// { added: [id], changed: [{ id, fields }], liveOnly: [id] }.
export const applyCharacterContentDiff = async (liveCharacters) => {
  const bundled = defaultContent().character || [];
  const liveById = new Map(
    (Array.isArray(liveCharacters) ? liveCharacters : [])
      .filter((c) => c && c.id != null)
      .map((c) => [String(c.id), c])
  );
  const bundledIds = new Set();
  const added = [];
  const changed = [];
  for (const bundledChar of bundled) {
    if (!bundledChar || bundledChar.id == null) continue;
    const id = String(bundledChar.id);
    bundledIds.add(id);
    const live = liveById.get(id);
    if (!live) {
      await saveDocument('character', id, { ...bundledChar, id });
      added.push(id);
      continue;
    }
    // Authored fields from the bundle; live fields preserved from the live doc.
    const merged = { ...bundledChar, id };
    for (const f of LIVE_CHARACTER_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(live, f)) merged[f] = live[f];
      else delete merged[f];
    }
    const liveDoc = { ...live, id };
    if (deepEqual(merged, liveDoc)) continue; // idempotent: nothing authored changed
    const fields = changedFieldNames(merged, liveDoc).filter((f) => !LIVE_CHARACTER_FIELDS.includes(f));
    await saveDocument('character', id, merged);
    changed.push({ id, fields });
  }
  const liveOnly = [...liveById.keys()].filter((id) => !bundledIds.has(id));
  return { added, changed, liveOnly };
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
