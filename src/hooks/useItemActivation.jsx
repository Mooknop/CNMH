// useItemActivation — the actuated-item activation state machine (#957 S4).
//
// Scepters (and future scepter-like items) carry an `actuated` block:
//   item.actuated = {
//     name:        string,   // ability name (e.g. "Energy Abjection")
//     minRank:     number,   // minimum spell-slot rank to activate; exact rank to repair
//     frequency?:  string,   // parseable freq text; defaults to "once per day"
//     actionCount?: number,  // display only
//     traits?:     string[],
//     description?: string,
//   }
//
// The activation cost is a spell-slot sacrifice of >= minRank (S3). It is once
// per day (the shared freq ledger). Once the daily use is spent, the wielder may
// Overload to fire it again — a DC 10 flat check that breaks the item either way
// (S4). Broken blocks the ability until repaired; repair (Repair action or a
// minimum-rank slot sacrifice) is gated until the next daily prep unlocks it.
import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { useFrequency } from './useFrequency';
import { useSlotSacrifice } from './useSlotSacrifice';
import { itemUidOf } from '../utils/affix';
import {
  itemBrokenKey, isItemBroken, isRepairable, breakItem, repairItem,
} from '../utils/itemBroken';
import { rollOverload } from '../utils/overload';

/**
 * @param {Object|null} character - raw character object
 * @param {Object|null} item      - item with an optional `actuated` block
 * @param {{ nowSecs?: number }} [ctx] - current game seconds (once/day gate)
 */
export const useItemActivation = (character, item, { nowSecs } = {}) => {
  const charId = character?.id || 'unknown';
  const actuated = item?.actuated || null;
  const uid = itemUidOf(item);
  const minRank = actuated?.minRank || 1;

  const { gateFor, record } = useFrequency(charId);
  const [broken, setBroken] = useSyncedState(itemBrokenKey(charId), {});
  const slots = useSlotSacrifice(character, { minRank });

  // A synthetic ability so the freq engine keys this activation per item.
  const freqAbility = useMemo(
    () => ({
      id: uid ? `${uid}:actuated` : null,
      name: actuated?.name,
      frequency: actuated?.frequency || 'once per day',
    }),
    [uid, actuated]
  );

  const gate = gateFor(freqAbility, { nowSecs });
  const isBroken = isItemBroken(broken, uid);
  const repairable = isRepairable(broken, uid);

  // Pick the rank to spend: caller's choice, else the lowest eligible.
  const chooseRank = useCallback(
    (rank) => (rank != null ? Number(rank) : slots.options[0]?.rank),
    [slots.options]
  );

  const canActivate = !!actuated && !isBroken && gate.available && slots.canSacrifice;
  const activate = useCallback(
    (rank) => {
      if (!actuated || isBroken || !gate.available) return { ok: false };
      const sac = slots.sacrifice(chooseRank(rank));
      if (!sac.ok) return { ok: false };
      record(freqAbility, { nowSecs });
      return { ok: true, rank: sac.rank, label: sac.label };
    },
    [actuated, isBroken, gate.available, slots, chooseRank, record, freqAbility, nowSecs]
  );

  // Overload is offered only after the daily use is spent. The slot cost is paid
  // up front (attempting the actuated effect); the item breaks on success AND on
  // failure — `success` says whether the effect actually resolves.
  const canOverload = !!actuated && !isBroken && !gate.available && slots.canSacrifice;
  const overload = useCallback(
    (rank, rng) => {
      if (!actuated || isBroken || gate.available) return { ok: false };
      const sac = slots.sacrifice(chooseRank(rank));
      if (!sac.ok) return { ok: false };
      const check = rollOverload(rng);
      setBroken((cur) => breakItem(cur, uid));
      return { ok: true, rank: sac.rank, label: sac.label, ...check };
    },
    [actuated, isBroken, gate.available, slots, chooseRank, setBroken, uid]
  );

  // Repair — only when broken AND unlocked by a daily prep. Repair action clears
  // it for free; the slot path spends a minimum-rank slot.
  const minRankSlotAvailable = slots.options.some((o) => o.rank === minRank);
  const repairWithAction = useCallback(() => {
    if (!isBroken || !repairable) return { ok: false };
    setBroken((cur) => repairItem(cur, uid));
    return { ok: true };
  }, [isBroken, repairable, setBroken, uid]);

  const repairWithSlot = useCallback(() => {
    if (!isBroken || !repairable) return { ok: false };
    const sac = slots.sacrifice(minRank);
    if (!sac.ok) return { ok: false };
    setBroken((cur) => repairItem(cur, uid));
    return { ok: true, rank: sac.rank, label: sac.label };
  }, [isBroken, repairable, slots, minRank, setBroken, uid]);

  return {
    actuated,
    minRank,
    gate,
    broken: isBroken,
    repairable,
    slotOptions: slots.options,
    activation: { canActivate, activate, disabledReason: slots.disabledReason },
    overload: { canOverload, overload },
    repair: { repairable, minRankSlotAvailable, withAction: repairWithAction, withSlot: repairWithSlot },
  };
};

export default useItemActivation;
