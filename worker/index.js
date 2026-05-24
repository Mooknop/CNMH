// Single Worker: serves the static React build (via the ASSETS binding, with
// SPA fallback), hosts the real-time session endpoint (CampaignSession DO),
// and hosts the editable campaign content store + GM API (CampaignContent DO,
// gated by Cloudflare Access). Same origin as the app — no CORS.

import { CampaignSession } from './CampaignSession.js';
import { CampaignContent } from './CampaignContent.js';
import { verifyAccess } from './access.js';

export { CampaignSession, CampaignContent };

const CAMPAIGN_ID = 'osprey-covey';

const contentStub = (env) =>
  env.CAMPAIGN_CONTENT.get(env.CAMPAIGN_CONTENT.idFromName(CAMPAIGN_ID));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
      if (env.ENVIRONMENT !== 'staging') return new Response('Not found', { status: 404 });
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

    // GM writes — verified server-side before reaching the content DO.
    if (url.pathname.startsWith('/api/gm/')) {
      const gm = await verifyAccess(request, env);
      if (!gm) return new Response('Forbidden', { status: 403 });
      return contentStub(env).fetch(request);
    }

    // Everything else: static assets. `not_found_handling = single-page-
    // application` makes unmatched client routes (incl. /gm) resolve to
    // index.html (200). Cloudflare Access protects the /gm* path at the edge.
    return env.ASSETS.fetch(request);
  },
};
