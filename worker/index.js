// Single Worker: serves the static React build (via the ASSETS binding, with
// SPA fallback) and hosts the real-time session endpoint backed by the
// CampaignSession Durable Object. Same origin as the app — no CORS.

import { CampaignSession } from './CampaignSession.js';

export { CampaignSession };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/session/')) {
      const campaignId = url.pathname.split('/')[2];
      if (!campaignId) {
        return new Response('Missing campaign id', { status: 400 });
      }
      const id = env.CAMPAIGN_SESSION.idFromName(campaignId);
      return env.CAMPAIGN_SESSION.get(id).fetch(request);
    }

    // Everything else: static assets. `not_found_handling = single-page-application`
    // makes unmatched client routes resolve to index.html (200).
    return env.ASSETS.fetch(request);
  },
};
