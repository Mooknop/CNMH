import { useCallback } from 'react';
import { useRecallKnowledge } from './useRecallKnowledge';
import { useEncounter } from './useEncounter';
import {
  rkKeyFor,
  revealFromDamage,
  newlyRevealedFromDamage,
} from '../utils/recallKnowledge';

// Reveal-on-trigger for monster IWR (#1014). The damage step factors a
// Foundry-imported enemy's own immunities/weaknesses/resistances silently;
// when a hidden IWR actually modifies applied damage the players just learned
// it at the table, so the commit handlers (UseAbilityModal confirm, minion
// strike log, save-request resolve) call this with the per-target results to
// stamp the fired types into the creature's Recall Knowledge record. First
// reveal of a type gets an encounter-log announcement; repeat triggers stay
// quiet (the merge itself is idempotent, so duplicate writes are harmless).
export const useIwrReveal = () => {
  const { recordFor, mergeRecord } = useRecallKnowledge();
  const { encounter, appendLog } = useEncounter();

  // `results`: flat [{ entryId, damage }] — damage is a computeTargetDamage /
  // computeSaveDamage result (its `iwr` field lists what fired, if anything).
  const revealFiredIwr = useCallback((results) => {
    const byKey = new Map(); // rk key → { name, fired }
    for (const r of results || []) {
      const fired = r?.damage?.iwr;
      if (!fired?.length || !r.entryId) continue;
      const entry = (encounter?.order || []).find((e) => e.entryId === r.entryId);
      if (!entry || entry.kind !== 'enemy') continue;
      const key = rkKeyFor(entry);
      if (!key) continue;
      const cur = byKey.get(key) || { name: entry.name, fired: [] };
      cur.fired.push(...fired);
      byKey.set(key, cur);
    }
    byKey.forEach(({ name, fired }, key) => {
      const fresh = newlyRevealedFromDamage(recordFor(key), fired);
      mergeRecord(key, (prev) => revealFromDamage(prev, fired));
      fresh.forEach(({ kind, type }) => {
        appendLog({
          type: 'system',
          text: `${name}'s ${kind} to ${type} is revealed!`,
        });
      });
    });
  }, [encounter, recordFor, mergeRecord, appendLog]);

  return { revealFiredIwr };
};

export default useIwrReveal;
