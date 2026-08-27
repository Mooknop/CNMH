// bridge.test.js — verifies pushRoster() emits speed for each PC actor.
//
// bridge.js registers Foundry hooks at module-evaluation time, so standard
// static imports can't re-run it per test. Instead each test uses
// jest.isolateModules + require() to get a fresh module evaluation against
// the current global.Hooks / global.game environment. The MockWebSocket from
// foundryMock is replaced with a tracking subclass so we can inspect sent data.

import { makeActor, makeGame, makeWallDocument, installWalls } from './test/foundryMock.js';
import { PROTOCOL_VERSION } from './syncKeys.js';

// --- helpers ---------------------------------------------------------------

const RELAY_SECRET = 'test-relay-secret';

function makePlayerActor(opts = {}) {
  const a = makeActor(opts);
  a.type = 'character';
  a.hasPlayerOwner = true;
  return a;
}

// Returns a WebSocket class whose constructor captures the last instance.
function makeTrackedWebSocketClass() {
  let lastInstance = null;
  class TrackedWS {
    constructor(url) {
      this.url = url;
      this.readyState = 1; // OPEN
      this.sent = [];
      lastInstance = this;
    }
    send(data) { this.sent.push(data); }
    close() { this.readyState = 3; }
  }
  TrackedWS.CONNECTING = 0;
  TrackedWS.OPEN       = 1;
  TrackedWS.CLOSING    = 2;
  TrackedWS.CLOSED     = 3;
  return { TrackedWS, getInstance: () => lastInstance };
}

// Loads bridge.js in module isolation, fires the 'ready' hook (→ connect()),
// then triggers onopen (→ pushRoster()). Returns the parsed UPDATE messages
// that were sent to the mock WebSocket.
function loadAndPushRoster(actors) {
  const { TrackedWS, getInstance } = makeTrackedWebSocketClass();
  global.WebSocket = TrackedWS;
  // connect() refuses to open a socket without a relay secret (it lives in the
  // per-world module setting, never in the repo), so every world here has one.
  global.game = makeGame({ actors, settings: { bridgeSecret: RELAY_SECRET } });

  let wsInstance = null;
  jest.isolateModules(() => {
    require('./bridge.js');         // module-level Hooks.once('ready', ...) runs
    global.Hooks.fire('ready');     // → connect() → new TrackedWS → wsInstance set
    wsInstance = getInstance();
    wsInstance.onopen();            // → pushRoster() → wsInstance.send(JSON)
  });

  return wsInstance.sent.map((s) => JSON.parse(s));
}

// --- tests -----------------------------------------------------------------

beforeEach(() => {
  // Fake timers prevent schedulePing's setInterval from leaking.
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('pushRoster', () => {
  test('includes speed in every roster entry', () => {
    const actors = [
      makePlayerActor({ id: 'actor-a', speed: 35 }),
      makePlayerActor({ id: 'actor-b', speed: 20 }),
    ];

    const msgs = loadAndPushRoster(actors);
    const rosterMsg = msgs.find((m) => m.key === 'roster');

    expect(rosterMsg).toBeDefined();
    expect(rosterMsg.value).toHaveLength(2);
    expect(rosterMsg.value.map((e) => e.speed).sort((a, b) => a - b)).toEqual([20, 35]);
  });

  test('roster entry shape includes actorId, name, and speed', () => {
    const actor = makePlayerActor({ id: 'actor-pellias', name: 'Pellias', speed: 30 });

    const msgs = loadAndPushRoster([actor]);
    const rosterMsg = msgs.find((m) => m.key === 'roster');
    const entry = rosterMsg.value[0];

    expect(entry).toMatchObject({ actorId: 'actor-pellias', name: 'Pellias', speed: 30 });
  });

  test('speed defaults to 25 when actor has no movement data', () => {
    const actor = makePlayerActor({ id: 'actor-nospeed', speed: undefined });
    // Wipe movement path so getSpeed falls back to 25
    delete actor.system.movement;

    const msgs = loadAndPushRoster([actor]);
    const rosterMsg = msgs.find((m) => m.key === 'roster');
    expect(rosterMsg.value[0].speed).toBe(25);
  });

  test('emits as an UPDATE message to the global characterId', () => {
    const actor = makePlayerActor({ id: 'actor-x', speed: 25 });

    const msgs = loadAndPushRoster([actor]);
    const rosterMsg = msgs.find((m) => m.key === 'roster');

    expect(rosterMsg).toMatchObject({ type: 'UPDATE', characterId: 'global', key: 'roster' });
  });
});

describe('relay secret gate', () => {
  // Loads bridge.js against a world whose bridgeSecret setting is `secret`,
  // fires 'ready' (→ connect()), and reports whether a socket was opened.
  function loadAndConnect(secret) {
    const { TrackedWS, getInstance } = makeTrackedWebSocketClass();
    global.WebSocket = TrackedWS;
    global.game = makeGame({ actors: [], settings: { bridgeSecret: secret } });

    jest.isolateModules(() => {
      require('./bridge.js');
      global.Hooks.fire('ready');
    });
    return getInstance();
  }

  test('does not open a socket when the secret is unset', () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(loadAndConnect('')).toBeNull();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('No relay secret configured'));

    err.mockRestore();
  });

  test('carries the configured secret — not a repo constant — in the connect URL', () => {
    const ws = loadAndConnect(RELAY_SECRET);

    expect(ws).not.toBeNull();
    expect(ws.url).toContain(`key=${RELAY_SECRET}`);
  });

  test('trims a pasted secret so stray whitespace does not fail auth', () => {
    const ws = loadAndConnect(`  ${RELAY_SECRET}\n`);

    expect(ws.url).toContain(`key=${RELAY_SECRET}`);
  });
});

describe('pushHello (#1310)', () => {
  test('connect announces protocol + module version on cnmh_bridgehello_global', () => {
    const actor = makePlayerActor({ id: 'actor-x', speed: 25 });

    const msgs = loadAndPushRoster([actor]);
    const hello = msgs.find((m) => m.key === 'bridgehello');

    expect(hello).toMatchObject({ type: 'UPDATE', characterId: 'global', key: 'bridgehello' });
    expect(hello.value.protocol).toBe(PROTOCOL_VERSION);
    expect(hello.value.module).toBe('0.0.0-test'); // makeGame's default module registry
    expect(typeof hello.value.ts).toBe('number');
  });
});

// #1805: `global`-id forms of the door keys route to the scene-scoped handlers.
// Everything else about the door rail is unit-tested in doors.test.js; this is
// the dispatcher half — the piece that decides which handler a `global` id gets.
describe('door relay routing (#1805)', () => {
  // Drives a single inbound UPDATE through the real bridge dispatcher and
  // returns every outbound UPDATE it produced.
  function deliver({ characterId, key, value }) {
    const { TrackedWS, getInstance } = makeTrackedWebSocketClass();
    global.WebSocket = TrackedWS;
    global.game = makeGame({ actors: [], settings: { bridgeSecret: RELAY_SECRET } });

    let ws = null;
    jest.isolateModules(() => {
      require('./bridge.js');
      global.Hooks.fire('ready');
      ws = getInstance();
      ws.onopen();
      ws.sent.length = 0; // drop the connect-time roster/hello burst
      ws.onmessage({ data: JSON.stringify({ type: 'UPDATE', characterId, key, value }) });
    });
    return ws.sent.map((s) => JSON.parse(s));
  }

  test('cnmh_doorreq_global answers with the scene-scoped dooropts_global', () => {
    installWalls([
      makeWallDocument({ id: 'w1', door: 1, ds: 0, c: [400, 500, 500, 500] }),
      makeWallDocument({ id: 'w2', door: 2, ds: 0, c: [800, 500, 900, 500] }),
    ]);

    const opts = deliver({ characterId: 'global', key: 'doorreq', value: { ts: 9 } })
      .find((m) => m.key === 'dooropts');

    expect(opts).toMatchObject({ characterId: 'global', key: 'dooropts' });
    expect(opts.value.sceneId).toBe('scene-1');
    expect(opts.value.reqTs).toBe(9);
    expect(opts.value.doors).toHaveLength(2);
    expect(opts.value.doors[1].secret).toBe(true);
  });

  test('cnmh_doorinteract_global toggles the door', () => {
    const doc = makeWallDocument({ id: 'w1', door: 1, ds: 0, c: [400, 500, 500, 500] });
    installWalls([doc]);

    deliver({ characterId: 'global', key: 'doorinteract', value: { wallId: 'w1', op: 'open', ts: 3 } });

    expect(doc.update).toHaveBeenCalledWith({ ds: 1 }, expect.any(Object));
  });
});
