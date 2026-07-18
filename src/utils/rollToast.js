// Roll-toast payload builder (#1490 S3). A resolved actor-roll rides the
// confirm-time 'ability' fx event (cnmh_fx_global ring buffer) as a compact
// `roll` field so every device can toast the die + outcome — delegated and
// manually-typed d20s alike (confirm doesn't care how the face arrived).
// Null when there was no resolved roll (target-save, no targets, no d20):
// the event then stays exactly the pre-S3 shape.

export const ROLL_TOAST_TARGET_CAP = 4;

// { d20, total, flavor, attack, targets:[{ name, degree }], more } — capped
// and degree-filtered so the fx buffer entry stays small (the channel is a
// synced ring buffer, not a log).
export function buildRollFx({ d20, flavor, results, attack }) {
  if (typeof d20 !== 'number' || !Array.isArray(results) || results.length === 0) return null;
  const judged = results.filter((r) => r && r.degree);
  return {
    d20,
    total: typeof results[0]?.total === 'number' ? results[0].total : null,
    flavor: flavor || '',
    attack: !!attack,
    targets: judged
      .slice(0, ROLL_TOAST_TARGET_CAP)
      .map((r) => ({ name: r.name || '', degree: r.degree })),
    more: Math.max(0, judged.length - ROLL_TOAST_TARGET_CAP),
  };
}
