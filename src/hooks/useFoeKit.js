// Active-enemy foe kit (#1531 S2). Reads the bridge-pushed offensive kit for
// the enemy whose turn it is (cnmh_foekit_global) and guards against a stale
// payload the same way useActorFeed does: the bridge clears + re-keys the kit
// on every turn change, but a late message could still carry a previous
// combatant's entryId, so only a kit whose entryId matches the entry the
// caller is rendering is surfaced. Null means "no kit" — either a pre-v5
// bridge, no push yet, or a PC turn — and the pane shows its waiting note.
import { useSyncedState } from './useSyncedState';
import { RELAY, globalKey } from '../sync/keys';

export const useFoeKit = (entryId) => {
  const [payload] = useSyncedState(globalKey(RELAY.FOEKIT), null);
  if (!payload || !entryId || payload.entryId !== entryId) return null;
  return payload.kit ?? null;
};

export default useFoeKit;
