// Sustained-spell tracking (#220). A spell whose free-text `duration` mentions
// "sustain" registers a sustain entry on the caster's per-character ledger
// (`cnmh_sustains_<charId>`). The turn tracker prompts the caster to Sustain a
// Spell (1 action) at the start of each of their turns; declining or forgetting
// (submitting the turn without sustaining) ends the spell.
//
// React-free: registerSustain takes getState / sendUpdate / appendLog as plain
// arguments, mirroring the applyAbility pattern, so the cast modal can call it
// directly on confirm without owning the synced state.
import { newEntryUid } from './uid';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

// A spell counts as sustained when its (free-text) duration mentions "sustain".
export const isSustainedSpell = (ability) =>
  typeof ability?.duration === 'string' && /sustain/i.test(ability.duration);

// Build the ledger entry. `lastSustainedRound` starts at the cast round so the
// spell isn't asked to be sustained on the very turn it's cast — it lapses only
// once a later turn passes without a sustain. `spellId`/`castRank` let the GM's
// Add-summon flow (#261) default a summon's level off the spell's heightening.
export const makeSustainEntry = ({ ability, round, castRank }) => ({
  id:                 newEntryUid(),
  spellId:            ability?.id ?? null,
  spellName:          ability?.name || 'Spell',
  duration:           typeof ability?.duration === 'string' ? ability.duration : null,
  registeredRound:    round ?? null,
  lastSustainedRound: round ?? null,
  castRank:           typeof castRank === 'number' ? castRank : null,
  ts:                 Date.now(),
});

/**
 * Register a sustained spell on the caster's ledger. No-op for non-sustained
 * spells. The caller gates this on an in-progress encounter (sustains are
 * prompted at the caster's turn start, which only exists in combat).
 *
 * @param {Object}   ability    - the cast spell { id, name, duration }
 * @param {Object}   caster     - { id, name }
 * @param {number}   round      - current encounter round
 * @param {number}   [castRank] - rank the spell was cast at (for summon heightening)
 * @param {Function} getState   - (charId, key) => value
 * @param {Function} sendUpdate - (charId, key, value) => void
 * @param {Function} [appendLog]- ({ type, text }) => void
 */
export function registerSustain({ ability, caster, round, castRank, getState, sendUpdate, appendLog }) {
  if (!isSustainedSpell(ability) || !caster?.id) return;
  const current = getState(caster.id, 'sustains') || [];
  const entry = makeSustainEntry({ ability, round, castRank });
  const next = [...current, entry];
  writeLocal(`cnmh_sustains_${caster.id}`, next);
  sendUpdate(caster.id, 'sustains', next);
  appendLog?.({
    type: 'system',
    text: `${caster.name} is sustaining ${entry.spellName}`,
  });
}
