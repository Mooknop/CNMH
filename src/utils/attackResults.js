import { computeSaveDegree } from './saveDegree';
import { defenseDC } from './defense';
import { computeTargetDamage } from './damage';

// Per-target attack resolution for the RollSheet path (#1687, Roll Resolution
// redesign workstream E). This is the arithmetic `TargetRollResolver` runs in
// its `computeResults()` closure, lifted out unchanged so the two-phase sheet
// can run it TWICE from the same frozen face: once at the commit (degrees, no
// damage yet) and once at the finish (the same degrees, now with the entered
// totals). TargetRollResolver itself is untouched — MultiRayResolver and
// FamiliarManeuverModal still consume it until workstream J.

// 1→st, 2→nd, 3→rd, 4→th — for "2nd increment" notes (#530).
const ordinalSuffix = (n) => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
};

/**
 * The range-increment note for one result row (#530) — the same text
 * `TargetRollResolver` renders in its `trr-range-note` span.
 *
 * @param {Object|null} range      - { feet, increments, penalty, beyondMaxRange, waived }
 * @param {boolean}     outOfRange
 * @returns {string|null}
 */
export const rangeNoteFor = (range, outOfRange) => {
  if (!range) return null;
  const inc = range.increments > 1 && !outOfRange
    ? ` · ${range.increments}${ordinalSuffix(range.increments)} increment ${range.penalty}`
    : '';
  const waived = range.waived ? ' · Hunt Prey: 2nd increment ignored' : '';
  return `${range.feet} ft${inc}${waived}`;
};

/**
 * Resolve one d20 face against every picked enemy target.
 *
 * `adjust` (situational toggles + the free-form circumstance, #274) is added on
 * top of `rollBonus` exactly as the resolver does. The RollSheet caller ALSO
 * folds it into the `bonus` it hands `RollEntry`, so the frozen headline and
 * these committed degrees agree — pass the raw `rollBonus` here, never the
 * folded one, or the adjustment lands twice.
 *
 * @param {Array}       enemyTargets - encounter entries (kind:'enemy', with defenses)
 * @param {string}      defense      - 'ac'|'fortitude'|'reflex'|'will'
 * @param {number|null} face         - the raw d20; null yields no rows
 * @param {number|null} rollBonus    - the actor's net bonus, or null when none is derivable
 * @param {number}      [adjust]     - situational total
 * @param {Array}       [adjustSources]
 * @param {Object|null} [rangeByEntry] - per-entryId range-increment result (#530)
 * @param {Object|null} [damage]     - buildDamageProfile output; null skips the damage step
 * @param {Object}      [riderState] - rider toggle overrides
 * @param {boolean}     [critDouble]
 * @param {number|null} [entered]    - single-total entry (un-doubled)
 * @param {Array|null}  [instances]  - per-type entry (#1019), base part first
 * @returns {Array} resolver-shaped rows: { entryId, name, dc, total, degree, damage, … }
 */
export const buildAttackResults = ({
  enemyTargets = [],
  defense,
  face,
  rollBonus = null,
  adjust = 0,
  adjustSources = [],
  rangeByEntry = null,
  damage = null,
  riderState = {},
  critDouble = true,
  entered = null,
  instances = null,
}) => {
  if (face == null) return [];
  const total = (rollBonus !== null ? face + rollBonus : face) + adjust;
  return enemyTargets.map((entry) => {
    const dc = defenseDC(entry.defenses, defense);
    // Per-target range increment (#530): out of range blocks the degree; an
    // in-range penalty lowers this target's total only.
    const range = rangeByEntry?.[entry.entryId] || null;
    const outOfRange = !!range?.beyondMaxRange;
    const rangePenalty = range && !outOfRange ? range.penalty : 0;
    const entryTotal = total + rangePenalty;
    const degree = (dc != null && !outOfRange)
      ? computeSaveDegree({ d20: face, total: entryTotal, dc })
      : null;
    const dmg = damage
      ? computeTargetDamage({
          entered,
          instances,
          degree,
          riders: damage.riders,
          riderState,
          entryId: entry.entryId,
          critDouble,
          // Monster IWR (#1014): the target's own defenses net into the
          // displayed final (the relay stays raw via rawFinal/rawInstances).
          typeLabel: damage.typeLabel,
          defenses: entry.defenses,
          // Counts-as tags (#1214 — whetstone material / ghost touch).
          iwrTags: damage.iwrTags,
        })
      : null;
    return {
      entryId: entry.entryId, name: entry.name, dc, total: entryTotal, degree, damage: dmg,
      ...(adjust !== 0 ? { adjust, adjustSources } : {}),
      ...(range ? { range, outOfRange } : {}),
    };
  });
};
