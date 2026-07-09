import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import {
  freqKeyFor,
  parseFrequency,
  checkFrequency,
  recordUse,
  clearUse,
} from '../utils/frequency';
import { APP, syncKey } from '../sync/keys';

/**
 * Synced per-character ability frequency ledger (cnmh_freq_<charId>).
 * Thin wrapper over the pure engine in utils/frequency.js — availability is
 * derived at call time from the ledger plus the clocks the caller passes in.
 */
export const useFrequency = (charId) => {
  const [ledger, setLedger] = useSyncedState(syncKey(APP.FREQ, charId || 'unknown'), {});

  const gateFor = useCallback(
    (ability, { nowSecs, encounter, casterEntryId } = {}) => {
      const rule = parseFrequency(ability);
      if (!rule) return { available: true, lastUsedSecs: null, availableAtSecs: null, lockKind: null };
      const records = (ledger || {})[freqKeyFor(ability)] || [];
      return checkFrequency({ rule, records, nowSecs, encounter, casterEntryId });
    },
    [ledger]
  );

  const record = useCallback(
    (ability, { nowSecs, encounter, casterEntryId } = {}) => {
      const rule = parseFrequency(ability);
      const abilityKey = freqKeyFor(ability);
      if (!rule || !abilityKey) return;
      setLedger((cur) =>
        recordUse({ ledger: cur || {}, abilityKey, rule, nowSecs, encounter, casterEntryId })
      );
    },
    [setLedger]
  );

  const clear = useCallback(
    (abilityKey) => setLedger((cur) => clearUse(cur || {}, abilityKey)),
    [setLedger]
  );

  return { ledger: ledger || {}, gateFor, record, clear };
};

export default useFrequency;
