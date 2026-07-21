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
      grid: { size: gridSize },
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
      get: jest.fn((_mod, key) => (opts.settings ?? {})[key]),
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
