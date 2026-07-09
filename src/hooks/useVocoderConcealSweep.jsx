import { useEffect } from 'react';
import { useSyncedState } from './useSyncedState';
import { useCharacter } from './useCharacter';
import { usePlaying } from './usePlaying';
import { useGmAuth } from './useGmAuth';
import { useSessionLog } from './useSessionLog';
import { hasVocoder, withVocoderConcealed, withoutVocoderConcealed } from '../utils/vocoderConceal';
import { RELAY, syncKey } from '../sync/keys';

// Vocoder of Invisibility → Concealed while playing (#935). Watches the
// character's playing flag + live inventory and writes the real `concealed`
// condition into cnmh_conditions_<charId>, so every existing condition reader
// (sheet masthead, StatsBlock, FocusBanner, GM state inspector) surfaces it
// like any other condition. Reacting to the synced flag — rather than
// instrumenting the cast sites — means every way playing ends (turn-boundary
// lapse, encounter end, the sheet's manual Stop) drops the veil through this
// one path.
//
// GM-only writer, mirroring useWardSweep: one client owns the write. Idempotent
// both ways — the helpers return null when no change is needed, and a manually
// toggled Concealed (no source tag) is never touched.
export function useVocoderConcealSweep(character) {
  const charId = character?.id || 'none';
  const name = character?.name || charId;
  const charData = useCharacter(character);
  const { playing } = usePlaying(charId);
  const [conditions, setConditions] = useSyncedState(syncKey(RELAY.CONDITIONS, charId), []);
  const { isGm } = useGmAuth();
  const { appendEvent } = useSessionLog();

  const veiled = playing && hasVocoder(charData?.inventory);

  useEffect(() => {
    if (!isGm) return;
    const next = veiled ? withVocoderConcealed(conditions) : withoutVocoderConcealed(conditions);
    if (!next) return;
    setConditions(next);
    appendEvent({
      type: veiled ? 'apply' : 'expire',
      text: veiled
        ? `${name} is Concealed — Vocoder of Invisibility (playing)`
        : `${name} is no longer Concealed — the vocoder falls silent`,
    });
  }, [isGm, veiled, conditions, setConditions, appendEvent, name]);
}

export default useVocoderConcealSweep;
