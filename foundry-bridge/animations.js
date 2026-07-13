// Feature: play canvas animations for app abilities (#1415, epic #1414).
//
// The app emits cnmh_fxplay_global = { id, shape, file, source, targets:
// [entryId | {x,y}], opts?, ts } — a RESOLVED recipe: the app-side animation
// catalog (content) picks shape + file (a Sequencer database key, e.g.
// "jb2a.melee_generic.slashing.one_handed"); the bridge only interprets the
// shape. v1 shapes:
//   melee      — swing on each target, rotated along the attack line
//   projectile — effect stretched from the source to each target
// Target entries are combatant entryIds or raw {x,y} canvas points — the point
// form is in the wire contract now so AoE templates later don't change the
// payload shape.
//
// Fire-and-forget juice: unknown shape / missing file / unresolved tokens are
// silent no-ops, and a Sequencer-less world logs ONE warning, never a
// per-event throw. Dispatch only sees LIVE UPDATEs (FULL_STATE never replays
// fxplay), so a bridge that connects late simply misses the animation —
// nothing gates on this channel. All Foundry access goes through
// pf2eAdapter.js.

import {
  resolveCombatantToken, sequencerAvailable, playMeleeEffect, playProjectileEffect,
} from './pf2eAdapter.js';

let _warnedNoSequencer = false;

// Test helper: reset the warn-once latch between cases.
export function _resetSequencerWarning() {
  _warnedNoSequencer = false;
}

const isPoint = (t) =>
  !!t && typeof t === 'object' && typeof t.x === 'number' && typeof t.y === 'number';

// entryId → combatant token; {x,y} passes through untouched; anything else null.
function resolveTargetRef(ref) {
  if (isPoint(ref)) return ref;
  if (typeof ref === 'string') return resolveCombatantToken(ref);
  return null;
}

// The shape vocabulary. Each entry plays ONE target; handleFxPlay loops the
// target list. New shapes are added here (and in the adapter) only when an
// animation family genuinely can't be expressed with the existing ones — the
// catalog of WHICH ability plays WHAT is app-side content, never bridge code.
const SHAPES = {
  melee: (file, sourceToken, target, opts) => playMeleeEffect(file, sourceToken, target, opts),
  projectile: (file, sourceToken, target, opts) => playProjectileEffect(file, sourceToken, target, opts),
};

// Called by bridge.js when cnmh_fxplay_global arrives.
export async function handleFxPlay(value) {
  const { shape, file, source, targets, opts } = value || {};
  const play = SHAPES[shape];
  if (!play || typeof file !== 'string' || !file) return;

  if (!sequencerAvailable()) {
    if (!_warnedNoSequencer) {
      console.warn('CNMH Bridge | fxplay: Sequencer module not active — animations disabled');
      _warnedNoSequencer = true;
    }
    return;
  }

  const sourceToken = typeof source === 'string' ? resolveCombatantToken(source) : null;
  if (!sourceToken) return;

  for (const ref of Array.isArray(targets) ? targets : []) {
    const target = resolveTargetRef(ref);
    if (!target) continue;
    try {
      await play(file, sourceToken, target, opts || {});
    } catch (err) {
      console.error('CNMH Bridge | fxplay failed:', err);
    }
  }
}
