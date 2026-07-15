// Order-strip buff chips. A buff earns a chip on its bearer's initiative-strip
// entry by either:
//   1. a `chip` field on its catalog effect def (content-authorable via the GM
//      effect editor) — a string label or { label, symbol, title } object, or
//   2. an entry in the code registry below (bootstrap effects).
// Effects without a chip stay EffectsPanel-only — the strip is deliberately
// sparse, so a buff has to opt in.

export const EFFECT_CHIPS = {
  // Courageous Anthem — both ranks collapse to one 'Inspired' chip.
  'inspire-courage':   { label: 'Inspired', symbol: '♪' },
  'inspire-courage-2': { label: 'Inspired', symbol: '♪' },
};

const normalize = (chip) => {
  if (!chip) return null;
  if (typeof chip === 'string') return { label: chip };
  return chip.label ? chip : null;
};

// Catalog def wins over the code registry so content can restyle or add a chip
// without a code change.
export const chipForEffect = (effectEntry, def) =>
  normalize(def?.chip) || normalize(EFFECT_CHIPS[effectEntry?.effectId]) || null;

/**
 * Active effects → deduped chip list. Two active effects sharing a label (the
 * inspire-courage ranks, a re-applied buff) render a single chip.
 *
 * @param {Array} effects - active effect entries ({ effectId, name?, ... })
 * @param {Array} catalog - effect catalog (useContent().effects)
 * @returns {Array<{ label, symbol?, title?, effectName }>}
 */
export const chipsForEffects = (effects, catalog) => {
  const byLabel = new Map();
  (effects || []).forEach((e) => {
    const def = (catalog || []).find((d) => d.id === e.effectId) || null;
    const chip = chipForEffect(e, def);
    if (chip && !byLabel.has(chip.label)) {
      byLabel.set(chip.label, { ...chip, effectName: def?.name || e.name || e.effectId });
    }
  });
  return [...byLabel.values()];
};
