import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import {
  entryHpStatus,
  applyItemDamage,
  restoreItemHp,
} from '../utils/itemDurability';
import { APP, syncKey } from '../sync/keys';

// Live item-HP overlay (#541) — the durability epic's tracking model.
//
//   cnmh_itemhp_<charId> = { [uid]: { hp, tempHp? } }
//
// Keyed by inventory-entry uid; an item with no record is at its authored max
// (durabilityFor). `tempHp` (#1246 — Heartstone) is a temporary pool spent
// before HP by applyItemDamage; it rides the same record so one write covers
// both. Shields lived on cnmh_shieldstate_<charId> before this epic
// generalized the model — reads fall back to that legacy key so shield damage
// recorded mid-migration isn't lost, but every write lands on cnmh_itemhp_.
export const useItemHp = (charId) => {
  const [itemHpState, setItemHpState] = useSyncedState(
    syncKey(APP.ITEMHP, charId || 'none'),
    {}
  );
  const [legacyShieldState] = useSyncedState(
    syncKey(APP.SHIELDSTATE, charId || 'none'),
    {}
  );

  // Live HP for an entry uid, or undefined when nothing has been recorded
  // (caller falls back to the authored max).
  const hpFor = useCallback(
    (uid) => itemHpState?.[uid]?.hp ?? legacyShieldState?.[uid]?.hp,
    [itemHpState, legacyShieldState]
  );

  // Live temporary-HP pool for an entry uid (#1246 — Heartstone). 0 when none.
  const tempHpFor = useCallback(
    (uid) => Math.max(0, itemHpState?.[uid]?.tempHp ?? 0),
    [itemHpState]
  );

  // Persist an entry's HP. A third argument sets the temp-HP pool in the same
  // record; omitted, any existing pool is preserved (so Repair and legacy
  // callers never silently drop it). A pool at 0 falls off the record.
  const setHp = useCallback(
    (uid, hp, tempHp) =>
      setItemHpState((cur) => {
        const t = tempHp === undefined ? cur?.[uid]?.tempHp : tempHp;
        return { ...(cur || {}), [uid]: { hp, ...(t > 0 ? { tempHp: t } : {}) } };
      }),
    [setItemHpState]
  );

  // Full durability status for a resolved inventory entry, or null for items
  // the engine doesn't track. `hp` is live; `maxHp` is the authored full value.
  const statusFor = useCallback(
    (entry) => {
      const hp = hpFor(entry?.uid);
      const tempHp = tempHpFor(entry?.uid);
      return entryHpStatus(entry, hp !== undefined || tempHp > 0 ? { hp: hp ?? undefined, tempHp } : undefined);
    },
    [hpFor, tempHpFor]
  );

  // Apply one instance of damage (reduced by Hardness; the temp-HP pool absorbs
  // its share first) and persist the new HP. Returns the applyItemDamage
  // result, or null for untracked items.
  const applyDamage = useCallback(
    (entry, dealt, { hardnessBonus = 0 } = {}) => {
      const status = statusFor(entry);
      if (!status || !entry?.uid) return null;
      const result = applyItemDamage({
        dealt,
        hardness: status.hardness,
        hp: status.hp,
        brokenThreshold: status.brokenThreshold,
        hardnessBonus,
        tempHp: status.tempHp,
      });
      setHp(entry.uid, result.hpAfter, result.tempHpAfter);
      return result;
    },
    [statusFor, setHp]
  );

  // Grant temporary HP to an item (#1246 — Heartstone). Temp HP don't stack:
  // take the higher of the existing pool and the grant (the character-side
  // convention, hymnHealing.grantTempHp). Returns the new pool, or null for
  // untracked items / non-positive amounts.
  const grantTempHp = useCallback(
    (entry, amount) => {
      const status = statusFor(entry);
      if (!status || !entry?.uid || !(amount > 0)) return null;
      const next = Math.max(status.tempHp || 0, amount);
      setHp(entry.uid, status.hp, next);
      return next;
    },
    [statusFor, setHp]
  );

  // Restore HP toward the authored max (Repair, Rust Scrub, …). Destroyed
  // items can't be Repaired — callers gate on status.destroyed. Returns the
  // new HP, or null for untracked items / non-positive amounts.
  const repairItem = useCallback(
    (entry, amount) => {
      const status = statusFor(entry);
      if (!status || !entry?.uid || !(amount > 0)) return null;
      const next = restoreItemHp({ hp: status.hp, maxHp: status.maxHp, amount });
      setHp(entry.uid, next);
      return next;
    },
    [statusFor, setHp]
  );

  return { itemHpState, hpFor, tempHpFor, setHp, statusFor, applyDamage, repairItem, grantTempHp };
};

export default useItemHp;
