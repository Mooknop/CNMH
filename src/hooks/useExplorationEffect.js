import { useEffect } from 'react';
import { useSyncedState } from './useSyncedState';
import { newEntryUid } from '../utils/uid';

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
export function useExplorationEffect(charId, desiredEffectId) {
  const [effects, setEffects] = useSyncedState(`cnmh_effects_${charId || 'none'}`, []);

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
