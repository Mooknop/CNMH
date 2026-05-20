import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';

export const defaultTurnState = () => ({
  actionsSpent: 0,
  reactionAvailable: false,
  reactionSpent: false,
  hasStartedFirstTurn: false,
  actionsLog: [],
});

export const useTurnState = (charId) => {
  const [turnState, setTurnState] = useSyncedState(
    `cnmh_turnstate_${charId}`,
    defaultTurnState()
  );

  const spendActions = useCallback(
    (cost, sourceLabel) =>
      setTurnState((cur) => {
        const base = cur || defaultTurnState();
        return {
          ...base,
          actionsSpent: base.actionsSpent + cost,
          actionsLog: [
            ...base.actionsLog,
            { name: sourceLabel || 'Action', cost, ts: Date.now() },
          ],
        };
      }),
    [setTurnState]
  );

  const spendReaction = useCallback(
    (sourceLabel) =>
      setTurnState((cur) => {
        const base = cur || defaultTurnState();
        return {
          ...base,
          reactionSpent: true,
          actionsLog: [
            ...base.actionsLog,
            { name: sourceLabel || 'Reaction', cost: 'reaction', ts: Date.now() },
          ],
        };
      }),
    [setTurnState]
  );

  const resetForNewTurn = useCallback(
    () =>
      setTurnState(() => ({
        actionsSpent: 0,
        reactionAvailable: true,
        reactionSpent: false,
        hasStartedFirstTurn: true,
        actionsLog: [],
      })),
    [setTurnState]
  );

  return {
    turnState: turnState || defaultTurnState(),
    spendActions,
    spendReaction,
    resetForNewTurn,
  };
};

export default useTurnState;
