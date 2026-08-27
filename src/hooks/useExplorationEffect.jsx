import { useEffect } from 'react';
import { useSyncedState } from './useSyncedState';
import { newEntryUid } from '../utils/uid';
import { APP, syncKey } from '../sync/keys';

// Tag stamped on the single exploration-activity buff entry so it can be
// reconciled/cleared without disturbing other effects on the character.
export const EXPLORATION_EFFECT_SOURCE = 'exploration';

// Reconciles a single activity-scoped buff entry in cnmh_effects_<charId>.
//
// Pass the pf2eEffects id the active exploration activity grants (e.g. 'defend'),
// or null when no activity-keyed effect should apply. Exactly one entry tagged
// source:'exploration' is kept in sync with it: selecting Defend adds its
// +2 Perception buff; clearing the activity, switching activities, or leaving
// exploration removes it. All other effects are left untouched.
//
// MULTI-WRITER SAFE (#1810): since S6 this hook is mounted by BOTH the player's
// ExplorationTab and the GM dock's roster strip (the dock has to drive the buff
// when a player's device is asleep), often on the same charId at the same time.
// Two writers converge rather than stack, by construction:
//   · the early bail means the steady state is "nobody writes";
//   · a write filters out EVERY prior source:'exploration' entry before
//     appending exactly one, so a write racing off a stale render replaces its
//     rival's entry instead of adding a second one (uids differ; the tag is
//     what identifies the slot).
// Both surfaces derive `desiredEffectId` from the same synced pick and the same
// effective play mode, so they cannot want different values and oscillate.
// Covered by DockExplorationRoster.test.jsx's dual-mount case.
export function useExplorationEffect(charId, desiredEffectId) {
  const [effects, setEffects] = useSyncedState(syncKey(APP.EFFECTS, charId || 'none'), []);

  useEffect(() => {
    if (!charId) return;
    const list = effects || [];
    const current = list.find((e) => e.source === EXPLORATION_EFFECT_SOURCE) || null;
    const wanted = desiredEffectId || null;
    if ((current?.effectId || null) === wanted) return;

    const without = list.filter((e) => e.source !== EXPLORATION_EFFECT_SOURCE);
    setEffects(
      wanted
        ? [
            ...without,
            {
              id: newEntryUid(),
              effectId: wanted,
              source: EXPLORATION_EFFECT_SOURCE,
              ts: Date.now(),
            },
          ]
        : without
    );
  }, [charId, effects, desiredEffectId, setEffects]);
}

export default useExplorationEffect;
