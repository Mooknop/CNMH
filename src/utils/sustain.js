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
export const makeSustainEntry = ({ ability, round, castRank, heal, foundryAura }) => ({
  id:                 newEntryUid(),
  spellId:            ability?.id ?? null,
  spellName:          ability?.name || 'Spell',
  duration:           typeof ability?.duration === 'string' ? ability.duration : null,
  registeredRound:    round ?? null,
  lastSustainedRound: round ?? null,
  castRank:           typeof castRank === 'number' ? castRank : null,
  // Optional per-sustain payload (Hymn of Healing, #226): the heal target +
  // fast-healing/temp-HP amounts, so the turn-start fast-healing tick and the
  // Sustain prompt resolve healing straight off the ledger (no separate effect).
  ...(heal ? { heal } : {}),
  // Foundry-authoritative aura (#455): the effect ref + caster entry to re-clone
  // onto the caster when the spell is Sustained, so PF2e's aura engine refreshes
  // the buff and re-evaluates which allies are in range. Only set for sustained
  // spells whose foundryEffect is authoritative and applied while the bridge is up.
  ...(foundryAura ? { foundryAura } : {}),
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
 * @param {Object}   [heal]     - per-sustain heal payload (Hymn of Healing #226)
 * @param {Object}   [foundryAura] - { ref, casterEntryId } to re-clone the Foundry
 *                                   aura effect onto the caster on Sustain (#455)
 * @param {Function} getState   - (charId, key) => value
 * @param {Function} sendUpdate - (charId, key, value) => void
 * @param {Function} [appendLog]- ({ type, text }) => void
 */
export function registerSustain({ ability, caster, round, castRank, heal, foundryAura, getState, sendUpdate, appendLog }) {
  if (!isSustainedSpell(ability) || !caster?.id) return;
  const current = getState(caster.id, 'sustains') || [];
  const entry = makeSustainEntry({ ability, round, castRank, heal, foundryAura });
  const next = [...current, entry];
  writeLocal(`cnmh_sustains_${caster.id}`, next);
  sendUpdate(caster.id, 'sustains', next);
  appendLog?.({
    type: 'system',
    text: `${caster.name} is sustaining ${entry.spellName}`,
  });
}
