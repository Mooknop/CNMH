import { useEffect } from 'react';
import { useSession } from '../contexts/SessionContext';
import { useContent } from '../contexts/ContentContext';
import { useGmAuth } from './useGmAuth';
import { useSessionLog } from './useSessionLog';
import { useCharacter } from './useCharacter';
import { useShield } from './useShield';
import { isWardEntry } from '../utils/ward';

const writeLocal = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

// Devoted Guardian ward expiry (#228): the ward lasts exactly as long as the
// warder's shield stays raised. Every way the shield comes down — manual
// lower, the turn-start auto-lower, a block that breaks it — flips the
// derived `raised` to false, so this watches that one signal and strips the
// warder's ward entries from every character when it goes (or is) down.
//
// GM-only writer, mirroring useAuraKoSweep: one client owns the removal.
// Mounted per ward-capable character via WardSync. Idempotent — it only
// writes when matching entries exist, so re-runs are free.
export function useWardSweep(character) {
  const warderId = character?.id || 'none';
  const warderName = character?.name || warderId;
  const charData = useCharacter(character);
  const { raised } = useShield(warderId, charData?.inventory || []);
  const { getState, sendUpdate } = useSession();
  const { characters } = useContent();
  const { isGm } = useGmAuth();
  const { appendEvent } = useSessionLog();

  useEffect(() => {
    if (!isGm || raised) return;
    (characters || []).forEach((c) => {
      const effects = getState(c.id, 'effects');
      if (!Array.isArray(effects) || effects.length === 0) return;
      const remaining = effects.filter((e) => !isWardEntry(e, warderId));
      if (remaining.length === effects.length) return;
      writeLocal(`cnmh_effects_${c.id}`, remaining);
      sendUpdate(c.id, 'effects', remaining);
      appendEvent({
        type: 'expire',
        text: `${warderName}'s ward on ${c.name} ends — shield no longer raised`,
      });
    });
  }, [isGm, raised, characters, getState, sendUpdate, appendEvent, warderId, warderName]);
}

export default useWardSweep;
