// Per-spell counter state (#220). Some spells track a small number that changes
// over their duration: Mirror Image's remaining images (3 → … → 0, ends at 0)
// and Bless's emanation radius (grows by 10 ft each Sustain). A spell opts in
// with a `spellState` config; casting it registers an entry on the caster's
// counter ledger (`cnmh_spellcounters_<charId>`), surfaced in EffectsPanel.
//
// React-free, mirroring registerSustain / applyAbility: the cast modal passes
// getState / sendUpdate as plain args.
import { newEntryUid } from './uid';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

const COUNTER_KINDS = ['images', 'emanation'];

// `spellState` config shape: { kind: 'images'|'emanation', start, step?, unit?,
//   min?, endAtMin? }. A spell counts as a counter spell when it carries one.
export const hasSpellCounter = (ability) =>
  !!ability?.spellState
  && typeof ability.spellState === 'object'
  && COUNTER_KINDS.includes(ability.spellState.kind);

// Build the ledger entry from the spell's `spellState` config, applying the
// per-kind defaults (images pop one at a time and end at zero; emanations grow).
export const makeCounterEntry = ({ ability, round }) => {
  const cfg = ability.spellState || {};
  const min = Number.isFinite(Number(cfg.min)) ? Number(cfg.min) : 0;
  return {
    id:              newEntryUid(),
    spellName:       ability?.name || 'Spell',
    kind:            cfg.kind,
    value:           Number(cfg.start) || 0,
    step:            Number(cfg.step) || (cfg.kind === 'emanation' ? 10 : 1),
    unit:            cfg.unit || (cfg.kind === 'images' ? 'images' : 'ft'),
    min,
    endAtMin:        cfg.endAtMin === true || cfg.kind === 'images',
    registeredRound: round ?? null,
    ts:              Date.now(),
  };
};

/**
 * Register a counter spell on the caster's ledger. No-op for spells without a
 * `spellState` config. Unlike sustains, counters aren't turn-bound — they're
 * registered on any cast (in or out of an encounter) and cleared at daily prep.
 *
 * @param {Object}   ability    - the cast spell (with `spellState`)
 * @param {Object}   caster     - { id, name }
 * @param {number}   [round]    - current encounter round (metadata only)
 * @param {Function} getState   - (charId, key) => value
 * @param {Function} sendUpdate - (charId, key, value) => void
 */
export function registerSpellCounter({ ability, caster, round, getState, sendUpdate }) {
  if (!hasSpellCounter(ability) || !caster?.id) return;
  const current = getState(caster.id, 'spellcounters') || [];
  const entry = makeCounterEntry({ ability, round });
  const next = [...current, entry];
  writeLocal(`cnmh_spellcounters_${caster.id}`, next);
  sendUpdate(caster.id, 'spellcounters', next);
}
