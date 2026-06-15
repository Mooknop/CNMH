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

// Key used to store a creature's Recall Knowledge record. Same-type enemies share
// a record via their stable `creatureKey` (emitted by the bridge). Falls back to the
// per-combatant `entryId` when no creatureKey is present (unlinked/homebrew actors),
// so those behave as before — no dedupe, no shared reveal.
export function rkKeyFor(enemy) {
  return enemy?.creatureKey || enemy?.entryId || null;
}

// Prune the campaign knowledge store at encounter end (#333). creatureKey-keyed
// records persist for the whole campaign — a creature learned in one fight stays
// revealed when it shows up later. Only the *ephemeral* records keyed by the
// just-ended encounter's entryIds (manual/homebrew enemies with no creatureKey —
// they can't dedupe across encounters anyway) are dropped, so no stale buildup
// accumulates. Per-character in-combat crit-fail locks (`lockedOut`) reset on the
// surviving records: a new fight is a fresh chance to roll. Out-of-combat day
// locks (`dayLocked`) are preserved — they expire by in-game date, not encounter.
export function pruneEncounterKnowledge(knowledge, order = []) {
  if (!knowledge) return {};
  const ephemeral = new Set();
  for (const entry of order) {
    if (entry?.kind !== 'enemy') continue;
    if (!entry.creatureKey && entry.entryId) ephemeral.add(entry.entryId);
  }
  const next = {};
  for (const [key, record] of Object.entries(knowledge)) {
    if (ephemeral.has(key)) continue;
    next[key] = { ...record, lockedOut: {} };
  }
  return next;
}

export function defaultRecord() {
  return {
    identity: false,        // name + level + traits — auto-revealed on any success
    description: false,     // auto-revealed on any success
    hp: false,              // auto-revealed on any success
    ac: false,              // pickable option
    perception: false,      // pickable option
    speed: false,           // pickable option
    saves: { fortitude: false, reflex: false, will: false },
    iwr: { immunities: false, resistances: false, weaknesses: false },
    weaknessesRevealed: {}, // { [type]: true } — partial single-weakness reveal (EV success)
    lockedOut: {},          // { [charId]: true } — in-combat crit-fail lock, cleared at encounter end
    dayLocked: {},          // { [charId]: dayIndex } — out-of-combat crit-fail lock, clears next in-game day (#396)
    history: [],
  };
}

// Ordered field list for the GM bestiary editor's per-field reveal toggles
// (#335). `key` is a path into a record — flat (`'ac'`) or nested
// (`'saves.fortitude'`, `'iwr.immunities'`).
export const REVEAL_FIELDS = [
  { key: 'identity',         label: 'Identity (name/level/traits)' },
  { key: 'description',      label: 'Description' },
  { key: 'hp',               label: 'HP' },
  { key: 'ac',               label: 'AC' },
  { key: 'perception',       label: 'Perception' },
  { key: 'speed',            label: 'Speed' },
  { key: 'saves.fortitude',  label: 'Fortitude' },
  { key: 'saves.reflex',     label: 'Reflex' },
  { key: 'saves.will',       label: 'Will' },
  { key: 'iwr.immunities',   label: 'Immunities' },
  { key: 'iwr.resistances',  label: 'Resistances' },
  { key: 'iwr.weaknesses',   label: 'Weaknesses' },
];

// Read a REVEAL_FIELDS path off a record.
export function isPathRevealed(record, key) {
  if (!record || !key) return false;
  const [head, leaf] = key.split('.');
  return leaf ? !!record[head]?.[leaf] : !!record[head];
}

// Immutably set a REVEAL_FIELDS path on a record (#335). Returns a new record.
export function setRecordFieldRevealed(record, key, value) {
  const base = record || defaultRecord();
  const [head, leaf] = key.split('.');
  if (leaf) {
    return { ...base, [head]: { ...(base[head] || {}), [leaf]: !!value } };
  }
  return { ...base, [head]: !!value };
}

// A record with every field force-revealed — the GM "Reveal all" action (#335).
// Roll history is preserved; partial weakness reveals are dropped since the full
// `iwr.weaknesses` flag supersedes them.
export function fullyRevealedRecord(record = defaultRecord()) {
  const base = record || defaultRecord();
  return {
    ...base,
    identity: true,
    description: true,
    hp: true,
    ac: true,
    perception: true,
    speed: true,
    saves: { fortitude: true, reflex: true, will: true },
    iwr: { immunities: true, resistances: true, weaknesses: true },
    weaknessesRevealed: {},
    history: base.history || [],
  };
}

export function isLockedFor(record, charId) {
  return !!(record?.lockedOut?.[charId]);
}

// Out-of-combat Recall Knowledge lockout (#396): a critical failure locks the
// character out of that creature until the next in-game day. `currentDay` is a
// day index (e.g. totalDaysSince4700). Locked while currentDay <= the day the
// crit-fail happened; clears once the clock advances past it.
export function isDayLockedFor(record, charId, currentDay) {
  const lockedDay = record?.dayLocked?.[charId];
  if (lockedDay == null || currentDay == null) return false;
  return currentDay <= lockedDay;
}

export function isFieldRevealed(record, field) {
  return !!(record?.[field]);
}

export function isSaveRevealed(record, saveKey) {
  return !!(record?.saves?.[saveKey]);
}

export function isIwrRevealed(record, iwrKey) {
  return !!(record?.iwr?.[iwrKey]);
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

// Applies a single choice to a record. Returns { next, learned }.
function applyOneChoice(record, choice, defenses) {
  const saveKeys = ['fortitude', 'reflex', 'will'];
  const iwrKeys  = ['immunities', 'resistances', 'weaknesses'];

  if (['ac', 'perception', 'speed'].includes(choice)) {
    return { next: { ...record, [choice]: true }, learned: choice };
  }
  if (saveKeys.includes(choice)) {
    return { next: { ...record, saves: { ...record.saves, [choice]: true } }, learned: choice };
  }
  if (choice === 'lowest' || choice === 'highest') {
    const resolved = resolveAbstractSave(choice, defenses?.saves);
    return { next: { ...record, saves: { ...record.saves, [resolved]: true } }, learned: resolved };
  }
  if (iwrKeys.includes(choice)) {
    return { next: { ...record, iwr: { ...record.iwr, [choice]: true } }, learned: choice };
  }
  return { next: record, learned: null };
}

// Pure reducer — returns { next: updatedRecord, learned: string[]|null }.
// `choices` is an array of picks:
//   success       → 1 choice applied
//   criticalSuccess → 2 choices applied
// Each choice is one of: 'ac'|'perception'|'speed'|
//   'fortitude'|'reflex'|'will'|'lowest'|'highest'|
//   'immunities'|'resistances'|'weaknesses'
// `defenses` is the enemy's defenses object (for lowest/highest resolution).
export function applyRecallKnowledge(record, { degree, defenses, choices, charId, outOfCombat, currentDay }) {
  const base = record || defaultRecord();

  if (degree === 'criticalSuccess' || degree === 'success') {
    // Auto-reveal identity (name/level/traits), description, and HP on any success.
    let next = { ...base, identity: true, description: true, hp: true };
    const learnedList = [];
    for (const c of (choices || [])) {
      const { next: n, learned } = applyOneChoice(next, c, defenses);
      next = n;
      if (learned) learnedList.push(learned);
    }
    return { next, learned: learnedList.length > 0 ? learnedList : null };
  }

  if (degree === 'criticalFailure') {
    const id = charId || '__unknown__';
    // The in-combat lockout (`lockedOut`) is cleared at encounter end. Out of
    // combat there is no encounter to end it, so the lockout is keyed to the
    // in-game day (`dayLocked`): the PC can try again on the next day
    // (currentDay > lockedDay). See isDayLockedFor.
    if (outOfCombat) {
      return {
        next: { ...base, dayLocked: { ...base.dayLocked, [id]: currentDay ?? null } },
        learned: null,
      };
    }
    return {
      next: { ...base, lockedOut: { ...base.lockedOut, [id]: true } },
      learned: null,
    };
  }

  // failure — no change
  return { next: base, learned: null };
}

// ── Exploit Vulnerability helpers ───────────────────────────────────────────

// Personal Antithesis weakness value = 2 + half level (rounded down).
export function personalAntithesisValue(level) {
  return 2 + Math.floor((level || 0) / 2);
}

// Returns { type, value } for the single highest weakness, or null when none.
export function highestWeakness(defenses) {
  const ws = defenses?.weaknesses;
  if (!ws || ws.length === 0) return null;
  return ws.reduce((best, w) => (w.value > best.value ? w : best));
}

// Applies the knowledge reveals from Exploit Vulnerability.
// success      → adds the highest weakness type to weaknessesRevealed (partial)
// critSuccess  → reveals all three IWR categories
// other        → unchanged
export function revealFromExploit(record, degree, defenses) {
  const base = record || defaultRecord();
  if (degree === 'criticalSuccess') {
    return {
      ...base,
      iwr: { immunities: true, resistances: true, weaknesses: true },
    };
  }
  if (degree === 'success') {
    const hw = highestWeakness(defenses);
    if (!hw) return base;
    return {
      ...base,
      weaknessesRevealed: { ...(base.weaknessesRevealed || {}), [hw.type]: true },
    };
  }
  return base;
}
