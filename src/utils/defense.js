// Defense DC helpers — pure, no React/Foundry dependencies.
//
// Saves are stored as modifiers on enemy entries; the app derives DC = 10 + mod.
// AC is already a target number and is returned as-is.

export const DEFENSE_OPTIONS = [
  { value: 'ac',         label: 'AC' },
  { value: 'fortitude',  label: 'Fortitude DC' },
  { value: 'reflex',     label: 'Reflex DC' },
  { value: 'will',       label: 'Will DC' },
  { value: 'perception', label: 'Perception DC' },
];

// DC-flavoured wording — for pickers and standalone labels that name the
// target number itself ("Reflex DC 27").
export const DEFENSE_LABELS = {
  ac:         'AC',
  fortitude:  'Fortitude DC',
  reflex:     'Reflex DC',
  will:       'Will DC',
  perception: 'Perception DC',
};

// Bare defense names — for prose that supplies its own "DC" (#1610: reusing
// DEFENSE_LABELS there doubles up, "Reflex DC DC 60").
export const DEFENSE_NAMES = {
  ac:         'AC',
  fortitude:  'Fortitude',
  reflex:     'Reflex',
  will:       'Will',
  perception: 'Perception',
};

/**
 * Compute the effective DC for a defense type from an enemy's defenses object.
 * Saves and Perception are stored as modifiers (DC = 10 + mod); AC is a target
 * number returned as-is. Perception lives at the top level, not under `saves`.
 *
 * @param {{ ac, perception?, saves: { fortitude, reflex, will } } | null} defenses
 * @param {'ac'|'fortitude'|'reflex'|'will'|'perception'} defense
 * @returns {number|null}  null when the stat is absent (no actor data)
 */
export function defenseDC(defenses, defense) {
  if (!defenses) return null;
  if (defense === 'ac') return defenses.ac ?? null;
  const mod = defense === 'perception' ? defenses.perception : defenses.saves?.[defense];
  return mod != null ? 10 + mod : null;
}
