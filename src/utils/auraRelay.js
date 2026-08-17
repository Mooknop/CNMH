// Aura-emanation relay contract (#1733 S1 app half) — mirrors the app-only
// `cnmh_aura_<charId>` activation state (`useAura`) to Foundry as a
// charId-keyed `auraset` so the bridge can draw/move/remove a token-attached
// emanation Region. See foundry-bridge/README.md's `auraset` row (the binding
// contract, #1733 S1 bridge half — PR #1767) for the full payload/behaviour
// spec, including the "no fallback radius" ruling this builder leans on.
//
//   app → bridge  cnmh_auraset_<charId>  { active, feet?, label?, color?, ts }
//
// Follows the builder-in-utils / wiring-in-hooks split `snapshotRelay.js`
// uses: this file is pure (no React, no relay I/O) — `useAuraRegionSync`
// (hooks/) owns deciding WHEN to call it and actually sending. The app-only
// `cnmh_aura_<charId>` key stays authoritative for impulse gating
// (`useAuraGate`) regardless of what this mirror does — a disconnected or
// pre-protocol-19 bridge changes zero app-side behaviour.

// Per-rail protocol floor (#1733 S1). Independent of the shared
// `PROTOCOL_VERSION` bump the bridge half of this contract owns
// (`foundry-bridge/syncKeys.js`) — this is simply the version this app
// requires before it starts mirroring.
export const AURA_PROTOCOL = 19;

/**
 * Build an `auraset` payload. `feet` is the aura's authored radius
 * (`auraProfile`, `utils/kineticAura.js`) — omit it (or pass null/undefined)
 * for a deactivation, where it carries no meaning. Callers must never invoke
 * this with `active: true` and no `feet` — an aura with no authored size is
 * never sent at all (#1733 ruling 2, no fallback radius); that check belongs
 * at the call site (`useAuraRegionSync`), not here.
 *
 * @param {Object}  opts
 * @param {boolean} opts.active
 * @param {number}  [opts.feet]
 * @param {string}  [opts.label]
 * @param {string}  [opts.color]
 * @returns {{active:boolean, feet?:number, label?:string, color?:string, ts:number}}
 */
export function buildAuraSet({ active, feet, label, color } = {}) {
  return {
    active: !!active,
    ...(feet != null ? { feet: Number(feet) } : {}),
    ...(label ? { label } : {}),
    ...(color ? { color } : {}),
    ts: Date.now(),
  };
}
