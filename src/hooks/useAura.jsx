import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';

// Kinetic aura state (#228) — Channel Elements activates a 10-ft aura that
// stays up until the kineticist is knocked out, uses an overflow impulse, or
// Dismisses it (it survives encounter end — kineticists keep auras running in
// exploration). State is synced so the GM and the turn tracker see it:
//   cnmh_aura_<charId> = { active, ts }
// The hook is intentionally dumb: reasons and logging live at the call sites,
// which have the encounter/session log in scope.

const IDLE_AURA = { active: false, ts: 0 };

export const useAura = (charId) => {
  const [auraState, setAuraState] = useSyncedState(
    `cnmh_aura_${charId || 'none'}`,
    IDLE_AURA
  );

  const activate = useCallback(
    () => setAuraState({ active: true, ts: Date.now() }),
    [setAuraState]
  );

  const deactivate = useCallback(
    () => setAuraState({ active: false, ts: Date.now() }),
    [setAuraState]
  );

  return { active: !!auraState?.active, activate, deactivate };
};

export default useAura;
