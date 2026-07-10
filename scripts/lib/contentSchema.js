// Seed content schema (#1314) — structural validation for the CampaignContent
// collections. Used by scripts/snapshotContent.js (gate the DO pull) and by
// src/data/snapshotSeed.schema.test.js (gate the committed shards in CI).
//
// Deliberately permissive: it checks that fields the app depends on exist with
// the right JS kind, and ignores fields it doesn't know about — content
// authoring must stay easy. Tighten field-by-field as bugs justify it.
// Hand-rolled (no ajv/zod) to stay dependency-free like the repo's other
// contract helpers (foundry-bridge/__fixtures__/relay/shape.js).

const kind = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

// Field spec: { type, required?, enum? }. `type` is one kind or a list of
// accepted kinds. `required` means the field must be present; otherwise it is
// only type-checked when present.
const req = (type, extra) => ({ type, required: true, ...extra });
const opt = (type, extra) => ({ type, ...extra });

const COLLECTION_SPECS = {
  quest: {
    id: req('string'), title: req('string'), status: req('string'),
    description: req('string'), notes: opt('array'),
  },
  faction: {
    id: req('string'), name: req('string'),
    reputation: req('number'), ranks: req('array'),
  },
  calendar: {
    id: req('string'), type: req('string'), description: req('string'),
  },
  lore: {
    id: req('string'), title: req('string'), category: req('string'),
    summary: req('string'), content: req('string'),
    // The player-facing filter is a strict `=== 'revealed'` — a typo here
    // silently hides the entry, so the value set is pinned.
    visibility: req('string', { enum: ['gm', 'revealed'] }),
  },
  trait: {
    id: req('string'), name: req('string'), description: req('string'),
  },
  character: {
    id: req('string'), name: req('string'), ancestry: req('string'),
    class: req('string'), keyAbility: req('string'),
    level: req('number'), maxHp: req('number'), ac: req('number'), speed: req('number'),
    abilities: req('object'), saves: req('object'), skills: req('object'),
    inventory: req('array'), feats: req('array'), strikes: req('array'),
    actions: req('array'), reactions: req('array'), gold: req('number'),
  },
  item: {
    // `name` is NOT universally required: scroll/wand bases derive their name
    // from the referenced spell (#812) — validateDoc special-cases it below.
    id: req('string'), name: opt('string'),
    description: opt('string'), price: opt('number'), weight: opt('number'),
    // strikeUtils tolerates both the array and single-object strike shapes.
    traits: opt('array'), strikes: opt(['array', 'object']),
    // Durability (#540): material drives the GM Core stats table; an authored
    // durability block overrides it (see src/utils/itemDurability.js).
    material: opt('string'), durability: opt('object'),
    // Thassilonian rune mark: rune name from utils/thassilonianRunes.js.
    // Drives the item's rune art/medallion and the rune-stamp juice for any
    // action taken with the item (utils/flourishFor.js).
    thassilonianRune: opt('string'),
  },
  spell: {
    id: req('string'), name: req('string'), level: req('number'),
    traits: req('array'), actions: req('string'), description: req('string'),
    baseLevel: opt('number'),
  },
  effect: {
    id: req('string'), name: req('string'), description: req('string'),
    modifiers: req('array'),
  },
  rune: {
    id: req('string'), type: req('string'), name: req('string'),
    level: req('number'), price: req('number'), description: req('string'),
  },
  image: {
    id: req('string'), name: req('string'), folder: req('string'),
    mimeType: req('string'), createdAt: req('number'),
  },
  theme: {
    id: req('string'), palette: req('object'),
  },
};

// A scroll/wand base item derives its display name from the spell it wraps —
// the only sanctioned nameless-item shape.
const isSpellBaseItem = (doc) =>
  !!(doc && typeof doc === 'object' && (doc.scroll || doc.wand));

const label = (key, i, doc) =>
  `${key}[${i}]${doc && doc.id != null ? ` (id "${doc.id}")` : ''}`;

function validateDoc(key, doc, i, problems) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    problems.push(`${key}[${i}]: not an object`);
    return;
  }
  const spec = COLLECTION_SPECS[key];
  for (const [field, rule] of Object.entries(spec)) {
    const present = field in doc && doc[field] !== undefined;
    if (!present) {
      if (rule.required) problems.push(`${label(key, i, doc)}: missing required field "${field}"`);
      continue;
    }
    const k = kind(doc[field]);
    const accepted = Array.isArray(rule.type) ? rule.type : [rule.type];
    if (!accepted.includes(k)) {
      problems.push(`${label(key, i, doc)}: "${field}" — expected ${accepted.join('|')}, got ${k}`);
      continue;
    }
    if (rule.enum && !rule.enum.includes(doc[field])) {
      problems.push(`${label(key, i, doc)}: "${field}" — "${doc[field]}" not in [${rule.enum.join(', ')}]`);
    }
  }
  if (key === 'item' && typeof doc.name !== 'string' && !isSpellBaseItem(doc)) {
    problems.push(`${label(key, i, doc)}: missing "name" (only scroll/wand bases may omit it)`);
  }
}

// Validate one collection's docs. Returns a list of human-readable problems
// ([] = clean). Unknown collection keys are ignored (live-only collections
// like room/event/monster never reach the seed).
function validateCollection(key, docs) {
  const problems = [];
  if (!COLLECTION_SPECS[key]) return problems;
  if (!Array.isArray(docs)) return [`${key}: expected an array, got ${kind(docs)}`];
  docs.forEach((doc, i) => validateDoc(key, doc, i, problems));
  return problems;
}

// Validate a whole snapshot payload ({ [collection]: docs }).
function validateSnapshot(snapshot) {
  const problems = [];
  for (const key of Object.keys(COLLECTION_SPECS)) {
    if (key in snapshot) problems.push(...validateCollection(key, snapshot[key]));
  }
  return problems;
}

module.exports = { COLLECTION_SPECS, validateCollection, validateSnapshot };
