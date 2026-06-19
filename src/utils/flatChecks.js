// Condition-driven flat checks (#262).
//
// Some conditions don't just net into a roll bonus — they impose a flat check
// the actor must pass *before* the action resolves, or the action is lost (the
// cost is still spent). These are silently skipped at the table today because
// nothing prompts them. This module is the React-free source of truth for which
// flat checks a given action requires; the cast/use flow renders a d20 entry per
// check and aborts resolution on a failure.
//
// Modeled here (caster-side):
//   stupefied   → DC 5 + value on Cast a Spell; on failure the spell is lost
//   grabbed     → DC 5 on any Manipulate-trait action (casting with a somatic/
//   restrained    material component, most item use); on failure it's disrupted
//
// A flat check is a raw d20 vs the DC with no modifiers — pass when d20 >= dc.
import { getCondition } from '../data/pf2eConditions';

/**
 * The flat checks an action requires given the actor's active conditions.
 *
 * @param {object} ability                 the action/spell being used
 * @param {Array}  [conditions=[]]         the actor's active conditions ([{ id, value }])
 * @param {{ isCast?: boolean }} [opts]    isCast = the action is Cast a Spell
 * @returns {Array<{ id, label, dc, reason, fail }>}
 *   id      condition id imposing the check
 *   label   display label (with value, e.g. "Stupefied 2")
 *   dc      flat-check DC
 *   reason  why the check is required (rendered as a hint)
 *   fail    what happens on a failed check (logged)
 */
export function requiredFlatChecks(ability, conditions = [], { isCast = false } = {}) {
  if (!ability) return [];
  const has = (id) => (conditions || []).find((c) => c.id === id) || null;
  const traits = ability.traits || [];
  const checks = [];

  // Stupefied: Cast a Spell requires a DC 5 + value flat check or the spell is lost.
  const stupefied = has('stupefied');
  if (isCast && stupefied) {
    const value = stupefied.value || 0;
    checks.push({
      id: 'stupefied',
      label: `Stupefied ${value}`,
      dc: 5 + value,
      reason: 'Casting while stupefied requires a flat check or the spell is lost.',
      fail: 'the spell is lost',
    });
  }

  // Grabbed / restrained: any Manipulate-trait action requires a DC 5 flat check.
  const binding = has('grabbed') || has('restrained');
  if (binding && traits.includes('Manipulate')) {
    const name = getCondition(binding.id)?.name || binding.id;
    checks.push({
      id: binding.id,
      label: name,
      dc: 5,
      reason: `Manipulate actions while ${name.toLowerCase()} require a DC 5 flat check.`,
      fail: 'the action is disrupted',
    });
  }

  return checks;
}

// Target-concealment flat checks (#262). When you attack a creature that's
// concealed (DC 5) or hidden (DC 11) you must succeed at a flat check first or
// the attack is lost. Concealment isn't in the targeting payload, so the
// attacker sets it manually on the attack — these are the picker options.
export const CONCEALMENT_LEVELS = [
  { id: 'none',      label: 'None',      dc: null },
  { id: 'concealed', label: 'Concealed', dc: 5 },
  { id: 'hidden',    label: 'Hidden',    dc: 11 },
];

/**
 * The flat check a manually-flagged concealed/hidden target imposes on an attack,
 * shaped like a requiredFlatChecks entry so it flows through the same gate.
 *
 * @param {string} level  'none' | 'concealed' | 'hidden'
 * @returns {{ id, label, dc, reason, fail }|null}  null for 'none' / unknown
 */
export function concealmentFlatCheck(level) {
  const opt = CONCEALMENT_LEVELS.find((l) => l.id === level);
  if (!opt || opt.dc == null) return null;
  return {
    id: opt.id,
    label: `${opt.label} target`,
    dc: opt.dc,
    reason: `Attacking a ${opt.id} target requires a DC ${opt.dc} flat check or the attack is lost.`,
    fail: 'the attack is lost',
  };
}

/**
 * Whether a raw d20 passes a flat check (>= dc). No modifiers, no crit rules.
 * @param {number} d20
 * @param {number} dc
 */
export const flatCheckPasses = (d20, dc) =>
  Number.isFinite(d20) && Number.isFinite(dc) && d20 >= dc;
