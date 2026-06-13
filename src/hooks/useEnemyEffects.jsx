import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { makeImmunityEntry, hasAbilityImmunity } from '../utils/immunity';

// Per-enemy conditions + ability-immunity timers (#260).
//
// Enemy initiative entries have no condition/effect store of their own — RK
// reveals live in cnmh_knowledge_global and Exploit Vulnerability only writes
// conditions onto the acting PC. Player-initiated skill actions (Demoralize
// first, Trip/Grapple later) need somewhere to land an enemy condition and the
// ability's per-target immunity, so this is a global map keyed by encounter
// entryId, mirroring the knowledge store:
//
//   cnmh_enemyfx_global = {
//     [entryId]: {
//       conditions: [{ id, value, source, ts }],
//       effects:    [ immunityEntry, ... ],   // self-expiring via expireAtSecs
//     }
//   }
//
// Immunity entries self-expire on read (hasAbilityImmunity ignores past entries),
// so no turn-sweep is needed; the whole map is wiped when the encounter ends
// (useEncounter.endEncounter), the same way knowledge is.

const ENEMY_FX_KEY = 'cnmh_enemyfx_global';

const emptyRecord = () => ({ conditions: [], effects: [] });

export const useEnemyEffects = () => {
  const [enemyFx, setEnemyFx] = useSyncedState(ENEMY_FX_KEY, {});

  const effectsFor = useCallback(
    (entryId) => enemyFx?.[entryId] || emptyRecord(),
    [enemyFx]
  );

  // Apply a condition to an enemy. Valued conditions (frightened) take the higher
  // of any existing value and the incoming one — a fresh Demoralize never reduces
  // a stronger fear already in play.
  const applyCondition = useCallback(
    (entryId, { id, value = null, source }) => {
      if (!entryId || !id) return;
      setEnemyFx((cur) => {
        const rec = cur?.[entryId] || emptyRecord();
        const existing = rec.conditions.find((c) => c.id === id);
        const nextValue = value != null && existing?.value != null
          ? Math.max(existing.value, value)
          : (value != null ? value : existing?.value ?? null);
        const entry = { id, value: nextValue, source: source || null, ts: Date.now() };
        const conditions = existing
          ? rec.conditions.map((c) => (c.id === id ? entry : c))
          : [...rec.conditions, entry];
        return { ...cur, [entryId]: { ...rec, conditions } };
      });
    },
    [setEnemyFx]
  );

  // Stamp an ability-immunity timer on an enemy (e.g. Demoralize's 10-minute
  // per-caster immunity). Reuses the #218 immunity entry shape.
  const stampImmunity = useCallback(
    (entryId, { abilityKey, abilityName, casterId, nowSecs, durationSecs }) => {
      if (!entryId || !abilityKey || !durationSecs) return;
      setEnemyFx((cur) => {
        const rec = cur?.[entryId] || emptyRecord();
        const entry = makeImmunityEntry({ abilityKey, abilityName, casterId, nowSecs, durationSecs });
        return { ...cur, [entryId]: { ...rec, effects: [...rec.effects, entry] } };
      });
    },
    [setEnemyFx]
  );

  const isImmune = useCallback(
    (entryId, { abilityKey, casterId, scope = 'any', nowSecs }) =>
      hasAbilityImmunity((enemyFx?.[entryId]?.effects) || [], { abilityKey, casterId, scope, nowSecs }),
    [enemyFx]
  );

  const clearAll = useCallback(() => setEnemyFx({}), [setEnemyFx]);

  return { enemyFx, effectsFor, applyCondition, stampImmunity, isImmune, clearAll };
};

export default useEnemyEffects;
