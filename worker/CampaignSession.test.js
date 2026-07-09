import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { CampaignSession, MAX_MESSAGE_CHARS } from './CampaignSession.js';

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

// #1309: the core relay path — persist + fanout + validation.
describe('CampaignSession webSocketMessage', () => {
  const update = (characterId, key, value) =>
    JSON.stringify({ type: 'UPDATE', characterId, key, value });
  const updates = (socket) => socket.sent.filter((m) => m.type === 'UPDATE');

  async function threePeers() {
    const state = makeState();
    const session = new CampaignSession(state, {});
    const sender = await connect(session, state, '/session/camp');
    const other = await connect(session, state, '/session/camp');
    const bridge = await connect(session, state, '/bridge/camp');
    [sender, other, bridge].forEach((s) => { s.sent.length = 0; });
    return { state, session, sender, other, bridge };
  }

  test('a valid UPDATE persists and fans out to every peer except the sender', async () => {
    const { state, session, sender, other, bridge } = await threePeers();

    await session.webSocketMessage(sender, update('pc-1', 'hp', { current: 12, max: 30 }));

    const stored = await state.storage.get('sessionState');
    expect(stored['pc-1'].hp).toEqual({ current: 12, max: 30 });
    const expected = { type: 'UPDATE', characterId: 'pc-1', key: 'hp', value: { current: 12, max: 30 } };
    expect(updates(other)).toEqual([expected]);
    expect(updates(bridge)).toEqual([expected]);
    expect(updates(sender)).toEqual([]);
  });

  test('later UPDATEs merge into existing state; a new connect hydrates from it', async () => {
    const { state, session, sender } = await threePeers();
    await session.webSocketMessage(sender, update('pc-1', 'hp', { current: 12 }));
    await session.webSocketMessage(sender, update('pc-1', 'gold', 42));
    await session.webSocketMessage(sender, update('global', 'playmode', 'downtime'));

    const late = await connect(session, state, '/session/camp');

    const full = late.sent.find((m) => m.type === 'FULL_STATE');
    expect(full.payload).toEqual({
      'pc-1': { hp: { current: 12 }, gold: 42 },
      global: { playmode: 'downtime' },
    });
  });

  test('null values ride through (channels use null as reset)', async () => {
    const { state, session, sender, other } = await threePeers();
    await session.webSocketMessage(sender, update('pc-1', 'moveopts', null));
    expect((await state.storage.get('sessionState'))['pc-1'].moveopts).toBeNull();
    expect(updates(other)[0].value).toBeNull();
  });

  const rejects = async (raw) => {
    const { state, session, sender, other } = await threePeers();
    await session.webSocketMessage(sender, raw);
    expect(await state.storage.get('sessionState')).toBeUndefined();
    expect(updates(other)).toEqual([]);
  };

  test('malformed JSON is dropped without throwing', async () => {
    await rejects('{not json');
  });

  test('non-UPDATE message types are ignored', async () => {
    await rejects(JSON.stringify({ type: 'GM_BATCH', characterId: 'pc-1', key: 'hp', value: 1 }));
  });

  test('missing characterId or key is dropped', async () => {
    await rejects(JSON.stringify({ type: 'UPDATE', key: 'hp', value: 1 }));
    await rejects(JSON.stringify({ type: 'UPDATE', characterId: 'pc-1', value: 1 }));
  });

  test('a key that is not a bare lowercase token is dropped (registry constraint)', async () => {
    await rejects(update('pc-1', 'cnmh_hp_pc-1', 1)); // full key instead of bare type
    await rejects(update('pc-1', 'HP', 1));
    await rejects(update('pc-1', 'h p', 1));
    await rejects(update('pc-1', 'x'.repeat(33), 1));
  });

  test('non-string ids and whitespace/oversized characterIds are dropped', async () => {
    await rejects(update({ evil: true }, 'hp', 1));
    await rejects(update('pc 1', 'hp', 1));
    await rejects(update('x'.repeat(65), 'hp', 1));
  });

  test('__proto__ ids are dropped and Object.prototype stays clean', async () => {
    await rejects(update('__proto__', 'hp', { polluted: true }));
    expect({}.hp).toBeUndefined();
    await rejects(update('constructor', 'hp', 1));
  });

  test('oversized frames are dropped before parsing', async () => {
    const big = update('pc-1', 'hp', 'x'.repeat(MAX_MESSAGE_CHARS));
    await rejects(big);
  });

  test('binary (non-string) frames are dropped gracefully', async () => {
    await rejects(new ArrayBuffer(8));
  });

  test('a frame at a realistic payload size passes', async () => {
    const { state, session, sender } = await threePeers();
    const reachable = Array.from({ length: 200 }, (_, i) => ({ col: i, row: i, feet: 5, terrain: 'normal' }));
    await session.webSocketMessage(sender, update('pc-1', 'moveopts', { reachable }));
    expect((await state.storage.get('sessionState'))['pc-1'].moveopts.reachable).toHaveLength(200);
  });
});
