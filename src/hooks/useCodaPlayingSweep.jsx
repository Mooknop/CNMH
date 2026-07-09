import { useEffect } from 'react';
import { useSyncedState } from './useSyncedState';
import { useCharacter } from './useCharacter';
import { usePlaying } from './usePlaying';
import { useGmAuth } from './useGmAuth';
import { useSessionLog } from './useSessionLog';
import { playingEffectRefs, reconcileCodaPlayingEffects } from '../utils/codaPlaying';
import { APP, syncKey } from '../sync/keys';

// Coda staves → skill/Speed bonuses while playing (#935). Watches the
// character's playing flag + live inventory and reconciles the playing-gated
// effect entries in cnmh_effects_<charId>: granted while playing with the
// instrument in hand, dropped the moment the performance lapses (turn-boundary
// sweep, encounter end, or the sheet's manual Stop) — all through this one
// path, exactly like the Vocoder's Concealed (useVocoderConcealSweep).
//
// GM-only writer, mirroring useWardSweep: one client owns the write. Idempotent
// — reconcile returns null when the entries already match.
export function useCodaPlayingSweep(character) {
  const charId = character?.id || 'none';
  const name = character?.name || charId;
  const charData = useCharacter(character);
  const { playing } = usePlaying(charId);
  const [effects, setEffects] = useSyncedState(syncKey(APP.EFFECTS, charId), []);
  const { isGm } = useGmAuth();
  const { appendEvent } = useSessionLog();

  const refs = playing ? playingEffectRefs(charData?.inventory) : [];
  const refsKey = refs.join(',');

  useEffect(() => {
    if (!isGm) return;
    const wanted = refsKey ? refsKey.split(',') : [];
    const next = reconcileCodaPlayingEffects(effects, wanted);
    if (!next) return;
    setEffects(next);
    appendEvent({
      type: wanted.length ? 'apply' : 'expire',
      text: wanted.length
        ? `${name}'s instrument bonuses apply (playing)`
        : `${name}'s instrument bonuses end — the music stops`,
    });
  }, [isGm, refsKey, effects, setEffects, appendEvent, name]);
}

export default useCodaPlayingSweep;
