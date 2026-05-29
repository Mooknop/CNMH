// One-time campaign config. Fill ACTOR_MAP and TOKEN_MAP from each PC's actor/token
// UUID: right-click token in Foundry → Copy UUID.
// WORKER_WSS_URL: point at your deployed staging Worker, e.g.
//   wss://cnmh-staging.<account>.workers.dev  (Forge can't reach wrangler dev)
// BRIDGE_SECRET: must match the value of the BRIDGE_SECRET Worker secret
//   (set via `wrangler secret put BRIDGE_SECRET`).

export const WORKER_WSS_URL = 'wss://cnmh.mooknop.workers.dev';
export const CAMPAIGN_ID    = 'osprey-covey';
export const BRIDGE_SECRET  = 'Sanctuary';

// Maps CNMH characterId strings → Foundry actor UUIDs.
// Populate from: right-click actor in sidebar → Copy UUID.
export const ACTOR_MAP = {
   'Pellias':   'Actor.MVvMwyyIRSnYQDwm',
   'IzzyUncut': 'Actor.da4IMLKRHAEf18UN',
   'Ashka':     'Actor.tQfz3a1dP90dHu8j',
   'Jade':      'Actor.fg1AlJa1nK9l8gof',
   'Blu-Kakke': 'Actor.YPX0QEfSeUcmGMEg',
};

// Maps CNMH characterId strings → the specific Foundry token ID for that PC.
// Use the PC's own token, not an animal companion's, to avoid ambiguity.
// Populate from: canvas → right-click token → Copy UUID (gives Token.xxx inside
// the scene; or read token.id from the console: canvas.tokens.controlled[0].id).
export const TOKEN_MAP = {
   'Pellias':   'Token.wSiRnAbmEcuXRi6q',
   'Jade': 'Token.iXOgYlshwDcczuPs',
   'Ashka':     'Token.qBqVZeO9JhPsvzek',
};

// Reverse lookup: Foundry actor UUID → CNMH characterId.
export const ACTOR_MAP_REVERSE = Object.fromEntries(
  Object.entries(ACTOR_MAP).map(([charId, actorId]) => [actorId, charId])
);
