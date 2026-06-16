// Lingering Composition (#226-B) — pure helpers shared by the resolution modal,
// the composition-cast override, and their tests.
//
// Lingering Composition is a bard free-action spellshape: roll Performance vs a
// GM DC, then your NEXT 1-round cantrip composition (Inspire Courage) lasts
// longer. The degree picks the extension; on a failure the focus point isn't
// spent. The chosen duration is carried to the next cast via a per-character
// synced flag (`cnmh_lingering_<id> = { rounds, ts }`).

// True for a composition whose base duration is 1 round — the only thing
// Lingering can extend. Reads already-authored fields (Composition trait +
// "1 round" duration), so no content tagging is needed.
export function isOneRoundComposition(spell) {
  if (!spell) return false;
  const hasTrait = (spell.traits || []).some((t) => String(t).toLowerCase() === 'composition');
  const oneRound = /\b1\s*round\b/i.test(String(spell.duration || ''));
  return hasTrait && oneRound;
}

// The effect-duration override to apply on a composition cast, given the pending
// Lingering state. Returns a `{ until:'rounds', rounds }` duration when an
// extension is pending AND the spell is an eligible 1-round composition, else
// null (the composition keeps its authored 1-round duration).
export function lingeringDurationOverride(spell, lingeringState) {
  const rounds = lingeringState?.rounds;
  if (!rounds || !isOneRoundComposition(spell)) return null;
  return { until: 'rounds', rounds };
}

// Map a degree of success to the Lingering outcome: how many rounds the next
// composition lasts and whether the focus point is spent. Failure (and crit
// failure) leave the composition at its base 1 round and refund the attempt.
export function lingeringResult(degree) {
  switch (degree) {
    case 'criticalSuccess': return { rounds: 4, spendFocus: true };
    case 'success':         return { rounds: 3, spendFocus: true };
    default:                return { rounds: null, spendFocus: false };
  }
}
