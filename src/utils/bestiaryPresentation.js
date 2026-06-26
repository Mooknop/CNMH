// Presentation helpers for the Specimen Dex bestiary refresh (#777). Pure,
// view-only derivations shared by the in-combat compact card and (later) the
// full dex entry + grid. None of these touch the reveal mechanic — they only
// turn already-known data into device chrome (accent, classification, № index)
// and collapse the Recall Knowledge `record` into a flat set of boolean flags.

import { capturedMonsters } from './bestiary';

// Per-creature "energy" accent, derived from the primary recognised type trait.
// Mapping follows the handoff's illustrative trait→colour table; tokens are used
// where one exists. Falls back to the spectral wisp cyan. A later slice may
// store an explicit `accent` on the monster doc to override this.
const TRAIT_ACCENT = {
  aberration: 'var(--arcane-light)',
  fiend:      'var(--ember-light)',
  undead:     '#9fb4c4',
  plant:      'var(--verdant-mid)',
  fungus:     'var(--verdant-mid)',
  beast:      'var(--ember-mid)',
  animal:     'var(--ember-mid)',
  dragon:     'var(--gold-mid)',
  elemental:  'var(--wisp)',
  air:        'var(--wisp)',
  fey:        'var(--verdant-light)',
  construct:  'var(--iron-mid)',
  giant:      'var(--ember-base)',
  humanoid:   'var(--iron-light)',
  celestial:  'var(--gold-light)',
  monitor:    'var(--gold-mid)',
  ooze:       'var(--arcane-mid)',
};

export const DEFAULT_ACCENT = 'var(--wisp)';

// First trait (in order) that maps to a known accent, else null.
function primaryTypeTrait(traits) {
  return (traits || []).map((t) => String(t).toLowerCase()).find((t) => TRAIT_ACCENT[t]) || null;
}

// The creature's accent colour string, ready to drop on `--acc`.
export function traitToAccent(traits) {
  const t = primaryTypeTrait(traits);
  return t ? TRAIT_ACCENT[t] : DEFAULT_ACCENT;
}

// Device status-bar classification, e.g. "ABERRATION CLASS". Prefers a known
// type trait, else the first trait, else a neutral label.
export function classificationLabel(traits) {
  const t = primaryTypeTrait(traits) || (traits || [])[0] || null;
  return t ? `${String(t).toUpperCase()} CLASS` : 'UNCLASSIFIED';
}

// Stable campaign dex ordering: capture order, then id. Numbers are derived
// (display order) rather than stored, so they may shift as the catalogue grows.
export function dexOrder(monsters) {
  return capturedMonsters(monsters)
    .slice()
    .sort((a, b) =>
      (a.capturedAt || 0) - (b.capturedAt || 0) ||
      String(a.id).localeCompare(String(b.id))
    );
}

// 1-based specimen index for a creature, or null if it isn't catalogued yet.
export function dexNumber(monsters, creatureKey) {
  if (!creatureKey) return null;
  const idx = dexOrder(monsters).findIndex((m) => String(m.id) === String(creatureKey));
  return idx >= 0 ? idx + 1 : null;
}

// "№006" for a known index, "№0??" for an un-catalogued creature.
export function formatDexNo(n) {
  return n == null ? '№0??' : `№${String(n).padStart(3, '0')}`;
}

// Collapse a Recall Knowledge record (+ GM revealAll) into flat boolean flags.
// Partial per-type weakness reveal is left to the caller (needs the defenses).
export function revealFlags(record, revealAll = false) {
  const rec = record || {};
  const f = (v) => revealAll || !!v;
  return {
    identity:    f(rec.identity),
    description: f(rec.description),
    hp:          f(rec.hp),
    ac:          f(rec.ac),
    perception:  f(rec.perception),
    speed:       f(rec.speed),
    fortitude:   f(rec.saves?.fortitude),
    reflex:      f(rec.saves?.reflex),
    will:        f(rec.saves?.will),
    immunities:  f(rec.iwr?.immunities),
    resistances: f(rec.iwr?.resistances),
    weaknesses:  f(rec.iwr?.weaknesses),
  };
}
