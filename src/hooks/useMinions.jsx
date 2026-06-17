import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';

// Allied-minion live state (#261) — companion/familiar HP and conditions that the
// owner sheet, the GM HP-adjust modal, and the encounter share. Synced so the GM
// and players see the same numbers and they survive reload:
//   cnmh_minions_<ownerId> = { [role]: { hp: { current, max, temp }, conditions: [{ id, value }], flags } }
// Roles are the slugs from minionUtils (each PC has at most one of each). State
// is lazy: until something writes, HP reads back the max authored in character
// data and conditions read back empty, so no eager write is needed just to
// display a full-HP, unafflicted minion.

const EMPTY_MINIONS = {};
const EMPTY_CONDITIONS = [];

export const useMinions = (ownerId) => {
  const [minions, setMinions] = useSyncedState(
    `cnmh_minions_${ownerId || 'none'}`,
    EMPTY_MINIONS
  );

  // Current HP for a role, falling back to the authored max when unset. Max
  // tracks the latest data value (so a data bump isn't masked by a stale store);
  // current is clamped to it.
  const getHp = useCallback(
    (role, maxFromData) => {
      const stored = minions?.[role]?.hp;
      const max = maxFromData ?? stored?.max ?? 0;
      if (stored) {
        return { current: Math.min(stored.current ?? max, max), max, temp: stored.temp || 0 };
      }
      return { current: max, max, temp: 0 };
    },
    [minions]
  );

  const setHp = useCallback(
    (role, hp) =>
      setMinions((cur) => {
        const base = cur || {};
        return { ...base, [role]: { ...(base[role] || {}), hp } };
      }),
    [setMinions]
  );

  // Damage absorbs temp HP first, then clamps current at 0 (mirrors AdjustHpModal).
  const damage = useCallback(
    (role, n, maxFromData) => {
      const hp = getHp(role, maxFromData);
      const tempAbsorb = Math.min(hp.temp || 0, n);
      const remainder = n - tempAbsorb;
      setHp(role, {
        ...hp,
        temp: (hp.temp || 0) - tempAbsorb,
        current: Math.max(0, hp.current - remainder),
      });
    },
    [getHp, setHp]
  );

  const heal = useCallback(
    (role, n, maxFromData) => {
      const hp = getHp(role, maxFromData);
      setHp(role, { ...hp, current: Math.min(hp.max, hp.current + n) });
    },
    [getHp, setHp]
  );

  // Active conditions for a role, lazily empty until something writes. Each entry
  // is the ConditionModal shape ({ id, value, valued, maxValue, ... }).
  const getConditions = useCallback(
    (role) => minions?.[role]?.conditions || EMPTY_CONDITIONS,
    [minions]
  );

  // Merge a role's condition list into the combined object without touching the
  // other role or that role's hp/flags (same discipline as setHp).
  const setConditions = useCallback(
    (role, list) =>
      setMinions((cur) => {
        const base = cur || {};
        return { ...base, [role]: { ...(base[role] || {}), conditions: list } };
      }),
    [setMinions]
  );

  return { minions: minions || EMPTY_MINIONS, getHp, setHp, damage, heal, getConditions, setConditions };
};

export default useMinions;
