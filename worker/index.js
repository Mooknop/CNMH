// Single Worker: serves the static React build (via the ASSETS binding, with
// SPA fallback), hosts the real-time session endpoint (CampaignSession DO),
// and hosts the editable campaign content store + GM API (CampaignContent DO,
// gated by Cloudflare Access). Same origin as the app — no CORS.

import { CampaignSession } from './CampaignSession.js';
import { CampaignContent } from './CampaignContent.js';
import { verifyAccess } from './access.js';

export { CampaignSession, CampaignContent };

const CAMPAIGN_ID = 'osprey-covey';

// Shared image-upload constraints (used by both the Access-gated GM upload and
// the BRIDGE_SECRET-gated Foundry token import).
const IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const IMAGE_MAX_BYTES = 1.5 * 1024 * 1024;

const contentStub = (env) =>
  env.CAMPAIGN_CONTENT.get(env.CAMPAIGN_CONTENT.idFromName(CAMPAIGN_ID));

// SHA-256 of the bytes as lowercase hex — used for content-addressed dedup of
// imported token art (identical art across creatures/encounters → one object).
async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Foundry bridge — authenticated with a shared secret, forwards to the
    // same CampaignSession DO as player devices. The bridge becomes a normal
    // session peer: it sends/receives { type:'UPDATE', characterId, key, value }.
    if (url.pathname.startsWith('/bridge/')) {
      const campaignId = url.pathname.split('/')[2];
      if (!campaignId) return new Response('Missing campaign id', { status: 400 });
      const secret = url.searchParams.get('key');
      if (!env.BRIDGE_SECRET || secret !== env.BRIDGE_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
      const id = env.CAMPAIGN_SESSION.idFromName(campaignId);
      return env.CAMPAIGN_SESSION.get(id).fetch(request);
    }

    // Real-time session sync (unchanged).
    if (url.pathname.startsWith('/session/')) {
      const campaignId = url.pathname.split('/')[2];
      if (!campaignId) {
        return new Response('Missing campaign id', { status: 400 });
      }
      const id = env.CAMPAIGN_SESSION.idFromName(campaignId);
      return env.CAMPAIGN_SESSION.get(id).fetch(request);
    }

    // Live content channel (GM edits fan out to all devices).
    if (url.pathname.startsWith('/content-sync/')) {
      return contentStub(env).fetch(request);
    }

    // Public content snapshot (players are unauthenticated by design).
    if (request.method === 'GET' && url.pathname === '/api/content') {
      return contentStub(env).fetch(request);
    }

    // GM identity probe — used by the client only to show/hide GM UI.
    if (url.pathname === '/api/gm/whoami') {
      const gm = await verifyAccess(request, env);
      if (!gm) return new Response('Unauthorized', { status: 401 });
      return Response.json({ email: gm.email });
    }

    // Test data reset — staging only, Access-protected.
    // Wipes both DOs so each test run starts from a clean slate.
    // ?keep_session=1 and ?keep_content=1 opt out of clearing that DO.
    if (request.method === 'POST' && url.pathname === '/api/gm/_test/reset') {
      const gm = await verifyAccess(request, env);
      if (!gm) return new Response('Forbidden', { status: 403 });
      if (!['staging', 'e2e'].includes(env.ENVIRONMENT)) return new Response('Not found', { status: 404 });
      const resetUrl = new URL('/_internal/reset', request.url);
      if (url.searchParams.has('keep_session')) resetUrl.searchParams.set('keep_session', '1');
      if (url.searchParams.has('keep_content')) resetUrl.searchParams.set('keep_content', '1');
      await contentStub(env).fetch(new Request(resetUrl.toString(), { method: 'POST' }));
      const sessionId = env.CAMPAIGN_SESSION.idFromName(CAMPAIGN_ID);
      await env.CAMPAIGN_SESSION.get(sessionId).fetch(new Request(resetUrl.toString(), { method: 'POST' }));
      return Response.json({ ok: true });
    }

    // DO write-budget chip — read-only, no writes.
    if (request.method === 'GET' && url.pathname === '/api/gm/usage') {
      const gm = await verifyAccess(request, env);
      if (!gm) return new Response('Forbidden', { status: 403 });
      return contentStub(env).fetch(new Request(new URL('/_internal/usage', request.url).toString()));
    }

    // Image upload: POST /api/gm/images — Access-gated, writes bytes to R2,
    // then records the catalog entry in the content DO.
    if (request.method === 'POST' && url.pathname === '/api/gm/images') {
      const gm = await verifyAccess(request, env);
      if (!gm) return new Response('Forbidden', { status: 403 });

      let formData;
      try {
        formData = await request.formData();
      } catch {
        return new Response('Expected multipart/form-data', { status: 400 });
      }
      const file = formData.get('file');
      if (!file || typeof file.arrayBuffer !== 'function') {
        return new Response('Missing file field', { status: 400 });
      }

      const mime = file.type;
      if (!IMAGE_ALLOWED_TYPES.includes(mime)) {
        return new Response('Only JPEG, PNG, and WebP are allowed', { status: 415 });
      }

      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > IMAGE_MAX_BYTES) {
        return new Response('File too large (max 1.5 MB after resize)', { status: 413 });
      }

      const id = `img_${crypto.randomUUID()}${IMAGE_EXT[mime]}`;
      await env.CAMPAIGN_IMAGES.put(id, bytes, { httpMetadata: { contentType: mime } });

      const name = (formData.get('name') || file.name || id).slice(0, 200);
      const folder = (formData.get('folder') || '').slice(0, 100).trim();
      const createdAt = Date.now();
      const catalogEntry = { id, name, folder, mimeType: mime, createdAt };

      await contentStub(env).fetch(
        new Request(`${url.origin}/api/gm/image/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(catalogEntry),
        })
      );

      return Response.json(catalogEntry, { status: 201 });
    }

    // Image delete: POST /api/gm/images/:id/delete — checks for references first.
    if (request.method === 'POST' && url.pathname.match(/^\/api\/gm\/images\/[^/]+\/delete$/)) {
      const gm = await verifyAccess(request, env);
      if (!gm) return new Response('Forbidden', { status: 403 });

      const id = decodeURIComponent(url.pathname.split('/')[4]);

      // Read the full content snapshot to check references.
      const snapRes = await contentStub(env).fetch(
        new Request(`${url.origin}/api/content`, { method: 'GET' })
      );
      const snap = await snapRes.json();
      const payload = snap.payload || {};

      const references = [];
      // Check items
      for (const item of payload.item || []) {
        if (item.image === id) {
          references.push({ collection: 'item', id: item.id, name: item.name || item.id });
        }
      }
      // Check lore entries
      for (const entry of payload.lore || []) {
        if (entry.image === id) {
          references.push({ collection: 'lore', id: entry.id, name: entry.title || entry.id });
        }
      }
      // Check characters (incl. nested familiar + animalCompanion)
      for (const char of payload.character || []) {
        if (char.image === id) {
          references.push({ collection: 'character', id: char.id, name: char.name || char.id });
        }
        if (char.familiar && char.familiar.image === id) {
          references.push({ collection: 'character', id: char.id, name: `${char.name || char.id} (familiar)` });
        }
        if (char.animalCompanion && char.animalCompanion.image === id) {
          references.push({ collection: 'character', id: char.id, name: `${char.name || char.id} (animal companion)` });
        }
      }
      // Check captured monster docs — token art imported by the bridge stores the
      // public /api/images/<id> URL in bestiary.img, so match on that suffix.
      for (const monster of payload.monster || []) {
        const img = monster.bestiary && monster.bestiary.img;
        if (typeof img === 'string' && img.endsWith(`/api/images/${id}`)) {
          references.push({ collection: 'monster', id: monster.id, name: monster.name || monster.id });
        }
      }

      if (references.length > 0) {
        return Response.json({ references }, { status: 409 });
      }

      await env.CAMPAIGN_IMAGES.delete(id);
      await contentStub(env).fetch(
        new Request(`${url.origin}/api/gm/image/${encodeURIComponent(id)}`, { method: 'DELETE' })
      );

      return Response.json({ ok: true });
    }

    // Foundry token import: POST /api/bridge/image?key=<secret> — gated by the
    // shared BRIDGE_SECRET (the bridge has no Cloudflare Access JWT). The bridge
    // is the only peer that can read Foundry token bytes (same origin as the
    // Foundry asset server), so it streams them here. Bytes are content-addressed
    // for dedup and a catalog entry is registered so the art shows up in
    // GM Tools → Images alongside hand-uploaded images.
    if (request.method === 'POST' && url.pathname === '/api/bridge/image') {
      const secret = url.searchParams.get('key');
      if (!env.BRIDGE_SECRET || secret !== env.BRIDGE_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }

      const mime = request.headers.get('Content-Type') || '';
      if (!IMAGE_ALLOWED_TYPES.includes(mime)) {
        return new Response('Only JPEG, PNG, and WebP are allowed', { status: 415 });
      }

      const bytes = await request.arrayBuffer();
      if (bytes.byteLength === 0) {
        return new Response('Empty body', { status: 400 });
      }
      if (bytes.byteLength > IMAGE_MAX_BYTES) {
        return new Response('File too large (max 1.5 MB)', { status: 413 });
      }

      const hash = await sha256Hex(bytes);
      const id = `tok_${hash}${IMAGE_EXT[mime]}`;

      // Content-addressed: identical bytes already in R2 → skip both the byte
      // write and the catalog registration (bytes + catalog entry are created
      // together, so a head() hit means the entry already exists).
      const existing = await env.CAMPAIGN_IMAGES.head(id);
      if (!existing) {
        await env.CAMPAIGN_IMAGES.put(id, bytes, { httpMetadata: { contentType: mime } });

        const name = (url.searchParams.get('name') || id).slice(0, 200);
        const catalogEntry = { id, name, folder: 'Bestiary Tokens', mimeType: mime, createdAt: Date.now() };
        await contentStub(env).fetch(
          new Request(`${url.origin}/api/gm/image/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(catalogEntry),
          })
        );
      }

      return Response.json({ id, url: `/api/images/${id}` });
    }

    // GM writes — verified server-side before reaching the content DO.
    if (url.pathname.startsWith('/api/gm/')) {
      const gm = await verifyAccess(request, env);
      if (!gm) return new Response('Forbidden', { status: 403 });
      return contentStub(env).fetch(request);
    }

    // Image serve: GET /api/images/:key — public, streams from R2 with
    // immutable cache headers (the key is a UUID, so bytes never change).
    if (request.method === 'GET' && url.pathname.startsWith('/api/images/')) {
      const key = decodeURIComponent(url.pathname.slice('/api/images/'.length));
      if (!key) return new Response('Not found', { status: 404 });
      const object = await env.CAMPAIGN_IMAGES.get(key);
      if (!object) return new Response('Not found', { status: 404 });
      const headers = new Headers();
      headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(object.body, { headers });
    }

    // Everything else: static assets. `not_found_handling = single-page-
    // application` makes unmatched client routes (incl. /gm) resolve to
    // index.html (200). Cloudflare Access protects the /gm* path at the edge.
    return env.ASSETS.fetch(request);
  },
};
