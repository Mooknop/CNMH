import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { CampaignSession } from './CampaignSession.js';

// The DO is a plain class; we drive it with a mock `state` that stands in for
// the hibernation runtime. Each fake socket carries its own attachment (the
// bridge/app tag) so anyBridgeConnected/broadcastPresence behave as in prod.

function makeSocket() {
  return {
    _attachment: null,
    sent: [],
    serializeAttachment(v) { this._attachment = v; },
    deserializeAttachment() { return this._attachment; },
    send(data) { this.sent.push(JSON.parse(data)); },
    close() {},
  };
}

function makeState() {
  const sockets = [];
  return {
    sockets,
    storage: {
      _data: new Map(),
      async get(k) { return this._data.get(k); },
      async put(k, v) { this._data.set(k, v); },
      async delete(k) { this._data.delete(k); },
    },
    acceptWebSocket(ws) { sockets.push(ws); },
    getWebSockets() { return sockets; },
  };
}

function makeReq(path) {
  return {
    method: 'GET',
    url: `https://example.test${path}`,
    headers: { get: (h) => (h === 'Upgrade' ? 'websocket' : null) },
  };
}

// Connect a peer through the real fetch path and return the accepted server
// socket (the last one acceptWebSocket pushed).
async function connect(session, state, path) {
  await session.fetch(makeReq(path));
  return state.sockets[state.sockets.length - 1];
}

const presenceMsgs = (socket) => socket.sent.filter((m) => m.type === 'PRESENCE');
const lastPresence = (socket) => presenceMsgs(socket).at(-1);

let savedWebSocketPair;
let savedResponse;

beforeEach(() => {
  savedWebSocketPair = globalThis.WebSocketPair;
  savedResponse = globalThis.Response;
  // WebSocketPair returns [client, server]; the DO accepts index 1.
  globalThis.WebSocketPair = function WebSocketPairMock() {
    return { 0: makeSocket(), 1: makeSocket() };
  };
  // happy-dom's Response rejects status 101, so stub a minimal record.
  globalThis.Response = class ResponseMock {
    constructor(body, init) { this.body = body; this.init = init; }
    static json() { return new ResponseMock(); }
  };
});

afterEach(() => {
  globalThis.WebSocketPair = savedWebSocketPair;
  globalThis.Response = savedResponse;
});

describe('CampaignSession presence', () => {
  test('app handshake reports foundry:false when no bridge is connected', async () => {
    const state = makeState();
    const session = new CampaignSession(state, {});

    const app = await connect(session, state, '/session/camp');

    expect(lastPresence(app)).toEqual({ type: 'PRESENCE', foundry: false });
  });

  test('bridge connect broadcasts PRESENCE true to app peers only', async () => {
    const state = makeState();
    const session = new CampaignSession(state, {});

    const app1 = await connect(session, state, '/session/camp');
    const app2 = await connect(session, state, '/session/camp');
    app1.sent.length = 0;
    app2.sent.length = 0;

    const bridge = await connect(session, state, '/bridge/camp');

    expect(lastPresence(app1)).toEqual({ type: 'PRESENCE', foundry: true });
    expect(lastPresence(app2)).toEqual({ type: 'PRESENCE', foundry: true });
    // The bridge never receives its own presence signal.
    expect(presenceMsgs(bridge)).toHaveLength(0);
  });

  test('app reloading mid-session gets foundry:true in its handshake', async () => {
    const state = makeState();
    const session = new CampaignSession(state, {});

    await connect(session, state, '/bridge/camp');
    const reloadedApp = await connect(session, state, '/session/camp');

    expect(lastPresence(reloadedApp)).toEqual({ type: 'PRESENCE', foundry: true });
  });

  test('bridge disconnect broadcasts PRESENCE false to app peers', async () => {
    const state = makeState();
    const session = new CampaignSession(state, {});

    const app = await connect(session, state, '/session/camp');
    const bridge = await connect(session, state, '/bridge/camp');
    app.sent.length = 0;

    await session.webSocketClose(bridge);

    expect(lastPresence(app)).toEqual({ type: 'PRESENCE', foundry: false });
  });

  test('presence stays true while a second bridge remains connected', async () => {
    const state = makeState();
    const session = new CampaignSession(state, {});

    const app = await connect(session, state, '/session/camp');
    const bridgeA = await connect(session, state, '/bridge/camp');
    await connect(session, state, '/bridge/camp'); // bridgeB stays connected
    app.sent.length = 0;

    await session.webSocketClose(bridgeA);

    expect(lastPresence(app)).toEqual({ type: 'PRESENCE', foundry: true });
  });

  test('app disconnect does not emit any presence broadcast', async () => {
    const state = makeState();
    const session = new CampaignSession(state, {});

    const app1 = await connect(session, state, '/session/camp');
    const app2 = await connect(session, state, '/session/camp');
    app1.sent.length = 0;
    app2.sent.length = 0;

    await session.webSocketClose(app1);

    expect(presenceMsgs(app2)).toHaveLength(0);
  });

  test('reports Foundry present in e2e env even with no bridge (gate stays open)', async () => {
    const state = makeState();
    const session = new CampaignSession(state, { ENVIRONMENT: 'e2e' });

    const app = await connect(session, state, '/session/camp');

    expect(lastPresence(app)).toEqual({ type: 'PRESENCE', foundry: true });
  });

  test('webSocketError on a bridge also re-broadcasts presence', async () => {
    const state = makeState();
    const session = new CampaignSession(state, {});

    const app = await connect(session, state, '/session/camp');
    const bridge = await connect(session, state, '/bridge/camp');
    app.sent.length = 0;

    await session.webSocketError(bridge);

    expect(lastPresence(app)).toEqual({ type: 'PRESENCE', foundry: false });
  });
});
