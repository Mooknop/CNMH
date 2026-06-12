import { useEffect } from 'react';
import { useSyncedState } from './useSyncedState';
import { useAura } from './useAura';
import { useGmAuth } from './useGmAuth';
import { useSessionLog } from './useSessionLog';

// KO auto-deactivation for the kinetic aura (#228): Channel Elements ends if
// the kineticist is knocked out. HP is written from many places (AdjustHpModal,
// consumables, Treat Wounds, the Foundry bridge), so this watches the synced
// hp key instead of instrumenting writers.
//
// GM-only writer, mirroring useEffectExpirySweep: one client owns the write so
// the deactivation isn't broadcast by every open tab. Mounted per kineticist
// via AuraKoSync. Self-stabilizing — once the aura is written inactive the
// effect's guard stops it from re-firing, so no duplicate log lines.
export function useAuraKoSweep(character) {
  const charId = character?.id || 'none';
  const name = character?.name || charId;
  const [hp] = useSyncedState(`cnmh_hp_${charId}`, null);
  const { active, deactivate } = useAura(charId);
  const { isGm } = useGmAuth();
  const { appendEvent } = useSessionLog();

  useEffect(() => {
    if (!isGm || !active) return;
    // Bridge-written hp shapes vary — only act on a definite numeric 0.
    if (typeof hp?.current !== 'number' || hp.current > 0) return;
    deactivate();
    appendEvent({
      type: 'expire',
      text: `${name} was knocked out — kinetic aura deactivates`,
    });
  }, [isGm, active, hp, deactivate, appendEvent, name]);
}

export default useAuraKoSweep;
