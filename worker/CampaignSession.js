// Durable Object: one instance per campaign. Holds the live combat session
// state and fans WebSocket updates out to every connected device. SQLite-backed
// (see wrangler.toml `new_sqlite_classes`) so it stays on the free tier, and it
// uses the WebSocket Hibernation API so an idle table costs nothing and a DO
// eviction does not drop connections.

const STATE_KEY = 'sessionState';

export class CampaignSession {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Hibernatable accept — handlers below are invoked by the runtime.
    this.state.acceptWebSocket(server);

    const sessionState = (await this.state.storage.get(STATE_KEY)) || {};
    server.send(JSON.stringify({ type: 'FULL_STATE', payload: sessionState }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type !== 'UPDATE') return;

    const { characterId, key, value } = msg;
    if (!characterId || !key) return;

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
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws) {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }
}
