// PF2e degree-of-success for saving throws — pure function, no React/Foundry.
//
// Degrees (before natural-1/20 adjustment):
//   total ≥ DC + 10  → criticalSuccess
//   total ≥ DC       → success
//   total ≤ DC - 11  → criticalFailure  (i.e. total < DC - 10)
//   otherwise        → failure
//
// Natural 1 shifts one step down; natural 20 shifts one step up.
// The shift is applied after the initial degree calculation.

const DEGREES = ['criticalFailure', 'failure', 'success', 'criticalSuccess'];

function baseDegree(total, dc) {
  if (total >= dc + 10) return 'criticalSuccess';
  if (total >= dc)      return 'success';
  if (total <= dc - 11) return 'criticalFailure';
  return 'failure';
}

/**
 * @param {object} opts
 * @param {number} opts.d20     - the raw die face (1–20), for the nat-1/20 shift
 * @param {number} opts.total   - final total (d20 + modifiers)
 * @param {number} opts.dc      - the save DC
 * @returns {'criticalSuccess'|'success'|'failure'|'criticalFailure'}
 */
export function computeSaveDegree({ d20, total, dc }) {
  let idx = DEGREES.indexOf(baseDegree(total, dc));
  if (d20 === 20) idx = Math.min(idx + 1, DEGREES.length - 1);
  if (d20 === 1)  idx = Math.max(idx - 1, 0);
  return DEGREES[idx];
}
