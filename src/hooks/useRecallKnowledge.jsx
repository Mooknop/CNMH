import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { useEncounter } from './useEncounter';
import {
  defaultRecord,
  applyRecallKnowledge,
} from '../utils/recallKnowledge';
import { APP, globalKey } from '../sync/keys';

const KNOWLEDGE_KEY = globalKey(APP.KNOWLEDGE);

const degreeLabel = {
  criticalSuccess: 'Critical Success',
  success:         'Success',
  failure:         'Failure',
  criticalFailure: 'Critical Failure',
};

export const useRecallKnowledge = () => {
  const [knowledge, setKnowledge] = useSyncedState(KNOWLEDGE_KEY, {});
  const { appendLog } = useEncounter();

  const recordFor = useCallback(
    (entryId) => knowledge?.[entryId] || defaultRecord(),
    [knowledge]
  );

  const resolve = useCallback(
    (entryId, { degree, defenses, choices, by, byName, skill, d20, total, dc, outOfCombat, currentDay }) => {
      setKnowledge((cur) => {
        const prev = cur?.[entryId] || defaultRecord();
        const { next, learned } = applyRecallKnowledge(prev, {
          degree, defenses, choices, charId: by, outOfCombat, currentDay,
        });
        const historyEntry = { ts: Date.now(), by, byName, skill, d20, total, dc, degree, learned };
        return {
          ...cur,
          [entryId]: { ...next, history: [...(next.history || []), historyEntry] },
        };
      });

      // Out of combat there is no encounter, so don't write to the encounter log
      // (which would otherwise spawn phantom encounter state).
      if (outOfCombat) return;

      const learnedStr = (() => {
        if (degree === 'criticalSuccess') {
          const facts = Array.isArray(choices) && choices.length > 0
            ? `identity/description/HP + ${choices.join(', ')}`
            : 'identity/description/HP';
          return facts;
        }
        if (degree === 'success') {
          const facts = Array.isArray(choices) && choices.length > 0
            ? `identity/description/HP + ${choices.join(', ')}`
            : 'identity/description/HP';
          return facts;
        }
        if (degree === 'criticalFailure') return 'locked out';
        return 'nothing learned';
      })();

      appendLog({
        type: 'system',
        text: `${byName} recalled knowledge (${skill}): ${degreeLabel[degree] || degree} — ${learnedStr}`,
      });
    },
    [setKnowledge, appendLog]
  );

  const clearLock = useCallback(
    (entryId, charId) => {
      setKnowledge((cur) => {
        const prev = cur?.[entryId] || defaultRecord();
        const lockedOut = { ...(prev.lockedOut || {}) };
        delete lockedOut[charId];
        return { ...cur, [entryId]: { ...prev, lockedOut } };
      });
    },
    [setKnowledge]
  );

  // Merge an external record update (e.g. from Exploit Vulnerability reveals).
  const mergeRecord = useCallback(
    (entryId, updater) => {
      setKnowledge((cur) => {
        const prev = cur?.[entryId] || defaultRecord();
        const next = typeof updater === 'function' ? updater(prev) : updater;
        return { ...cur, [entryId]: next };
      });
    },
    [setKnowledge]
  );

  const clearAll = useCallback(
    () => setKnowledge({}),
    [setKnowledge]
  );

  return { knowledge, recordFor, resolve, mergeRecord, clearLock, clearAll };
};

export default useRecallKnowledge;
