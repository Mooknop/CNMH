// Durable Object: one instance per campaign. Holds the live combat session
// state and fans WebSocket updates out to every connected device. SQLite-backed
// (see wrangler.toml `new_sqlite_classes`) so it stays on the free tier, and it
// uses the WebSocket Hibernation API so an idle table costs nothing and a DO
// eviction does not drop connections.

const STATE_KEY = 'sessionState';

// Wire-message guards (#1309). `key` is the bare cnmh <type> token (clients
// compose the full cnmh_<type>_<id> string locally), so it must be one short
// lowercase token — the same constraint the sync-key registry enforces
// (foundry-bridge/syncKeys.js). `characterId` is a character id or 'global'.
// Malformed or oversized frames are dropped BEFORE touching storage, so one
// misbehaving peer can't poison the shared state every client hydrates from.
export const KEY_TOKEN = /^[a-z0-9]{1,32}$/;
export const CHARACTER_ID = /^\S{1,64}$/;
// Object keys that would write through to Object.prototype instead of the
// state map (prototype pollution) — never valid ids.
const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype']);
// Generous ceiling: the largest legitimate payloads (encounter order with
// bestiary blocks, moveopts grids) are a few KB. The whole session state
// persists as ONE storage value, so unbounded frames could brick it.
export const MAX_MESSAGE_CHARS = 64 * 1024;

export class CampaignSession {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    // Internal reset — only invoked by Worker's /api/gm/_test/reset handler.
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/_internal/reset') {
      if (!url.searchParams.has('keep_session')) {
        await this.state.storage.delete(STATE_KEY);
        const empty = JSON.stringify({ type: 'FULL_STATE', payload: {} });
        for (const peer of this.state.getWebSockets()) {
          try { peer.send(empty); } catch { /* peer gone */ }
        }
      }
      return Response.json({ ok: true });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Tag the socket as the Foundry bridge or a player/GM app, derived from the
    // request path the Worker forwarded (/bridge/… vs /session/…). Stash it via
    // serializeAttachment so the kind survives DO hibernation and is readable in
    // the message/close handlers below.
    const kind = url.pathname.startsWith('/bridge/') ? 'bridge' : 'app';
    server.serializeAttachment({ kind });

    // Hibernatable accept — handlers below are invoked by the runtime.
    this.state.acceptWebSocket(server);

    const sessionState = (await this.state.storage.get(STATE_KEY)) || {};
    server.send(JSON.stringify({ type: 'FULL_STATE', payload: sessionState }));

    if (kind === 'bridge') {
      // A bridge just arrived — tell every app peer Foundry is live.
      this.broadcastPresence(true);
    } else {
      // Fresh app load: seed it with current Foundry presence so it knows
      // immediately, even mid-session after a reload.
      server.send(JSON.stringify({ type: 'PRESENCE', foundry: this.anyBridgeConnected() }));
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // True if any currently-connected socket is a Foundry bridge. `exclude` skips
  // a socket that is in the middle of closing (still present in getWebSockets()).
  anyBridgeConnected(exclude) {
    // E2E/staging run the full stack with no real Foundry bridge. Report it
    // present so the offline write-gate (#553) doesn't freeze the test suite —
    // production (ENVIRONMENT unset) always reflects real bridge presence.
    if (this.env?.ENVIRONMENT === 'e2e' || this.env?.ENVIRONMENT === 'staging') return true;
    for (const peer of this.state.getWebSockets()) {
      if (peer === exclude) continue;
      let attachment;
      try {
        attachment = peer.deserializeAttachment();
      } catch {
        attachment = null;
      }
      if (attachment?.kind === 'bridge') return true;
    }
    return false;
  }

  // Fan a PRESENCE signal out to app peers only — bridge sockets don't care
  // about their own presence.
  broadcastPresence(foundry) {
    const msg = JSON.stringify({ type: 'PRESENCE', foundry });
    for (const peer of this.state.getWebSockets()) {
      let attachment;
      try {
        attachment = peer.deserializeAttachment();
      } catch {
        attachment = null;
      }
      if (attachment?.kind === 'bridge') continue;
      try {
        peer.send(msg);
      } catch {
        /* peer is gone; runtime will clean it up */
      }
    }
  }

  async webSocketMessage(ws, raw) {
    // Binary frames are never part of the protocol; oversized ones get dropped
    // before the JSON parse even looks at them.
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_CHARS) {
      console.warn('CampaignSession: dropped non-string or oversized frame');
      return;
    }
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type !== 'UPDATE') return;

    const { characterId, key, value } = msg;
    if (
      typeof characterId !== 'string' || !CHARACTER_ID.test(characterId) || FORBIDDEN_IDS.has(characterId) ||
      typeof key !== 'string' || !KEY_TOKEN.test(key) || FORBIDDEN_IDS.has(key)
    ) {
      console.warn(`CampaignSession: dropped invalid UPDATE key (${String(characterId)}/${String(key)})`);
      return;
    }

    const sessionState = (await this.state.storage.get(STATE_KEY)) || {};
    if (!sessionState[characterId]) sessionState[characterId] = {};
    sessionState[characterId][key] = value;
    await this.state.storage.put(STATE_KEY, sessionState);

    const broadcast = JSON.stringify({ type: 'UPDATE', characterId, key, value });
    for (const peer of this.state.getWebSockets()) {
      if (peer === ws) continue;
      try {
        peer.send(broadcast);
      } catch {
        /* peer is gone; runtime will clean it up */
      }
    }
  }

  async webSocketClose(ws) {
    this.handleDisconnect(ws);
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws) {
    this.handleDisconnect(ws);
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }

  // When a bridge socket drops, re-derive Foundry presence (another bridge tab
  // may still be connected) and notify app peers. The closing socket may still
  // appear in getWebSockets(), so exclude it from the recount.
  handleDisconnect(ws) {
    let attachment;
    try {
      attachment = ws.deserializeAttachment();
    } catch {
      attachment = null;
    }
    if (attachment?.kind !== 'bridge') return;
    this.broadcastPresence(this.anyBridgeConnected(ws));
  }
}
