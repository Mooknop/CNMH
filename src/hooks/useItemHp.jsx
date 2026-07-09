import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import {
  durabilityFor,
  applyItemDamage,
  restoreItemHp,
  isBrokenHp,
  isDestroyedHp,
} from '../utils/itemDurability';
import { APP, syncKey } from '../sync/keys';

// Live item-HP overlay (#541) — the durability epic's tracking model.
//
//   cnmh_itemhp_<charId> = { [uid]: { hp } }
//
// Keyed by inventory-entry uid; an item with no record is at its authored max
// (durabilityFor). Shields lived on cnmh_shieldstate_<charId> before this epic
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

  const setHp = useCallback(
    (uid, hp) => setItemHpState((cur) => ({ ...(cur || {}), [uid]: { hp } })),
    [setItemHpState]
  );

  // Full durability status for a resolved inventory entry, or null for items
  // the engine doesn't track. `hp` is live; `maxHp` is the authored full value.
  const statusFor = useCallback(
    (entry) => {
      const dur = durabilityFor(entry);
      if (!dur) return null;
      const hp = hpFor(entry?.uid) ?? dur.hp;
      return {
        hp,
        maxHp: dur.hp,
        hardness: dur.hardness,
        brokenThreshold: dur.brokenThreshold,
        broken: isBrokenHp(hp, dur.brokenThreshold),
        destroyed: isDestroyedHp(hp),
      };
    },
    [hpFor]
  );

  // Apply one instance of damage (reduced by Hardness) and persist the new HP.
  // Returns the applyItemDamage result, or null for untracked items.
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
      });
      setHp(entry.uid, result.hpAfter);
      return result;
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

  return { itemHpState, hpFor, setHp, statusFor, applyDamage, repairItem };
};

export default useItemHp;
