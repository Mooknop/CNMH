import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';

export const useEffects = (charId) => {
  const [effects, setEffects] = useSyncedState(`cnmh_effects_${charId}`, []);

  const removeEffect = useCallback(
    (uid) => setEffects((cur) => (cur || []).filter((e) => e.id !== uid)),
    [setEffects]
  );

  return {
    effects: effects || [],
    removeEffect,
  };
};

export default useEffects;
