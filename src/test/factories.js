// Shared domain factories (#1311) — the app-side counterpart of the bridge's
// foundry-bridge/test/foundryMock.js. Each factory returns a minimal *authored*
// document in the shape the CampaignContent collections store (what
// ContentProvider normalizes and resolves), so tests stop hand-rolling
// `mockCharacter` literals that drift from the real schema.
//
// Overrides are shallow-merged: pass whole nested objects (e.g. a full
// `abilities` map) when a nested field matters to the test.

let uidCounter = 0;
const uid = (prefix) => `${prefix}-${++uidCounter}`;

// Authored character doc (collection: character). Inventory entries reference
// the item catalog by `ref`; ContentProvider resolves them against the seeded
// items, so pair `makeCharacter({ inventory: [invRef('dagger')] })` with
// `makeItem({ id: 'dagger', ... })` in the same content bundle.
export function makeCharacter(overrides = {}) {
  return {
    id: uid('char'),
    name: 'Test Character',
    ancestry: 'Human',
    background: 'Laborer',
    class: 'Fighter',
    keyAbility: 'strength',
    size: 'Medium',
    level: 1,
    maxHp: 20,
    ac: 15,
    speed: 25,
    abilities: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    saves: { fortitude: 1, reflex: 1, will: 1 },
    skills: {},
    proficiencies: {},
    inventory: [],
    feats: [],
    strikes: [],
    actions: [],
    reactions: [],
    gold: 10,
    ...overrides,
  };
}

// An inventory entry referencing a catalog item by id.
export function invRef(ref, overrides = {}) {
  return { uid: uid('inv'), ref, quantity: 1, ...overrides };
}

// Authored item doc (collection: item).
export function makeItem(overrides = {}) {
  return {
    id: uid('item'),
    name: 'Test Item',
    description: 'A test item.',
    traits: [],
    price: 1,
    weight: 0.1,
    ...overrides,
  };
}

// Authored spell doc (collection: spell).
export function makeSpell(overrides = {}) {
  return {
    id: uid('spell'),
    name: 'Test Spell',
    level: 1,
    baseLevel: 1,
    traits: ['Concentrate', 'Manipulate'],
    actions: 'Two Actions',
    description: 'A test spell.',
    ...overrides,
  };
}

// Authored effect doc (collection: effect).
export function makeEffect(overrides = {}) {
  return {
    id: uid('effect'),
    name: 'Test Effect',
    description: 'A test effect.',
    modifiers: [],
    ...overrides,
  };
}

// A full CampaignContent payload for ContentProvider's `initialContent` seam.
// Collections you seed are authoritative; collections left empty fall back to
// the bundled seed (same behavior as the live app with an unseeded DO), so
// only seed what the test asserts on.
export function makeContent(overrides = {}) {
  return {
    quest: [],
    faction: [],
    calendar: [],
    lore: [],
    trait: [],
    character: [],
    item: [],
    spell: [],
    effect: [],
    rune: [],
    image: [],
    theme: [],
    monster: [],
    room: [],
    event: [],
    ...overrides,
  };
}
