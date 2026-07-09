import React from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { APP, syncKey } from '../../sync/keys';

const LABELS = {
  unavailable: 'reaction unavailable',
  available:   'reaction available',
  spent:       'reaction spent',
};

/**
 * Per-PC reaction availability ↩ for the GM initiative panel (#221). The GM
 * holds the trigger knowledge, so they need to see at a glance who can still
 * react before firing a trigger. Reads the same cnmh_turnstate_<charId> the
 * player's TurnTrackerPanel writes; state derivation mirrors its ReactionIcon
 * (no reaction until the PC's first turn has started).
 */
const GmReactionBadge = ({ charId, name }) => {
  const [turnState] = useSyncedState(syncKey(APP.TURNSTATE, charId), null);

  const state = !turnState?.hasStartedFirstTurn
    ? 'unavailable'
    : turnState.reactionSpent
    ? 'spent'
    : turnState.reactionAvailable
    ? 'available'
    : 'unavailable';

  return (
    <span
      className={`gm-reaction-badge gm-reaction-badge--${state}`}
      title={`${name || charId}: ${LABELS[state]}`}
      aria-label={`${name || charId} ${LABELS[state]}`}
    >
      ↩
    </span>
  );
};

export default GmReactionBadge;
