// Defense DC helpers — pure, no React/Foundry dependencies.
//
// Saves are stored as modifiers on enemy entries; the app derives DC = 10 + mod.
// AC is already a target number and is returned as-is.

export const DEFENSE_OPTIONS = [
  { value: 'ac',        label: 'AC' },
  { value: 'fortitude', label: 'Fortitude DC' },
  { value: 'reflex',    label: 'Reflex DC' },
  { value: 'will',      label: 'Will DC' },
];

export const DEFENSE_LABELS = {
  ac:        'AC',
  fortitude: 'Fortitude DC',
  reflex:    'Reflex DC',
  will:      'Will DC',
};

/**
 * Compute the effective DC for a defense type from an enemy's defenses object.
 *
 * @param {{ ac, saves: { fortitude, reflex, will } } | null} defenses
 * @param {'ac'|'fortitude'|'reflex'|'will'} defense
 * @returns {number|null}  null when the stat is absent (no actor data)
 */
export function defenseDC(defenses, defense) {
  if (!defenses) return null;
  if (defense === 'ac') return defenses.ac ?? null;
  const mod = defenses.saves?.[defense];
  return mod != null ? 10 + mod : null;
}
