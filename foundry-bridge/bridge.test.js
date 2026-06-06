// bridge.test.js — verifies pushRoster() emits speed for each PC actor.
//
// bridge.js registers Foundry hooks at module-evaluation time, so standard
// static imports can't re-run it per test. Instead each test uses
// jest.isolateModules + require() to get a fresh module evaluation against
// the current global.Hooks / global.game environment. The MockWebSocket from
// foundryMock is replaced with a tracking subclass so we can inspect sent data.

import { makeActor, makeGame } from './test/foundryMock.js';

// --- helpers ---------------------------------------------------------------

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
    constructor() {
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
  global.game = makeGame({ actors });

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
