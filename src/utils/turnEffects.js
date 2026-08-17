// Turn-boundary side-effects (#443). React-free helpers shared by the two
// triggers that advance an encounter's turn:
//   • app-driven combats → useEncounter.advanceTurn / beginNextRound
//   • Foundry-driven combats → useEncounterTurnEffects (watches the bridge's
//     synced round/currentTurnIndex write-back)
// Keeping the logic here means both paths expire effects, granted actions and
// the playing state (#935) and apply Hymn fast healing identically, with a
// single source of truth.

import { isExpired } from './expiry';
import { hymnFastHealingFor, applyHymnFastHealing } from './hymnHealing';
import { readThrough, readThroughList } from './syncedRead';
import { getCondition } from '../data/pf2eConditions';
import { APP, GLOBAL_ID, syncKey, globalKey } from '../sync/keys';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

// Display name for an enemy-condition id: real PF2e condition, else a backing
// effect doc (on-hit markers like `limned` / `beacon-shot`), else the bare id —
// the same chain EnemyConditionBadge renders.
const conditionName = (id, effectCatalog) =>
  getCondition(id)?.name
    || (effectCatalog || []).find((e) => e.id === id)?.name
    || id;

/**
 * Sweep expired effects and granted actions from every PC in the order — plus
 * round-timed enemy conditions on cnmh_enemyfx_global (#1246 D) — given
 * the turn/round boundaries crossed by a transition. Writes the survivors back
 * and logs each expiry. React-free.
 *
 * @param {Array}    order        - encounter.order entries
 * @param {Array}    boundaries   - from boundariesCrossedBy / boundariesBetween
 * @param {Function} getState     - (charId, key) => value — REQUIRED, see below
 * @param {Function} sendUpdate   - (charId, key, value) => void
 * @param {Function} appendLog    - ({ type, text }) => void
 * @param {Array}    effectCatalog- DO-backed effect catalog (for display names)
 */
export function sweepExpiredOnBoundaries({ order, boundaries, getState, sendUpdate, appendLog, effectCatalog }) {
  // Hard requirement, not an optional upgrade. Falling back to localStorage when
  // no reader is supplied is precisely bug #1649, and its failure mode is a
  // silent no-op — the sweep reads an empty list and expires nothing, which no
  // caller would notice. Throwing makes a caller that forgets `getState` fail
  // immediately and unmistakably instead of half-working. Both real call sites
  // already hold it from useSession, alongside the `sendUpdate` they pass, and
  // applyTurnStartFastHealing below has taken the same pair all along.
  if (typeof getState !== 'function') {
    throw new TypeError('sweepExpiredOnBoundaries requires a getState reader (see #1649)');
  }

  for (const entry of order || []) {
    if (entry.kind !== 'pc' || !entry.charId) continue;

    // --- effects sweep ---
    const effects = readThroughList(getState, entry.charId, APP.EFFECTS);
    const keptFx = effects.filter((e) => !isExpired(e.expireAt, boundaries));
    if (keptFx.length !== effects.length) {
      writeLocal(syncKey(APP.EFFECTS, entry.charId), keptFx);
      sendUpdate(entry.charId, APP.EFFECTS, keptFx);
      effects
        .filter((e) => isExpired(e.expireAt, boundaries))
        .forEach((e) => {
          const def = (effectCatalog || []).find((d) => d.id === e.effectId);
          appendLog({ type: 'system', text: `${def?.name || e.effectId} expired on ${entry.name}` });
        });
    }

    // --- playing sweep (#935) ---
    // A Composition cast marks the caster playing through the end of their
    // next turn; without a re-up the state lapses on that boundary.
    const playing = readThrough(getState, entry.charId, APP.PLAYING);
    if (playing?.active && isExpired(playing.expireAt, boundaries)) {
      const idle = { active: false, ts: Date.now() };
      writeLocal(syncKey(APP.PLAYING, entry.charId), idle);
      sendUpdate(entry.charId, APP.PLAYING, idle);
      appendLog({ type: 'system', text: `${entry.name} stops playing` });
    }

    // --- granted actions sweep ---
    const grants = readThroughList(getState, entry.charId, APP.GRANTEDACTIONS);
    const keptGr = grants.filter((g) => !isExpired(g.expireAt, boundaries));
    if (keptGr.length !== grants.length) {
      writeLocal(syncKey(APP.GRANTEDACTIONS, entry.charId), keptGr);
      sendUpdate(entry.charId, APP.GRANTEDACTIONS, keptGr);
      grants
        .filter((g) => isExpired(g.expireAt, boundaries))
        .forEach((g) => {
          appendLog({ type: 'system', text: `${g.action?.name || g.source || 'Granted action'} expired for ${entry.name}` });
        });
    }
  }

  // --- enemy conditions sweep (#1246 D) ---
  // Round-timed enemy conditions carry the same expireAt shape on the global
  // cnmh_enemyfx_global map (see useEnemyEffects). Un-stamped conditions are
  // manual-clear-only and always survive; the whole map is wiped anyway by the
  // GM's end-encounter sweep (performEncounterGlobalSweep), so this filter is
  // idempotent and never fights it — nothing expired means no write at all.
  const enemyFx = readThrough(getState, GLOBAL_ID, APP.ENEMYFX);
  if (enemyFx && typeof enemyFx === 'object') {
    let changed = false;
    const next = {};
    for (const [entryId, rec] of Object.entries(enemyFx)) {
      const conditions = Array.isArray(rec?.conditions) ? rec.conditions : [];
      const kept = conditions.filter((c) => !isExpired(c?.expireAt, boundaries));
      if (kept.length !== conditions.length) {
        changed = true;
        const entryName = (order || []).find((e) => e.entryId === entryId)?.name || entryId;
        conditions
          .filter((c) => isExpired(c?.expireAt, boundaries))
          .forEach((c) => {
            const label = `${conditionName(c.id, effectCatalog)}${c.value != null ? ` ${c.value}` : ''}`;
            appendLog({ type: 'system', text: `${label} expired on ${entryName}` });
          });
        next[entryId] = { ...rec, conditions: kept };
      } else {
        next[entryId] = rec;
      }
    }
    if (changed) {
      writeLocal(globalKey(APP.ENEMYFX), next);
      sendUpdate(GLOBAL_ID, APP.ENEMYFX, next);
    }
  }
}

/**
 * The strongest generic `fastHealing` effect-modifier on a creature's active
 * effects (#899). Fast healing doesn't stack, so callers take the highest across
 * sources. A `fastHealing` modifier is a special (non-bonus) modifier — like
 * `dexCap` — so it carries no `kind`. Returns { amount, name } (name for the log).
 *
 * @param {Array} effects - the creature's active effect entries ([{ effectId }])
 * @param {Array} catalog - the effect catalog (defs carry the modifiers)
 */
export const effectFastHealing = (effects, catalog) => {
  let best = { amount: 0, name: null };
  for (const e of (Array.isArray(effects) ? effects : [])) {
    const def = (catalog || []).find((d) => d.id === e.effectId);
    const fh = (def?.modifiers || []).find((m) => m.stat === 'fastHealing');
    const amt = fh?.amount || 0;
    if (amt > best.amount) best = { amount: amt, name: def?.name || e.effectId };
  }
  return best;
};

/**
 * Apply fast healing to the entry whose turn is starting, from the strongest
 * source aimed at them (fast healing doesn't stack): Hymn of Healing across all
 * casters' sustain ledgers (#226), or a generic `fastHealing` effect-modifier on
 * their own active effects (#899 — e.g. Soothing Tonic). Read live, so ending the
 * sustain or expiring the effect stops the healing. React-free. Logs on heal.
 *
 * @param {Array}    order        - encounter.order entries (scanned for casters)
 * @param {Object}   startEntry   - the entry whose turn is starting
 * @param {Function} getState     - (charId, key) => value
 * @param {Function} sendUpdate   - (charId, key, value) => void
 * @param {Function} appendLog    - ({ type, text }) => void
 * @param {Array}    effectCatalog- effect catalog (resolves fastHealing modifiers)
 */
export function applyTurnStartFastHealing({ order, startEntry, getState, sendUpdate, appendLog, effectCatalog }) {
  if (!startEntry || startEntry.kind !== 'pc' || !startEntry.charId) return;
  const targetId = startEntry.charId;

  let amount = 0;
  let maxHp;
  let source = null;
  for (const entry of order || []) {
    if (entry.kind !== 'pc' || !entry.charId) continue;
    const sustains = getState(entry.charId, APP.SUSTAINS) || [];
    const fh = hymnFastHealingFor(sustains, targetId);
    if (fh > amount) {
      amount = fh;
      maxHp = sustains.find((s) => s.heal?.targetId === targetId)?.heal?.targetMaxHp;
      source = 'Hymn of Healing';
    }
  }

  // Generic fast-healing effect (#899) — the target's own active effects.
  const eff = effectFastHealing(getState(targetId, APP.EFFECTS) || [], effectCatalog);
  if (eff.amount > amount) {
    amount = eff.amount;
    maxHp = undefined; // fall back to the stored HP max
    source = eff.name;
  }

  if (amount <= 0) return;

  const healed = applyHymnFastHealing({
    getState, sendUpdate,
    target: { id: targetId, name: startEntry.name, maxHp },
    amount,
  });
  if (healed > 0) {
    appendLog({ type: 'system', text: `Fast healing ${amount} (${source}) — ${startEntry.name} +${healed} HP` });
  }
}
