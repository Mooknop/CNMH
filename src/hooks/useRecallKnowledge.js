import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { useEncounter } from './useEncounter';
import {
  defaultRecord,
  applyRecallKnowledge,
} from '../utils/recallKnowledge';

const KNOWLEDGE_KEY = 'cnmh_knowledge_global';

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
    (entryId, { degree, defenses, choice, by, byName, skill, d20, total, dc }) => {
      setKnowledge((cur) => {
        const prev = cur?.[entryId] || defaultRecord();
        const { next, learned } = applyRecallKnowledge(prev, {
          degree, defenses, choice, charId: by,
        });
        const historyEntry = { ts: Date.now(), by, byName, skill, d20, total, dc, degree, learned };
        return {
          ...cur,
          [entryId]: { ...next, history: [...(next.history || []), historyEntry] },
        };
      });

      const learnedStr = (() => {
        if (degree === 'criticalSuccess') return 'everything revealed';
        if (degree === 'success') return `learned: ${choice}`;
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

  const clearAll = useCallback(
    () => setKnowledge({}),
    [setKnowledge]
  );

  return { knowledge, recordFor, resolve, clearLock, clearAll };
};

export default useRecallKnowledge;
