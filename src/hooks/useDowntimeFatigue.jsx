import { useSyncedState } from './useSyncedState';
import { RELAY, syncKey } from '../sync/keys';

// Manages the Fatigued condition in the character's conditions key on behalf of
// the downtime commit flow. Applying Fatigued is idempotent; clearing it removes
// any entry with id 'fatigued', regardless of source, matching the rule that a
// rest day (no night block) clears the condition outright.
export function useDowntimeFatigue(charId) {
  const [conditions, setConditions] = useSyncedState(
    syncKey(RELAY.CONDITIONS, charId || 'none'),
    []
  );

  const isFatigued = (conditions || []).some((c) => c.id === 'fatigued');

  const applyFatigue = () =>
    setConditions((prev) =>
      (prev || []).some((c) => c.id === 'fatigued')
        ? prev
        : [...(prev || []), { id: 'fatigued' }]
    );

  const clearFatigue = () =>
    setConditions((prev) => (prev || []).filter((c) => c.id !== 'fatigued'));

  return { isFatigued, applyFatigue, clearFatigue };
}

export default useDowntimeFatigue;
