// Turn-boundary side-effects (#443). React-free helpers shared by the two
// triggers that advance an encounter's turn:
//   • app-driven combats → useEncounter.advanceTurn / beginNextRound
//   • Foundry-driven combats → useEncounterTurnEffects (watches the bridge's
//     synced round/currentTurnIndex write-back)
// Keeping the logic here means both paths expire effects + granted actions and
// apply Hymn fast healing identically, with a single source of truth.

import { isExpired } from './expiry';
import { hymnFastHealingFor, applyHymnFastHealing } from './hymnHealing';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

const readLocal = (key) => {
  try { return JSON.parse(window.localStorage.getItem(key)) || []; } catch { return []; }
};

/**
 * Sweep expired effects and granted actions from every PC in the order, given
 * the turn/round boundaries crossed by a transition. Writes the survivors back
 * and logs each expiry. React-free.
 *
 * @param {Array}    order        - encounter.order entries
 * @param {Array}    boundaries   - from boundariesCrossedBy / boundariesBetween
 * @param {Function} sendUpdate   - (charId, key, value) => void
 * @param {Function} appendLog    - ({ type, text }) => void
 * @param {Array}    effectCatalog- DO-backed effect catalog (for display names)
 */
export function sweepExpiredOnBoundaries({ order, boundaries, sendUpdate, appendLog, effectCatalog }) {
  for (const entry of order || []) {
    if (entry.kind !== 'pc' || !entry.charId) continue;

    // --- effects sweep ---
    const effects = readLocal(`cnmh_effects_${entry.charId}`);
    const keptFx = effects.filter((e) => !isExpired(e.expireAt, boundaries));
    if (keptFx.length !== effects.length) {
      writeLocal(`cnmh_effects_${entry.charId}`, keptFx);
      sendUpdate(entry.charId, 'effects', keptFx);
      effects
        .filter((e) => isExpired(e.expireAt, boundaries))
        .forEach((e) => {
          const def = (effectCatalog || []).find((d) => d.id === e.effectId);
          appendLog({ type: 'system', text: `${def?.name || e.effectId} expired on ${entry.name}` });
        });
    }

    // --- granted actions sweep ---
    const grants = readLocal(`cnmh_grantedactions_${entry.charId}`);
    const keptGr = grants.filter((g) => !isExpired(g.expireAt, boundaries));
    if (keptGr.length !== grants.length) {
      writeLocal(`cnmh_grantedactions_${entry.charId}`, keptGr);
      sendUpdate(entry.charId, 'grantedactions', keptGr);
      grants
        .filter((g) => isExpired(g.expireAt, boundaries))
        .forEach((g) => {
          appendLog({ type: 'system', text: `${g.action?.name || g.source || 'Granted action'} expired for ${entry.name}` });
        });
    }
  }
}

/**
 * Apply Hymn of Healing fast healing to the entry whose turn is starting, using
 * the strongest Hymn aimed at them across all casters' sustain ledgers (read
 * live, so ending the sustain stops the healing). React-free. Logs on heal.
 *
 * @param {Array}    order      - encounter.order entries (scanned for casters)
 * @param {Object}   startEntry - the entry whose turn is starting
 * @param {Function} getState   - (charId, key) => value
 * @param {Function} sendUpdate - (charId, key, value) => void
 * @param {Function} appendLog  - ({ type, text }) => void
 */
export function applyTurnStartFastHealing({ order, startEntry, getState, sendUpdate, appendLog }) {
  if (!startEntry || startEntry.kind !== 'pc' || !startEntry.charId) return;
  const targetId = startEntry.charId;

  let amount = 0;
  let maxHp;
  for (const entry of order || []) {
    if (entry.kind !== 'pc' || !entry.charId) continue;
    const sustains = getState(entry.charId, 'sustains') || [];
    const fh = hymnFastHealingFor(sustains, targetId);
    if (fh > amount) {
      amount = fh;
      maxHp = sustains.find((s) => s.heal?.targetId === targetId)?.heal?.targetMaxHp;
    }
  }
  if (amount <= 0) return;

  const healed = applyHymnFastHealing({
    getState, sendUpdate,
    target: { id: targetId, name: startEntry.name, maxHp },
    amount,
  });
  if (healed > 0) {
    appendLog({ type: 'system', text: `Fast healing ${amount} (Hymn of Healing) — ${startEntry.name} +${healed} HP` });
  }
}
