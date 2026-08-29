// Party-semantic reduction for cnmh_exploredist_global (unify-exploredist,
// following #1822/#1825). The key used to be a plain number that every
// writer incremented directly — group moves added the group's MAX
// feetMoved (party-semantic), single moves (this pane's own taps AND
// ExplorationMove.jsx's isGm branch) each SUMMED their own feet, so walking
// N PCs one at a time to the same spot inflated the tally against
// ExplorationTimeControl's suggestion (which already divides by the
// party's slowest Speed).
//
// The fix: attribute every accrual to the character that moved, and let the
// READERS reduce the per-character ledger to a party distance. The key now
// holds either shape:
//   · a legacy/reset plain number `n` (party feet; 0 is the reset value —
//     resets keep writing the number 0, not an empty ledger)
//   · `{ base, perChar: { [charId]: feet } }` — `base` folds in whatever
//     legacy number was already on the key the first time a ledger accrual
//     ever ran against it (a completed prior tally, additive); `perChar[id]`
//     is that character's own total feet accrued since the last reset.
//
// Party distance = base + MAX(0, ...perChar values). Walking 5 PCs 30 ft
// one at a time now reads 30, not 150. A group move from a clean tally
// still yields exactly the group's max feetMoved (identical to the
// pre-existing group semantics), and a straggler catching up after a group
// move adds nothing once their total is no higher than the group's.
//
// TRADE-OFF (accepted, same "short never long" precedent the pre-unification
// comments already called out): PCs moving on genuinely separate beats can
// under-count against each other, since the party distance only ever tracks
// the single highest per-character total. The GM resets the tally (Reset /
// Apply) whenever a suggestion is consumed, so this is a heuristic bound,
// not a correctness bug.

function normalizeExploreDistance(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return { base: value, perChar: {} };
  }
  if (value && typeof value === 'object') {
    const base = Number(value.base) || 0;
    const rawPerChar = value.perChar || {};
    const perChar = {};
    for (const [charId, feet] of Object.entries(rawPerChar)) {
      const n = Number(feet);
      if (Number.isFinite(n) && n > 0) perChar[charId] = n;
    }
    return { base, perChar };
  }
  return { base: 0, perChar: {} };
}

function accrueExploreDistance(prev, charId, feet) {
  const n = Number(feet);
  if (!charId || !Number.isFinite(n) || n <= 0) return prev;
  const { base, perChar } = normalizeExploreDistance(prev);
  const existing = perChar[charId] || 0;
  return { base, perChar: { ...perChar, [charId]: existing + n } };
}

function accrueGroupExploreDistance(prev, results) {
  let next = prev;
  for (const r of results || []) {
    if (!r?.moverId) continue;
    const feet = Number(r.feetMoved);
    if (!Number.isFinite(feet) || feet <= 0) continue;
    next = accrueExploreDistance(next, r.moverId, feet);
  }
  return next;
}

function partyExploreDistance(value) {
  const { base, perChar } = normalizeExploreDistance(value);
  const perCharValues = Object.values(perChar);
  const maxPerChar = perCharValues.length ? Math.max(0, ...perCharValues) : 0;
  return base + maxPerChar;
}

export {
  normalizeExploreDistance,
  accrueExploreDistance,
  accrueGroupExploreDistance,
  partyExploreDistance,
};
