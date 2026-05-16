// Pages Function: GET /session/:campaignId
// Upgrades the request to a WebSocket and routes it to the campaign's Durable
// Object. Same-origin with the static app, so no CORS is required.

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  const campaignId = params.campaignId;
  const id = env.CAMPAIGN_SESSION.idFromName(campaignId);
  const stub = env.CAMPAIGN_SESSION.get(id);
  return stub.fetch(request);
}

// Re-exported so the Durable Object class is part of the Functions bundle and
// can be bound via wrangler.toml.
export { CampaignSession } from '../_lib/CampaignSession.js';
