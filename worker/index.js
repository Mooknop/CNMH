// Single Worker: serves the static React build (via the ASSETS binding, with
// SPA fallback), hosts the real-time session endpoint (CampaignSession DO),
// and hosts the editable campaign content store + GM API (CampaignContent DO,
// gated by Cloudflare Access). Same origin as the app — no CORS.
//
// Routing (#1318) is a declarative table dispatched by worker/router.js:
// adding an endpoint is one ROUTES entry; `gm: true` runs the requireGm guard
// before the handler. Errors use the JSON envelope { error } via err().

import { CampaignSession } from './CampaignSession.js';
import { CampaignContent } from './CampaignContent.js';
import { requireGm } from './access.js';
import { scanImageReferences } from './imageReferences.js';
import { computeImageOrphans, computeUnregisteredImages } from './imageOrphans.js';
import { matchRoute, err } from './router.js';

export { CampaignSession, CampaignContent };

const CAMPAIGN_ID = 'osprey-covey';

// Shared image-upload constraints (used by both the Access-gated GM upload and
// the BRIDGE_SECRET-gated Foundry token import).
const IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const IMAGE_MAX_BYTES = 1.5 * 1024 * 1024;

// Reverse of IMAGE_EXT: guess the mime type from an R2 key's extension. Used as
// a fallback when adopting (#757) a stranded object whose R2 httpMetadata is
// missing a contentType.
const EXT_MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const mimeFromKey = (key) => {
  const dot = String(key).lastIndexOf('.');
  return dot === -1 ? '' : (EXT_MIME[key.slice(dot).toLowerCase()] || '');
};

// Image GC (#399): never reap an R2 object / catalog entry created within this
// window, so an in-flight token capture whose monster doc hasn't persisted yet
// is safe.
const IMAGE_GC_GRACE_HOURS = 24;
const IMAGE_GC_GRACE_MS = IMAGE_GC_GRACE_HOURS * 60 * 60 * 1000;

// Page through the whole R2 image bucket → [{ key, uploaded(ms), size }].
async function listAllImages(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.CAMPAIGN_IMAGES.list({ cursor });
    for (const obj of page.objects) {
      out.push({ key: obj.key, uploaded: obj.uploaded ? obj.uploaded.getTime() : null, size: obj.size });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

// Compute the orphaned-image report (shared by the audit GET and the sweep POST):
// live R2 listing + `image` catalog + the referenced-id set from the deep scanner.
async function imageAuditReport(env, origin) {
  const snapRes = await contentStub(env).fetch(
    new Request(`${origin}/api/content`, { method: 'GET' })
  );
  const snap = await snapRes.json();
  const payload = snap.payload || {};
  const r2Objects = await listAllImages(env);
  const catalog = payload.image || [];
  const referencedIds = new Set(scanImageReferences(payload).keys());
  return computeImageOrphans({
    r2Objects,
    catalog,
    referencedIds,
    now: Date.now(),
    graceMs: IMAGE_GC_GRACE_MS,
  });
}

// Adopt (#757): R2 objects with no `image` catalog row → [{ id, size, uploaded }].
// Powers both the unregistered-listing GET and the re-validation in the adopt POST.
async function listUnregisteredImages(env, origin) {
  const snapRes = await contentStub(env).fetch(
    new Request(`${origin}/api/content`, { method: 'GET' })
  );
  const snap = await snapRes.json();
  const catalog = (snap.payload || {}).image || [];
  const r2Objects = await listAllImages(env);
  return computeUnregisteredImages({ r2Objects, catalog });
}

const contentStub = (env) =>
  env.CAMPAIGN_CONTENT.get(env.CAMPAIGN_CONTENT.idFromName(CAMPAIGN_ID));

// SHA-256 of the bytes as lowercase hex — used for content-addressed dedup of
// imported token art (identical art across creatures/encounters → one object).
async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Register (or re-register) an image catalog entry in the content DO.
const putCatalogEntry = (env, origin, entry) =>
  contentStub(env).fetch(
    new Request(`${origin}/api/gm/image/${encodeURIComponent(entry.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
  );

// ---------------------------------------------------------------------------
// Route handlers. ctx = { request, env, url, params, gm }.
// ---------------------------------------------------------------------------

// Foundry bridge — authenticated with a shared secret, forwards to the same
// CampaignSession DO as player devices. The bridge becomes a normal session
// peer: it sends/receives { type:'UPDATE', characterId, key, value }.
function bridgeSession({ request, env, url, params }) {
  if (!params.campaignId) return err(400, 'Missing campaign id');
  const secret = url.searchParams.get('key');
  if (!env.BRIDGE_SECRET || secret !== env.BRIDGE_SECRET) return err(403, 'Forbidden');
  const id = env.CAMPAIGN_SESSION.idFromName(params.campaignId);
  return env.CAMPAIGN_SESSION.get(id).fetch(request);
}

// Real-time session sync.
function appSession({ request, env, params }) {
  if (!params.campaignId) return err(400, 'Missing campaign id');
  const id = env.CAMPAIGN_SESSION.idFromName(params.campaignId);
  return env.CAMPAIGN_SESSION.get(id).fetch(request);
}

// GM identity probe — used by the client only to show/hide GM UI.
function whoami({ gm }) {
  return Response.json({ email: gm.email });
}

// Test data reset — staging/e2e only, Access-protected. Wipes both DOs so each
// test run starts from a clean slate. ?keep_session=1 / ?keep_content=1 opt out.
async function testReset({ request, env, url }) {
  if (!['staging', 'e2e'].includes(env.ENVIRONMENT)) return err(404, 'Not found');
  const resetUrl = new URL('/_internal/reset', request.url);
  if (url.searchParams.has('keep_session')) resetUrl.searchParams.set('keep_session', '1');
  if (url.searchParams.has('keep_content')) resetUrl.searchParams.set('keep_content', '1');
  await contentStub(env).fetch(new Request(resetUrl.toString(), { method: 'POST' }));
  const sessionId = env.CAMPAIGN_SESSION.idFromName(CAMPAIGN_ID);
  await env.CAMPAIGN_SESSION.get(sessionId).fetch(new Request(resetUrl.toString(), { method: 'POST' }));
  return Response.json({ ok: true });
}

// DO write-budget chip — read-only, no writes.
function usage({ request, env }) {
  return contentStub(env).fetch(new Request(new URL('/_internal/usage', request.url).toString()));
}

// Image upload: Access-gated, writes bytes to R2, then records the catalog
// entry in the content DO.
async function uploadImage({ request, env, url }) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return err(400, 'Expected multipart/form-data');
  }
  const file = formData.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return err(400, 'Missing file field');

  const mime = file.type;
  if (!IMAGE_ALLOWED_TYPES.includes(mime)) return err(415, 'Only JPEG, PNG, and WebP are allowed');

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > IMAGE_MAX_BYTES) return err(413, 'File too large (max 1.5 MB after resize)');

  const id = `img_${crypto.randomUUID()}${IMAGE_EXT[mime]}`;
  await env.CAMPAIGN_IMAGES.put(id, bytes, { httpMetadata: { contentType: mime } });

  const name = (formData.get('name') || file.name || id).slice(0, 200);
  const folder = (formData.get('folder') || '').slice(0, 100).trim();
  const catalogEntry = { id, name, folder, mimeType: mime, createdAt: Date.now() };
  await putCatalogEntry(env, url.origin, catalogEntry);

  return Response.json(catalogEntry, { status: 201 });
}

// Image delete — checks for references first.
async function deleteImage({ env, url, params }) {
  const { id } = params;

  const snapRes = await contentStub(env).fetch(
    new Request(`${url.origin}/api/content`, { method: 'GET' })
  );
  const snap = await snapRes.json();
  const payload = snap.payload || {};

  // Shared deep reference scan (worker/imageReferences.js) — also walks nested
  // ability/action images and monster bestiary.img token URLs.
  const references = scanImageReferences(payload).get(id) || [];
  if (references.length > 0) {
    return Response.json({ references }, { status: 409 });
  }

  await env.CAMPAIGN_IMAGES.delete(id);
  await contentStub(env).fetch(
    new Request(`${url.origin}/api/gm/image/${encodeURIComponent(id)}`, { method: 'DELETE' })
  );
  return Response.json({ ok: true });
}

// Image GC audit — READ-ONLY. Reports orphaned R2 objects + stale catalog rows
// in three buckets so a GM can review before reclaiming (the sweep is a
// separate, explicit action).
async function imagesAudit({ env, url }) {
  const report = await imageAuditReport(env, url.origin);
  return Response.json({ ...report, graceWindowHours: IMAGE_GC_GRACE_HOURS, scannedAt: Date.now() });
}

// Image GC sweep. Body { ids: [...] }. Re-runs the audit and only deletes ids
// that are STILL orphaned (and still outside the grace window) at this moment —
// a referenced or too-new id requested from a stale dry-run report is skipped,
// never reaped.
async function imagesSweep({ request, env, url }) {
  let body;
  try { body = await request.json(); } catch { return err(400, 'Bad JSON'); }
  const ids = Array.isArray(body?.ids) ? body.ids : null;
  if (!ids) return err(400, 'Expected { ids: [...] }');

  const report = await imageAuditReport(env, url.origin);
  // id → what to delete: 'both' (bytes + catalog), 'bytes', or 'catalog'.
  const action = new Map();
  for (const o of report.unreferenced)        action.set(o.id, 'both');
  for (const o of report.bytesWithoutCatalog) action.set(o.id, 'bytes');
  for (const o of report.catalogWithoutBytes) action.set(o.id, 'catalog');

  const reclaimed = [];
  const skipped = [];
  for (const id of ids) {
    const act = action.get(id);
    if (!act) { skipped.push({ id, reason: 'not-orphan' }); continue; }
    if (act === 'both' || act === 'bytes') {
      await env.CAMPAIGN_IMAGES.delete(id);
    }
    if (act === 'both' || act === 'catalog') {
      await contentStub(env).fetch(
        new Request(`${url.origin}/api/gm/image/${encodeURIComponent(id)}`, { method: 'DELETE' })
      );
    }
    reclaimed.push({ id, action: act });
  }
  return Response.json({ reclaimed, skipped });
}

// Adopt listing — READ-ONLY. R2 objects with no catalog row, so a GM can
// register ("adopt") them and manage them in GM Tools → Images (#757).
async function imagesUnregistered({ env, url }) {
  const unregistered = await listUnregisteredImages(env, url.origin);
  return Response.json({ unregistered, scannedAt: Date.now() });
}

// Adopt. Body { ids: [...] }. Mints a default catalog entry for each id that is
// CURRENTLY an R2 object with no catalog row. Non-destructive + idempotent: an
// already-registered id or one whose bytes are gone is skipped, never
// overwritten (re-validated here so a stale client listing can't clobber).
async function imagesAdopt({ request, env, url }) {
  let body;
  try { body = await request.json(); } catch { return err(400, 'Bad JSON'); }
  const ids = Array.isArray(body?.ids) ? body.ids : null;
  if (!ids) return err(400, 'Expected { ids: [...] }');

  const adoptable = new Set((await listUnregisteredImages(env, url.origin)).map((o) => o.id));

  const adopted = [];
  const skipped = [];
  for (const id of ids) {
    if (!adoptable.has(id)) { skipped.push({ id, reason: 'not-unregistered' }); continue; }
    const head = await env.CAMPAIGN_IMAGES.head(id);
    if (!head) { skipped.push({ id, reason: 'no-bytes' }); continue; }
    const entry = {
      id,
      name: id,
      folder: 'Unsorted',
      mimeType: head.httpMetadata?.contentType || mimeFromKey(id),
      createdAt: Date.now(),
    };
    await putCatalogEntry(env, url.origin, entry);
    adopted.push(entry);
  }
  return Response.json({ adopted, skipped });
}

// Foundry token import — gated by the shared BRIDGE_SECRET (the bridge has no
// Cloudflare Access JWT). The bridge is the only peer that can read Foundry
// token bytes (same origin as the Foundry asset server), so it streams them
// here. Bytes are content-addressed for dedup and a catalog entry is
// registered so the art shows up in GM Tools → Images.
//
// The bridge runs on a different origin (e.g. Forge), and the image/* body
// Content-Type is not CORS-safelisted, so the browser sends a preflight.
// Auth is the `key` query param (not a cookie), so we can allow any origin.
async function bridgeImage({ request, env, url }) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') return err(405, 'Method not allowed', CORS);

  const secret = url.searchParams.get('key');
  if (!env.BRIDGE_SECRET || secret !== env.BRIDGE_SECRET) return err(403, 'Forbidden', CORS);

  const mime = request.headers.get('Content-Type') || '';
  if (!IMAGE_ALLOWED_TYPES.includes(mime)) return err(415, 'Only JPEG, PNG, and WebP are allowed', CORS);

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return err(400, 'Empty body', CORS);
  if (bytes.byteLength > IMAGE_MAX_BYTES) return err(413, 'File too large (max 1.5 MB)', CORS);

  const hash = await sha256Hex(bytes);
  const id = `tok_${hash}${IMAGE_EXT[mime]}`;

  // Content-addressed: identical bytes already in R2 → skip both the byte write
  // and the catalog registration (bytes + catalog entry are created together,
  // so a head() hit means the entry already exists).
  const existing = await env.CAMPAIGN_IMAGES.head(id);
  if (!existing) {
    await env.CAMPAIGN_IMAGES.put(id, bytes, { httpMetadata: { contentType: mime } });
    const name = (url.searchParams.get('name') || id).slice(0, 200);
    await putCatalogEntry(env, url.origin, {
      id, name, folder: 'Bestiary Tokens', mimeType: mime, createdAt: Date.now(),
    });
  }

  return Response.json({ id, url: `/api/images/${id}` }, { headers: CORS });
}

// Image serve — public, streams from R2 with immutable cache headers (the key
// is content-addressed / UUID, so bytes never change).
async function serveImage({ env, params }) {
  let key = params['*'];
  try { key = decodeURIComponent(key); } catch { /* serve the raw key */ }
  if (!key) return err(404, 'Not found');
  const object = await env.CAMPAIGN_IMAGES.get(key);
  if (!object) return err(404, 'Not found');
  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
}

// ---------------------------------------------------------------------------
// The route table. Matched in order: specific GM endpoints before the
// /api/gm/* catch-all that forwards remaining GM writes to the content DO.
// ---------------------------------------------------------------------------
export const ROUTES = [
  { method: '*',    path: '/bridge/:campaignId/*',              handler: bridgeSession },
  { method: '*',    path: '/session/:campaignId/*',             handler: appSession },
  // Bare /bridge and /session (no campaign id) kept as explicit 400s.
  { method: '*',    path: '/bridge',                            handler: () => err(400, 'Missing campaign id') },
  { method: '*',    path: '/session',                           handler: () => err(400, 'Missing campaign id') },
  { method: '*',    path: '/content-sync/:campaignId/*',        handler: ({ request, env }) => contentStub(env).fetch(request) },
  { method: 'GET',  path: '/api/content',                       handler: ({ request, env }) => contentStub(env).fetch(request) },
  { method: '*',    path: '/api/gm/whoami',           gm: true, handler: whoami },
  { method: 'POST', path: '/api/gm/_test/reset',      gm: true, handler: testReset },
  { method: 'GET',  path: '/api/gm/usage',            gm: true, handler: usage },
  { method: 'POST', path: '/api/gm/images',           gm: true, handler: uploadImage },
  { method: 'POST', path: '/api/gm/images/:id/delete', gm: true, handler: deleteImage },
  { method: 'GET',  path: '/api/gm/images/audit',     gm: true, handler: imagesAudit },
  { method: 'POST', path: '/api/gm/images/audit/sweep', gm: true, handler: imagesSweep },
  { method: 'GET',  path: '/api/gm/images/unregistered', gm: true, handler: imagesUnregistered },
  { method: 'POST', path: '/api/gm/images/adopt',     gm: true, handler: imagesAdopt },
  { method: '*',    path: '/api/bridge/image',                  handler: bridgeImage },
  // GM writes — verified server-side before reaching the content DO.
  { method: '*',    path: '/api/gm/*',                gm: true, handler: ({ request, env }) => contentStub(env).fetch(request) },
  { method: 'GET',  path: '/api/images/*',                      handler: serveImage },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const match = matchRoute(ROUTES, request.method, url.pathname);
    if (match) {
      const { route, params } = match;
      let gm = null;
      if (route.gm) {
        gm = await requireGm(request, env);
        if (gm instanceof Response) return gm;
      }
      return route.handler({ request, env, url, params, gm });
    }

    // Everything else: static assets. `not_found_handling = single-page-
    // application` makes unmatched client routes (incl. /gm) resolve to
    // index.html (200). Cloudflare Access protects the /gm* path at the edge.
    return env.ASSETS.fetch(request);
  },
};
