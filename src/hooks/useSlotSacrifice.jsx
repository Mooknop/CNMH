// useSlotSacrifice — a reusable "expend a spell slot of rank within [minRank,
// maxRank]" cost (#957 S3), for item activations (scepters #965) that pay with a
// spell slot rather than casting a spell. Built on `useCastingResources.slots`
// so it shares the single `cnmh_slots_<charId>` ledger — a sacrifice here and a
// cast elsewhere both draw from the same pool.
import { useCallback, useMemo } from 'react';
import { useCastingResources } from './useCastingResources';
import {
  eligibleSacrificeRanks,
  slotSacrificeLabel,
  noEligibleSlotReason,
} from '../utils/slotSacrifice';

/**
 * @param {Object|null} character - raw character object
 * @param {{minRank?:number, maxRank?:number}} [bounds]
 * @returns {{
 *   options: Array<{ rank:number, remaining:number, label:string }>,
 *   canSacrifice: boolean,
 *   disabledReason: string|null,
 *   sacrifice: (rank:number) => { ok:boolean, rank:number|null, label:string|null },
 * }}
 */
export const useSlotSacrifice = (character, { minRank = 1, maxRank = Infinity } = {}) => {
  const { slots } = useCastingResources(character);
  const { totals, remainingFor, spend } = slots;

  const ranks = useMemo(
    () => eligibleSacrificeRanks(totals, remainingFor, { minRank, maxRank }),
    [totals, remainingFor, minRank, maxRank]
  );

  const options = useMemo(
    () => ranks.map((rank) => {
      const remaining = remainingFor(rank);
      return { rank, remaining, label: `Rank ${rank} slot (${remaining} left)` };
    }),
    [ranks, remainingFor]
  );

  const sacrifice = useCallback(
    (rank) => {
      const r = Number(rank);
      if (!ranks.includes(r) || remainingFor(r) <= 0) {
        return { ok: false, rank: null, label: null };
      }
      spend(r);
      return { ok: true, rank: r, label: slotSacrificeLabel(r) };
    },
    [ranks, remainingFor, spend]
  );

  const canSacrifice = ranks.length > 0;
  const disabledReason = canSacrifice ? null : noEligibleSlotReason(minRank, maxRank);

  return { options, canSacrifice, disabledReason, sacrifice };
};

export default useSlotSacrifice;
