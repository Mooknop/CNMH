// PF2e Recall Knowledge utilities — DC calculation, field reveals, and trait→skill mapping.

// DC by level: level -1 → 25 maps to index 0 → 26.
const DC_BY_LEVEL = [
  13, // -1
  14, //  0
  15, //  1
  16, //  2
  18, //  3
  19, //  4
  20, //  5
  22, //  6
  23, //  7
  24, //  8
  26, //  9
  27, // 10
  28, // 11
  30, // 12
  31, // 13
  32, // 14
  34, // 15
  35, // 16
  36, // 17
  38, // 18
  39, // 19
  40, // 20
  42, // 21
  44, // 22
  46, // 23
  48, // 24
  50, // 25
];

const RARITY_BUMP = {
  common:   0,
  uncommon: 2,
  rare:     5,
  unique:   10,
};

export function recallKnowledgeDC(level, rarity = 'common') {
  const lvl = Number.isFinite(level) ? Math.max(-1, Math.min(25, level)) : 0;
  const idx = lvl + 1; // offset: level -1 is index 0
  const base = DC_BY_LEVEL[idx] ?? DC_BY_LEVEL[DC_BY_LEVEL.length - 1];
  const bump = RARITY_BUMP[rarity] ?? 0;
  return base + bump;
}

// ── Knowledge-skill helpers ─────────────────────────────────────────────────

export const KNOWLEDGE_SKILLS = ['arcana', 'nature', 'occultism', 'religion', 'society'];

// Trait → recommended knowledge skill. When a creature has multiple matching
// traits the first match wins (array order defines priority).
const TRAIT_SKILL_MAP = [
  { traits: ['aberration'],                              skill: 'occultism' },
  { traits: ['animal', 'beast', 'fey', 'plant', 'fungus'], skill: 'nature' },
  { traits: ['celestial', 'fiend', 'monitor', 'undead'],  skill: 'religion' },
  { traits: ['dragon', 'construct', 'elemental'],         skill: 'arcana' },
  { traits: ['giant', 'humanoid'],                        skill: 'society' },
  { traits: ['ooze', 'spirit', 'astral', 'ethereal'],     skill: 'occultism' },
];

// Returns ordered array of skill ids for the given trait list (recommended first,
// then remaining skills). Falls back to all five when no trait matches.
export function recallKnowledgeSkills(traits = []) {
  const lower = (traits || []).map((t) => String(t).toLowerCase());
  for (const { traits: ts, skill } of TRAIT_SKILL_MAP) {
    if (lower.some((t) => ts.includes(t))) {
      return [skill, ...KNOWLEDGE_SKILLS.filter((s) => s !== skill)];
    }
  }
  return [...KNOWLEDGE_SKILLS];
}

// ── Shared reveal state helpers ─────────────────────────────────────────────

export function defaultRecord() {
  return {
    all: false,
    description: false,
    hp: false,
    saves: { fortitude: false, reflex: false, will: false },
    iwr: { immunities: false, resistances: false, weaknesses: false },
    lockedOut: {},
    history: [],
  };
}

export function isLockedFor(record, charId) {
  return !!(record?.lockedOut?.[charId]);
}

export function isFieldRevealed(record, field) {
  return !!(record?.all || record?.[field]);
}

export function isSaveRevealed(record, saveKey) {
  return !!(record?.all || record?.saves?.[saveKey]);
}

export function isIwrRevealed(record, iwrKey) {
  return !!(record?.all || record?.iwr?.[iwrKey]);
}

// Resolves 'lowest'/'highest' save choice to a concrete save key.
function resolveAbstractSave(choice, saves) {
  const s = saves || {};
  const entries = ['fortitude', 'reflex', 'will']
    .map((k) => [k, s[k]])
    .filter(([, v]) => v != null);
  if (entries.length === 0) return 'fortitude'; // fallback
  if (choice === 'lowest') {
    return entries.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
  }
  // 'highest'
  return entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

// Pure reducer — returns { next: updatedRecord, learned: string|null }.
// `choice` is one of: 'fortitude'|'reflex'|'will'|'lowest'|'highest'|
//                     'immunities'|'resistances'|'weaknesses'
// `defenses` is the enemy's defenses object (for lowest/highest resolution).
export function applyRecallKnowledge(record, { degree, defenses, choice, charId }) {
  const base = record || defaultRecord();

  if (degree === 'criticalSuccess') {
    return { next: { ...base, all: true }, learned: null };
  }

  if (degree === 'success') {
    const saveKeys = ['fortitude', 'reflex', 'will'];
    const iwrKeys  = ['immunities', 'resistances', 'weaknesses'];
    let next = { ...base, description: true, hp: true };
    let learned = null;

    if (saveKeys.includes(choice)) {
      learned = choice;
      next = { ...next, saves: { ...next.saves, [choice]: true } };
    } else if (choice === 'lowest' || choice === 'highest') {
      learned = resolveAbstractSave(choice, defenses?.saves);
      next = { ...next, saves: { ...next.saves, [learned]: true } };
    } else if (iwrKeys.includes(choice)) {
      learned = choice;
      next = { ...next, iwr: { ...next.iwr, [choice]: true } };
    }

    return { next, learned };
  }

  if (degree === 'criticalFailure') {
    const id = charId || '__unknown__';
    return {
      next: { ...base, lockedOut: { ...base.lockedOut, [id]: true } },
      learned: null,
    };
  }

  // failure — no change
  return { next: base, learned: null };
}
