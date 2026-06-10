import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';

export const defaultTurnState = () => ({
  actionsSpent: 0,
  attacksMade: 0,
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

  // Attacks made this turn — drives the Multiple Attack Penalty step.
  // Older persisted states lack the field, hence the ?? 0.
  const recordAttack = useCallback(
    (count = 1) =>
      setTurnState((cur) => {
        const base = cur || defaultTurnState();
        return { ...base, attacksMade: (base.attacksMade ?? 0) + count };
      }),
    [setTurnState]
  );

  // turnToken identifies the turn this reset corresponds to (e.g. "round:index").
  // Persisting it lets a freshly-mounted panel tell "new turn" (reset) apart from
  // "remounted mid-turn" (don't wipe actions already spent).
  const resetForNewTurn = useCallback(
    (turnToken = null) =>
      setTurnState(() => ({
        ...defaultTurnState(),
        reactionAvailable: true,
        hasStartedFirstTurn: true,
        turnToken,
      })),
    [setTurnState]
  );

  return {
    turnState: turnState || defaultTurnState(),
    spendActions,
    spendReaction,
    recordAttack,
    resetForNewTurn,
  };
};

export default useTurnState;
