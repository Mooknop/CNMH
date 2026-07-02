// 'While playing' state (#935). Casting a Composition cantrip marks the caster
// as playing through the end of their NEXT turn — a sustained-performance flag
// that "while playing" item/feature effects (Vocoder of Invisibility, the Coda
// staves) can key off. Re-upping (another Composition cast on the next turn)
// overwrites the expiry one round further out; skipping a turn lets the
// turn-boundary sweep (turnEffects.js) lapse the state.
//
//   cnmh_playing_<charId> = { active, expireAt?, ts }
//
// Detection keys on the Composition trait, not a spell list, so future
// compositions count automatically. Out of an encounter there are no turns, so
// nothing is written — "while playing" stays a GM call there — and endEncounter
// clears any leftover flag.

import { resolveExpireAt } from './expiry';

export const PLAYING_IDLE = { active: false, ts: 0 };

const readLocal = (key) => {
  try { return JSON.parse(window.localStorage.getItem(key)); } catch { return null; }
};

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

export const isCompositionCast = (ability) =>
  !!(ability?.traits || []).includes('Composition');

/**
 * Mark the caster as playing through the end of their next turn. No-op unless
 * the ability carries the Composition trait and an encounter is in progress.
 * Logs only the idle→playing transition — a re-up on a later turn just
 * refreshes the expiry without a second line.
 *
 * @param {Object}   ability       - the cast spell/action (traits checked)
 * @param {Object}   caster        - { id, name }
 * @param {string}   casterEntryId - the caster's encounter entryId
 * @param {Object}   encounter     - current encounter (phase, round)
 * @param {Function} sendUpdate    - (charId, key, value) => void
 * @param {Function} appendLog     - ({ type, charId, text }) => void
 * @returns {boolean} whether the playing state was written
 */
export function markPlayingOnCast({ ability, caster, casterEntryId, encounter, sendUpdate, appendLog }) {
  if (!isCompositionCast(ability)) return false;
  if (encounter?.phase !== 'in-progress' || !casterEntryId || !caster?.id) return false;

  const key = `cnmh_playing_${caster.id}`;
  const prev = readLocal(key);
  const next = {
    active: true,
    expireAt: resolveExpireAt({ until: 'rounds', rounds: 1 }, encounter, casterEntryId),
    ts: Date.now(),
  };
  writeLocal(key, next);
  sendUpdate(caster.id, 'playing', next);
  if (!prev?.active) {
    appendLog?.({ type: 'action', charId: caster.id, text: `${caster.name} is playing (${ability.name})` });
  }
  return true;
}
