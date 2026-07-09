import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { APP, syncKey } from '../sync/keys';

// Blade Byrnie transient-dagger overlay (#728 E4). A synced flag, mirroring the
// chambers/loadout overlays, that records whether the armor's dagger is drawn
// (and into which hand). useCharacter reads it to inject the derived dagger
// strike; the activation action writes `activate`, and E4b's cleanup writes
// `returnToArmor` (after a Strike or at end of turn).
//   cnmh_blade_<characterId> = { active, hand, ts }
const IDLE = { active: false };

export const useBladeByrnie = (characterId) => {
  const [blade, setBlade] = useSyncedState(syncKey(APP.BLADE, characterId || 'none'), IDLE);

  const activate = useCallback(
    (hand = null) => setBlade({ active: true, hand, ts: Date.now() }),
    [setBlade]
  );

  const returnToArmor = useCallback(
    () => setBlade({ active: false, ts: Date.now() }),
    [setBlade]
  );

  return { active: !!blade?.active, hand: blade?.hand ?? null, activate, returnToArmor };
};

export default useBladeByrnie;
