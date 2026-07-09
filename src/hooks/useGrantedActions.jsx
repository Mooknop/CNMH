import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { APP, syncKey } from '../sync/keys';

export const useGrantedActions = (charId) => {
  const [grantedActions, setGrantedActions] = useSyncedState(
    syncKey(APP.GRANTEDACTIONS, charId),
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
