// Active-combatant action feed (#472a). Reads the bridge-relayed feed for the
// acting combatant and guards against a stale payload: the bridge clears + re-keys
// the feed on every turn change, but a late message could still carry a previous
// actor's entryId, so we only surface a feed whose entryId matches the combatant
// currently holding the turn. The bridge populates this in #472b; until then the
// key is empty and the stage shows its waiting state.
import { useSyncedState } from './useSyncedState';
import { RELAY, globalKey } from '../sync/keys';

const EMPTY = { actions: 3, spent: 0, reaction: true, feed: [] };

export const useActorFeed = (actorEntryId) => {
  const [payload] = useSyncedState(globalKey(RELAY.ACTORFEED), null);

  if (!payload || !actorEntryId || payload.entryId !== actorEntryId) {
    return EMPTY;
  }

  return {
    actions: payload.actions ?? 3,
    spent: payload.spent ?? 0,
    reaction: payload.reaction ?? true,
    feed: Array.isArray(payload.feed) ? payload.feed : [],
  };
};

export default useActorFeed;
