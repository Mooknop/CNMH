import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';

export const useGrantedActions = (charId) => {
  const [grantedActions, setGrantedActions] = useSyncedState(
    `cnmh_grantedactions_${charId}`,
    []
  );

  const removeGrantedAction = useCallback(
    (id) => setGrantedActions((cur) => (cur || []).filter((g) => g.id !== id)),
    [setGrantedActions]
  );

  return {
    grantedActions: grantedActions || [],
    removeGrantedAction,
  };
};

export default useGrantedActions;
