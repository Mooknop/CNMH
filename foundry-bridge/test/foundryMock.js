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
    effects = [],
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
    folderName = null,
    // Ownership / type fields (#362 minion linking).
    type = null,
    hasPlayerOwner = false,
    ownership = null,
    prototypeToken = null,
    // PF2e save statistics (#1275) — pass e.g. { reflex: { roll: jest.fn() } }.
    saves = null,
    // Offensive kit (#1531) — NPC strikes (system.actions), spellcasting
    // entries (actor.spellcasting), ability items (itemTypes.action), and
    // listed skills (system.skills). Build via makeNpcStrike /
    // makeSpellcastingEntry / makeAbilityItem.
    strikes = null,
    spellcasting = null,
    abilities = [],
    skills = null,
  } = opts;

  const conditionItems = conditions.map((c) =>
    makeConditionItem({ slug: c.slug, value: c.value }));

  const effectItems = effects.map((e) =>
    makeEffectItem({ slug: e.slug, name: e.name, img: e.img, isExpired: e.isExpired, disabled: e.disabled }));

  const abilityItems = abilities.map((a) => (a?.type === 'action' ? a : makeAbilityItem(a)));

  const actor = {
    id,
    name,
    img,
    documentName: 'Actor',
    ...(type !== null ? { type } : {}),
    hasPlayerOwner,
    ...(ownership !== null ? { ownership } : {}),
    ...(prototypeToken !== null
      ? { prototypeToken: { toObject: () => ({ ...prototypeToken }) } }
      : {}),
    ...(folderName !== null ? { folder: { name: folderName } } : {}),
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
      ...(strikes !== null ? { actions: strikes } : {}),
      ...(skills !== null ? { skills } : {}),
    },
    itemTypes: { condition: conditionItems, effect: effectItems, action: abilityItems },
    ...(spellcasting !== null ? { spellcasting: { contents: spellcasting } } : {}),
    ...(saves !== null ? { saves } : {}),
    getActiveTokens: () => tokens,
    update: jest.fn().mockResolvedValue(undefined),
    createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    applyDamage: jest.fn().mockResolvedValue(undefined),
  };

  // Back-link condition + effect + ability items to their parent actor.
  conditionItems.forEach((c) => { c.parent = actor; });
  effectItems.forEach((e) => { e.parent = actor; });
  abilityItems.forEach((a) => { a.parent = actor; });
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

// A PF2e effect is an effect-type embedded Item. `slug` is a derived getter on the
// live document; `isExpired`/`system.disabled` gate whether getEffects includes it.
export function makeEffectItem(opts = {}) {
  const {
    slug = 'spell-effect-courageous-anthem',
    name = 'Spell Effect: Courageous Anthem',
    img = null,
    isExpired = false,
    disabled = false,
    parent = null,
  } = opts;
  return {
    id: autoId('item'),
    type: 'effect',
    slug,
    name,
    img,
    isExpired,
    system: { slug, disabled },
    parent,
  };
}

// An NPC strike as PF2e synthesizes it onto actor.system.actions (#1531): label,
// total modifier, MAP variant labels, trait labels, and the source melee item
// carrying damage rolls / attack effects.
export function makeNpcStrike(opts = {}) {
  const {
    slug = 'jaws',
    label = 'Jaws',
    totalModifier = 9,
    variantLabels = ['+9', '+4', '-1'],
    traits = ['reach-10'],
    ranged = false,
    damageRolls = { r1: { damage: '1d8+4', damageType: 'piercing' } },
    attackEffects = [],
  } = opts;
  return {
    slug,
    label,
    totalModifier,
    variants: variantLabels.map((l) => ({ label: l })),
    traits: traits.map((t) => ({ label: t })),
    item: {
      name: label,
      isRanged: ranged,
      isMelee: !ranged,
      system: {
        damageRolls,
        attackEffects: { value: attackEffects },
        traits: { value: traits },
      },
    },
  };
}

// A spell item as read off a spellcasting entry's spells collection (#1531).
export function makeSpellItem(opts = {}) {
  const {
    id = autoId('spell'),
    name = 'Test Spell',
    rank = 1,
    isCantrip = false,
    time = '2',
    uses = null,           // { value, max } for innate-style per-spell uses
    save = null,           // { statistic, basic }
    traits = [],
    description = '',
  } = opts;
  return {
    id,
    name,
    rank,
    isCantrip,
    system: {
      time: { value: time },
      traits: { value: traits },
      description: { value: description },
      ...(uses ? { location: { uses } } : {}),
      ...(save ? { defense: { save } } : {}),
    },
  };
}

// A PF2e spellcasting entry (#1531): tradition/castingType/DC/attack under
// system.*, per-rank slots (slot0 = cantrips), and a spells collection.
export function makeSpellcastingEntry(opts = {}) {
  const {
    id = autoId('scentry'),
    name = 'Arcane Spells',
    tradition = 'arcane',
    castingType = 'innate',   // 'innate' | 'prepared' | 'spontaneous' | 'focus'
    dc = 19,
    attack = 11,
    slots = {},               // { slot1: { value: 2, max: 2, prepared? } }
    spells = [],
  } = opts;
  return {
    id,
    name,
    system: {
      tradition: { value: tradition },
      prepared: { value: castingType },
      spelldc: { dc, value: attack },
      slots,
    },
    spells: { contents: spells },
    // SpellcastingEntryPF2e#cast — posts the card + consumes the slot/use (#1531 S4).
    cast: jest.fn().mockResolvedValue(undefined),
  };
}

// An NPC ability item (the stat block's Actions/Reactions/Passives) as a
// action-type embedded Item (#1531).
export function makeAbilityItem(opts = {}) {
  const {
    id = autoId('ability'),
    name = 'Test Ability',
    actionType = 'action',    // 'action' | 'reaction' | 'free' | 'passive'
    actions = 2,
    category = 'offensive',
    traits = [],
    description = '',
    parent = null,
  } = opts;
  return {
    id,
    type: 'action',
    name,
    system: {
      actionType: { value: actionType },
      actions: { value: actions },
      category,
      traits: { value: traits },
      description: { value: description },
    },
    parent,
  };
}

// A placed token. `document` carries width/height + update (the move write path).
export function makeToken(opts = {}) {
  const {
    id = autoId('token'),
    x = 0, y = 0, width = 1, height = 1,
    actor = null,
    // Foundry CONST.TOKEN_DISPOSITIONS: FRIENDLY = 1, NEUTRAL = 0, HOSTILE = -1,
    // SECRET = -2.
    disposition = 0,
    // The GM's eye toggle (TokenDocument#hidden) — the pathpreview filter and
    // the snapshot capture both read it (#1744 WS-1).
    hidden = false,
    // TokenDocument#name, carried on the pathpreview payload as ghost identity.
    name = null,
    // The Scene the token is embedded in (TokenDocument#parent). Omit for a
    // token on whatever scene the canvas is showing.
    scene = null,
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
      width, height, disposition, hidden,
      ...(name !== null ? { name } : {}),
      ...(scene !== null ? { parent: scene } : {}),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
}

// A Scene document, for the cross-scene grid cases (#1744 WS-1): a token's own
// scene owns its grid, which is NOT necessarily the active canvas's.
export function makeScene(opts = {}) {
  const { id = autoId('scene'), gridSize = 100, gridDistance = 5 } = opts;
  return { id, grid: { size: gridSize, distance: gridDistance } };
}

// --- v14 Scene Regions (#1733 aura emanations) -------------------------------

// A RegionDocument. `tokens` is core's own ReadonlySet<TokenDocument> of who is
// currently inside (the authoritative membership read); `flags` carries the
// bridge's `cnmh-bridge.auraCharId` stamp on rings the bridge created.
export function makeRegion(opts = {}) {
  const {
    id = autoId('region'), name = 'Region', flags = {}, visibility = 2,
    color = '', attachedToken = null, tokens = [],
  } = opts;
  return {
    id, name, flags, visibility, color, attachedToken,
    tokens: new Set(tokens.map(asTokenDocument)),
  };
}

// A placed Token or a TokenDocument → the document, with `id` back-filled.
// makeToken's document omits it (the placeable carries it) while a REAL
// TokenDocument always has one, and region membership hands out documents.
function asTokenDocument(token) {
  const doc = token?.document ?? token ?? null;
  if (doc && doc.id == null && token?.id != null) doc.id = token.id;
  return doc;
}

// A Region embedded collection whose `contents` tracks deletions (the real
// collection's does; makeCollection's static array would not).
function makeRegionCollection(docs = []) {
  const map = new Map(docs.map((d) => [d.id, d]));
  Object.defineProperty(map, 'contents', { get: () => [...map.values()] });
  return map;
}

// Equip the world with v14's token-emanation surface (#1733): the generation
// gate, `foundry.documents.RegionDocument.createTokenEmanation`, a live Region
// collection on the scene, and a delete seam. Every created Region is stamped
// with `regionData` verbatim so a test can assert the flags/visibility the
// adapter authored.
//
//   regions  — Regions already on the scene (orphan-sweep cases)
//   contains — tokens each NEWLY created emanation reports as inside
//   generation — drop to 13 to prove the v13 no-op
export function installTokenEmanation(opts = {}) {
  const { regions = [], contains = [], generation = 14 } = opts;

  global.game.release = { generation };
  const collection = makeRegionCollection(regions);
  global.canvas.scene.regions = collection;
  global.canvas.scene.deleteEmbeddedDocuments = jest.fn(async (type, ids) => {
    const removed = ids.filter((id) => collection.delete(id));
    return removed;
  });

  const createTokenEmanation = jest.fn(async (tokenDoc, range, regionData) => {
    const region = makeRegion({
      ...regionData, attachedToken: tokenDoc, tokens: contains,
    });
    region.range = range;
    collection.set(region.id, region);
    return region;
  });

  global.foundry = {
    ...(global.foundry ?? {}),
    documents: { ...(global.foundry?.documents ?? {}), RegionDocument: { createTokenEmanation } },
  };

  return { collection, createTokenEmanation };
}

// Fit a token with the v14 movement-pipeline surfaces the path rail uses
// (#1736 S1) — opt-in, so every pre-v14 test keeps its bare token. Defaults
// model a cooperative world: findMovementPath echoes the requested waypoints,
// constrainMovementPath clips nothing, measureMovementPath prices the path with
// the same 5ft/square Chebyshev the canvas mock uses, and move() teleports the
// document to the last waypoint.
//
//   clipAfter  — keep only this many waypoints after the origin (constrained)
//   costPerLeg — feet each leg costs (models Region difficult terrain)
//   stopAt     — { x, y } the document actually parks at (models a stop-short)
export function equipV14Movement(token, opts = {}) {
  const { clipAfter = null, costPerLeg = null, stopAt = null } = opts;
  const gridSize = global.canvas?.grid?.size ?? 100;

  token.findMovementPath = jest.fn((waypoints) => ({
    // A resolved job exposes the path synchronously AND as a promise; the
    // adapter accepts either.
    result: waypoints.map((w) => ({ x: w.x, y: w.y })),
    promise: Promise.resolve(waypoints.map((w) => ({ x: w.x, y: w.y }))),
  }));

  token.constrainMovementPath = jest.fn((waypoints) =>
    (clipAfter === null
      ? [waypoints, false]
      : [waypoints.slice(0, clipAfter + 1), waypoints.length > clipAfter + 1]));

  token.document.measureMovementPath = jest.fn((waypoints) => {
    let cost = 0;
    for (let i = 1; i < waypoints.length; i++) {
      if (costPerLeg !== null) { cost += costPerLeg; continue; }
      const dc = Math.abs(waypoints[i].x - waypoints[i - 1].x) / gridSize;
      const dr = Math.abs(waypoints[i].y - waypoints[i - 1].y) / gridSize;
      cost += Math.max(Math.round(dc), Math.round(dr)) * 5;
    }
    return { distance: cost, cost };
  });

  // TokenDocument#move takes either a single waypoint object (the stepper's
  // one-cell move) or an array of them (the path rail) — accept both.
  token.document.move = jest.fn(async (waypoints) => {
    const list = Array.isArray(waypoints) ? waypoints : [waypoints];
    const end = stopAt ?? list.at(-1) ?? { x: token.x, y: token.y };
    token.document.x = end.x;
    token.document.y = end.y;
    return true;
  });

  return token;
}

// The two payloads a v14 movement hook hands a listener (#1736 S3):
//   moveToken(document, movement, operation, user) — both objects
//   planToken(document)                            — the document only, with
//     the same movement record hanging off `document.movement`
// so one description drives both hooks. `passed` / `pending` are
// TokenMovementSectionData: their waypoints are TOP-LEFT pixel coordinates,
// and Foundry's own path starts AT the origin (which is why the emitter drops
// the leading waypoint) — the default models that.
//
//   origin        — { x, y } the movement started from (defaults to the token)
//   passed        — waypoints already traversed
//   pending       — waypoints still to come
//   constrained   — a wall/constraint clipped the route
//   updateOptions — the caller's options bag (carries BRIDGE_SOURCE_FLAG)
export function makeTokenMovement(token, opts = {}) {
  const {
    origin = { x: token.x, y: token.y },
    passed = [{ x: token.x, y: token.y }],
    pending = [],
    constrained = false,
    updateOptions = {},
  } = opts;

  const section = (waypoints) => ({
    waypoints: waypoints.map((w) => ({ ...w, elevation: 0, width: 1, height: 1 })),
    distance: 0, cost: 0, spaces: waypoints.length, diagonals: 0,
  });

  const movement = {
    id: autoId('movement'),
    chain: [],
    origin: { ...origin },
    destination: { ...(pending.at(-1) ?? passed.at(-1) ?? origin) },
    passed: section(passed),
    pending: section(pending),
    constrained,
    recorded: true,
    method: 'dragging',
    updateOptions,
  };

  const document = {
    ...token.document,
    id: token.id,
    x: token.x,
    y: token.y,
    actor: token.actor,
    movement,
  };

  return { document, movement };
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
    // EncounterPF2e batches initiative writes via setMultipleInitiatives; rollNPC +
    // startCombat are inherited from the base Combat. Returning the combat matches the
    // real Promise<Combat> for the latter two.
    setMultipleInitiatives: jest.fn().mockResolvedValue(undefined),
    rollNPC: jest.fn(function rollNPC() { return Promise.resolve(this); }),
    startCombat: jest.fn(function startCombat() { return Promise.resolve(this); }),
  };
  combatants.forEach((c) => { if (!c.combat) c.combat = combat; });
  return combat;
}

// A PF2e chat message as seen by createChatMessage. ChatMessagePF2e exposes
// `actor` / `item` / `target` getters and stashes roll context under
// flags.pf2e.context — this factory assembles exactly those reads. Pass plain
// values; omit `context` (or its `type`) to model a context-free message.
export function makeChatMessage(opts = {}) {
  const {
    actorId = null,
    type = null,            // attack-roll | spell-cast | skill-check | saving-throw | damage-roll
    outcome = null,
    itemName = null,
    itemType = null,
    actionCount = null,     // item.system.actions.value
    actionType = null,      // item.system.actionType.value
    spellTime = null,       // item.system.time.value
    ranged = null,          // true → item.isRanged; false → item.isMelee (weapons only)
    targetName = null,
    targetActorId = null,   // message.target.actor.id
    damageInstances = null, // [{ type, total }] → message.rolls[0].instances (damage rolls, #1355)
  } = opts;

  const context = type ? { type, ...(outcome ? { outcome } : {}) } : undefined;
  const item = itemName || itemType || actionCount != null || actionType || spellTime != null || ranged != null
    ? {
        name: itemName,
        type: itemType,
        ...(ranged != null ? { isRanged: ranged === true, isMelee: ranged === false } : {}),
        system: {
          ...(actionCount != null ? { actions: { value: actionCount } } : {}),
          ...(actionType ? { actionType: { value: actionType } } : {}),
          ...(spellTime != null ? { time: { value: spellTime } } : {}),
        },
      }
    : null;

  const target = (targetName || targetActorId)
    ? {
        token: { name: targetName },
        actor: { id: targetActorId, name: targetName },
      }
    : null;

  return {
    id: autoId('msg'),
    actor: actorId ? { id: actorId } : null,
    item,
    target,
    speaker: { actor: actorId },
    flags: { pf2e: context ? { context } : {} },
    // PF2e DamageRoll#instances: DamageInstance exposes `type` + `total`.
    ...(damageInstances ? { rolls: [{ instances: damageInstances }] } : {}),
  };
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
    scene: {
      id: opts.sceneId ?? 'scene-1',
      grid: { size: gridSize, distance: opts.gridDistance ?? 5 },
      createEmbeddedDocuments: jest.fn().mockResolvedValue([]),
    },
    grid: { size: gridSize, measurePath },
    tokens,
    walls: {},
  };
}

// PF2e's typed damage roll, as the adapter looks it up in CONFIG.Dice.rolls by
// class name (#1016). Evaluate is a no-op that returns the roll — tests assert
// on the formula the adapter built ('8[fire]').
export class DamageRoll {
  constructor(formula) {
    this.formula = formula;
    this.evaluated = false;
  }

  async evaluate() {
    this.evaluated = true;
    return this;
  }
}

export function makeConfig(opts = {}) {
  // testCollision returns true when a wall blocks the segment. Default: never.
  const testCollision = opts.testCollision ?? (() => false);
  return {
    Canvas: { polygonBackends: { move: { testCollision } } },
    Dice: { rolls: opts.diceRolls ?? [DamageRoll] },
  };
}

// --- game -----------------------------------------------------------------

export function makeGame(opts = {}) {
  return {
    release: { generation: opts.generation ?? 13 },
    combat: opts.combat ?? null,
    combats: makeCollection(opts.combats ?? []),
    actors: makeCollection(opts.actors ?? []),
    users: makeCollection(opts.users ?? []),
    user: opts.user ?? { id: 'user1', targets: new Set(), updateTokenTargets: jest.fn() },
    settings: {
      register: jest.fn(),
      // The relay secret lives in a per-world setting (never the repo), and the
      // bridge refuses to talk to the Worker without one — so the mock world is
      // "configured" by default. Tests covering the unconfigured path pass
      // `settings: { bridgeSecret: '' }` explicitly.
      get: jest.fn((_mod, key) => ({ bridgeSecret: 'test-relay-secret', ...(opts.settings ?? {}) })[key]),
    },
    // game.modules.get(id).version — the bridge reads its own for the hello (#1310).
    modules: new Map(Object.entries(opts.modules ?? { 'cnmh-bridge': { version: '0.0.0-test' } })),
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
