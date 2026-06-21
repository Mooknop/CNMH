// useReadiedAction — the per-PC readied-action declaration (#501). Holds a single
// readied action in cnmh_readied_<charId>: declared on the PC's turn (2 actions),
// armed off-turn via useReactionOptions, and cleared when it fires (reaction
// spent) or at the start of the owner's next turn (TurnTrackerPanel sweep).
import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { buildReadied } from '../utils/readiedAction';

export const useReadiedAction = (charId) => {
  const [readied, setReadied] = useSyncedState(`cnmh_readied_${charId || 'unknown'}`, null);

  const declare = useCallback(
    ({ actionName, trigger, round }) => setReadied(buildReadied({ actionName, trigger, round })),
    [setReadied]
  );

  const clear = useCallback(() => setReadied(null), [setReadied]);

  return { readied: readied || null, declare, clear };
};

export default useReadiedAction;
