// Foundry VTT global mock + document factories for bridge unit tests.
//
// The bridge touches a handful of Foundry/PF2e globals — game, canvas, Hooks,
// CONFIG, WebSocket — exclusively through pf2eAdapter.js. This module reproduces
// just enough of those globals (and fake Actor/Token/Combat/Combatant/condition
// Item documents) to exercise the adapter and feature modules in plain Node.
//
// installFoundryGlobals() wires the globals; test/setup.js calls it before every
// test. Tests then mutate global.game / global.canvas (or pass overrides) to set
// up the world they need.

// --- Hooks ---------------------------------------------------------------

// Records every registered handler and lets tests fire them synchronously.
// `on` and `once` behave identically here (tests fire explicitly).
export function makeHooks() {
  const handlers = {};
  const register = (name, fn) => { (handlers[name] ||= []).push(fn); return fn; };
  return {
    _handlers: handlers,
    on:   register,
    once: register,
    off:  () => {},
    callAll: (name, ...args) => (handlers[name] || []).forEach((fn) => fn(...args)),
    call:    (name, ...args) => (handlers[name] || []).forEach((fn) => fn(...args)),
    // Test helper: fire all handlers registered for a hook.
    fire:    (name, ...args) => (handlers[name] || []).map((fn) => fn(...args)),
  };
}

// --- Collections (game.actors / game.combats) ----------------------------

// A Foundry collection is a Map keyed by document id, with a few array-ish extras.
function makeCollection(docs = []) {
  const map = new Map(docs.map((d) => [d.id, d]));
  map.contents = docs;
  return map;
}

// --- Document factories ---------------------------------------------------

let _autoId = 0;
const autoId = (prefix) => `${prefix}${++_autoId}`;

// PF2e character/NPC actor. Pass plain values; this assembles the system.* paths
// the adapter reads. `tokens` are returned by getActiveTokens().
export function makeActor(opts = {}) {
  const {
    id = autoId('actor'),
    name = 'Test Actor',
    hp = {},
    heroPoints = 0,
    focus = {},
    speed = 25,
    conditions = [],
    tokens = [],
    // Bestiary / NPC fields
    img = null,
    level = null,
    rarity = 'common',
    traits = [],
    size = null,
    perception = null,
    publicNotes = '',
    compendiumSource = null,
    sourceId = null,
  } = opts;

  const conditionItems = conditions.map((c) =>
    makeConditionItem({ slug: c.slug, value: c.value }));

  const actor = {
    id,
    name,
    img,
    documentName: 'Actor',
    ...(compendiumSource !== null ? { _stats: { compendiumSource } } : {}),
    ...(sourceId !== null ? { flags: { core: { sourceId } } } : {}),
    system: {
      attributes: {
        hp: { value: hp.value ?? 0, max: hp.max ?? 0, temp: hp.temp ?? 0 },
        dying:   { value: hp.dying   ?? 0 },
        wounded: { value: hp.wounded ?? 0 },
        doomed:  { value: hp.doomed  ?? 0 },
        ...(perception !== null ? { perception: { value: perception } } : {}),
      },
      resources: {
        heroPoints: { value: heroPoints },
        focus:      { value: focus.value ?? 0, max: focus.max ?? 0 },
      },
      movement: { speeds: { land: { value: speed, total: speed } } },
      details: {
        level: { value: level },
        publicNotes,
      },
      traits: {
        rarity,
        value: traits,
        ...(size !== null ? { size: { value: size } } : {}),
      },
      ...(perception !== null ? { perception: { mod: perception } } : {}),
    },
    itemTypes: { condition: conditionItems },
    getActiveTokens: () => tokens,
    update: jest.fn().mockResolvedValue(undefined),
    createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
  };

  // Back-link condition items to their parent actor.
  conditionItems.forEach((c) => { c.parent = actor; });
  tokens.forEach((t) => { if (!t.actor) t.actor = actor; });
  return actor;
}

// A PF2e condition is a condition-type embedded Item. `slug` is a derived getter
// on the live document; we expose it directly here.
export function makeConditionItem(opts = {}) {
  const { slug = 'off-guard', value = 1, parent = null } = opts;
  return {
    id: autoId('item'),
    type: 'condition',
    slug,
    system: { slug, value: { value } },
    parent,
  };
}

// A placed token. `document` carries width/height + update (the move write path).
export function makeToken(opts = {}) {
  const {
    id = autoId('token'),
    x = 0, y = 0, width = 1, height = 1,
    actor = null,
    // Foundry CONST.TOKEN_DISPOSITIONS: FRIENDLY = 1, NEUTRAL = 0, HOSTILE = -1.
    disposition = 0,
    // isFlanking: PF2e TokenPF2e method. Pass a boolean to set a fixed return
    // value, or a function to control per-call. Defaults to false (not flanking).
    isFlanking = false,
  } = opts;
  return {
    id,
    x, y,
    actor,
    isFlanking: jest.fn().mockImplementation(
      typeof isFlanking === 'function' ? isFlanking : () => isFlanking
    ),
    document: {
      width, height, disposition,
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
}

export function makeCombatant(opts = {}) {
  const {
    id = autoId('combatant'),
    name = 'Combatant',
    actorId = null,
    tokenId = null,
    initiative = null,
    actor = null,
    token = null,
    combat = null,
  } = opts;
  return { id, name, actorId, tokenId, initiative, actor, token, combat };
}

export function makeCombat(opts = {}) {
  const {
    id = autoId('combat'),
    active = true,
    started = true,
    round = 1,
    turn = 0,
    combatants = [],
    // index into combatants for the active turn; -1 → no active combatant
    activeTurnIndex = turn,
  } = opts;

  const combat = {
    id,
    active,
    started,
    round,
    turn,
    combatants,
    combatant: activeTurnIndex >= 0 ? combatants[activeTurnIndex] ?? null : null,
    nextTurn: jest.fn().mockResolvedValue(undefined),
  };
  combatants.forEach((c) => { if (!c.combat) c.combat = combat; });
  return combat;
}

// --- Canvas ---------------------------------------------------------------

// measurePath default: PF2e-agnostic chebyshev distance in feet (5ft/square).
// Override per-test via opts.measurePath to model difficult terrain / diagonals.
function defaultMeasurePath(gridSize) {
  return (waypoints) => {
    let distance = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const dc = Math.abs(waypoints[i].x - waypoints[i - 1].x) / gridSize;
      const dr = Math.abs(waypoints[i].y - waypoints[i - 1].y) / gridSize;
      distance += Math.max(Math.round(dc), Math.round(dr)) * 5;
    }
    return { distance };
  };
}

export function makeCanvas(opts = {}) {
  const gridSize = opts.gridSize ?? 100;
  const measurePath = opts.measurePath ?? defaultMeasurePath(gridSize);
  // `get` reads tokens.placeables live so tests can reassign it after install.
  const tokens = { placeables: opts.placeables ?? [] };
  tokens.get = (id) => (tokens.placeables || []).find((t) => t.id === id) ?? null;
  return {
    scene: { grid: { size: gridSize } },
    grid: { size: gridSize, measurePath },
    tokens,
    walls: {},
  };
}

export function makeConfig(opts = {}) {
  // testCollision returns true when a wall blocks the segment. Default: never.
  const testCollision = opts.testCollision ?? (() => false);
  return {
    Canvas: { polygonBackends: { move: { testCollision } } },
  };
}

// --- game -----------------------------------------------------------------

export function makeGame(opts = {}) {
  return {
    release: { generation: opts.generation ?? 13 },
    combat: opts.combat ?? null,
    combats: makeCollection(opts.combats ?? []),
    actors: makeCollection(opts.actors ?? []),
    user: opts.user ?? { id: 'user1', targets: new Set(), updateTokenTargets: jest.fn() },
    settings: {
      register: jest.fn(),
      get: jest.fn((_mod, key) => (opts.settings ?? {})[key]),
    },
  };
}

// --- WebSocket ------------------------------------------------------------

export function makeWebSocketClass() {
  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.OPEN;
      this.sent = [];
    }
    send(data) { this.sent.push(data); }
    close() { this.readyState = MockWebSocket.CLOSED; }
  }
  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSING = 2;
  MockWebSocket.CLOSED = 3;
  return MockWebSocket;
}

// --- fixture hydration ----------------------------------------------------
//
// Captured fixtures (__fixtures__/<version>/) store actor/combat JSON close to
// Foundry's serialized form: system.* paths verbatim plus an items[] array. A few
// properties the adapter reads are *derived* getters on the live document
// (itemTypes.condition, condition.slug, combat.combatant). These hydrate helpers
// reconstruct exactly those derivations so the raw system.* paths remain the real
// version tripwire. If v14 changes a derivation, update the helper here alongside
// the adapter.

export function hydrateActorFixture(json) {
  const conditionItems = (json.items ?? [])
    .filter((i) => i.type === 'condition')
    .map((i) => ({ ...i, slug: i.system?.slug }));
  return {
    ...json,
    documentName: 'Actor',
    itemTypes: { condition: conditionItems },
    getActiveTokens: () => json._tokens ?? [],
    update: jest.fn().mockResolvedValue(undefined),
  };
}

export function hydrateCombatFixture(json) {
  const combatants = json.combatants ?? [];
  return {
    ...json,
    combatants,
    combatant: combatants[json.turn] ?? null,
    nextTurn: jest.fn().mockResolvedValue(undefined),
  };
}

// --- install / reset ------------------------------------------------------

export function installFoundryGlobals(overrides = {}) {
  global.Hooks    = overrides.Hooks  ?? makeHooks();
  global.game     = overrides.game   ?? makeGame(overrides.gameOpts);
  global.canvas   = overrides.canvas ?? makeCanvas(overrides.canvasOpts);
  global.CONFIG   = overrides.CONFIG ?? makeConfig(overrides.configOpts);
  global.WebSocket = overrides.WebSocket ?? makeWebSocketClass();
  // fromUuid: Foundry async UUID resolver. Tests override per-scenario;
  // the default returns null so unrelated tests are unaffected.
  global.fromUuid = overrides.fromUuid ?? jest.fn().mockResolvedValue(null);
  return {
    Hooks: global.Hooks,
    game: global.game,
    canvas: global.canvas,
    CONFIG: global.CONFIG,
    WebSocket: global.WebSocket,
  };
}

export function clearFoundryGlobals() {
  delete global.Hooks;
  delete global.game;
  delete global.canvas;
  delete global.CONFIG;
  delete global.WebSocket;
  delete global.fromUuid;
}
