// src/utils/spellshapeTransform.js
// Spellshape mechanical transforms (#1001 S1). A chained spellshape may carry a
// `chain.transform` block describing how it changes the spell it chains into.
// These are pure helpers; ChainedSpellSection applies them at render time.
//
// The first transform is an action-cost delta — Quickened Casting reduces the
// chained spell's action cost by 1 (minimum 1). Crucially this changes only the
// action cost paid; the spell's damage/effect tier (keyed off the chosen action
// count) is untouched, matching PF2e: you get the full spell for fewer actions.
//
// transform shape (extensible; unknown keys are ignored here):
//   { actionDelta?: number, minActions?: number }

/**
 * Apply a spellshape's action-cost delta to the chained spell's action cost.
 * No-op unless `actionCost` is numeric and the transform carries an actionDelta.
 *
 * @param {number|string} actionCost - the chained spell's action cost (numeric;
 *   'reaction'/'free'/non-numeric pass through unchanged)
 * @param {{ actionDelta?: number, minActions?: number }|null} [transform]
 * @returns {number|string} the adjusted action cost
 */
export function applyChainTransform(actionCost, transform) {
  if (typeof actionCost !== 'number') return actionCost;
  if (!transform || typeof transform.actionDelta !== 'number') return actionCost;
  const min = typeof transform.minActions === 'number' ? transform.minActions : 1;
  return Math.max(min, actionCost + transform.actionDelta);
}

/**
 * A short human note describing a transform's effect on cost, or null when it
 * doesn't change the cost. Used for the chained-cast cost hint.
 *
 * @param {number|string} actionCost - the pre-transform (raw) action cost
 * @param {{ actionDelta?: number, minActions?: number }|null} [transform]
 * @returns {string|null}
 */
export function chainTransformCostNote(actionCost, transform) {
  const adjusted = applyChainTransform(actionCost, transform);
  if (adjusted === actionCost) return null;
  const delta = adjusted - actionCost;
  const sign = delta > 0 ? '+' : '−';
  return `Spellshape: ${sign}${Math.abs(delta)} action${Math.abs(delta) === 1 ? '' : 's'} (now ${adjusted})`;
}
