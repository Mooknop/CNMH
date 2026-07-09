import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { PLAYING_IDLE } from '../utils/playing';
import { APP, syncKey } from '../sync/keys';

// 'While playing' state (#935) — reader for the Composition-sustained flag.
// Setting happens in the cast flows (markPlayingOnCast); expiry in the
// turn-boundary sweep (turnEffects.js) and endEncounter. `stop` is the manual
// override for table rulings — same spirit as useAura's deactivate.
//   cnmh_playing_<charId> = { active, expireAt?, ts }

export const usePlaying = (charId) => {
  const [playingState, setPlayingState] = useSyncedState(
    syncKey(APP.PLAYING, charId || 'none'),
    PLAYING_IDLE
  );

  const stop = useCallback(
    () => setPlayingState({ active: false, ts: Date.now() }),
    [setPlayingState]
  );

  return { playing: !!playingState?.active, expireAt: playingState?.expireAt || null, stop };
};

export default usePlaying;
