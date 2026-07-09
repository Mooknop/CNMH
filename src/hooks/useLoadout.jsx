import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { APP, syncKey } from '../sync/keys';

// Single writer for the durable live-loadout map
// cnmh_loadout_<characterId> = { [uid]: { state?, container?, hand? } }.
// Shared by the Encounter HandsPanel and the Inventory-tab action buttons so
// the patch semantics live in exactly one place. Reads flow back through
// useCharacter's effective tree (kept in sync same-client by the Slice-A
// SessionContext fix).
//
// Convention: any explicit placement clears `hand`; a held assignment clears
// `container` (held ⇒ on-person). `hand: undefined` is dropped by JSON on
// persist, so the stored map stays clean.
export const useLoadout = (characterId) => {
  const [loadout, setLoadout] = useSyncedState(
    syncKey(APP.LOADOUT, characterId || 'none'),
    {}
  );

  const patch = useCallback(
    (uid, p) =>
      setLoadout((cur) => ({
        ...(cur || {}),
        [uid]: { ...((cur || {})[uid] || {}), ...p },
      })),
    [setLoadout]
  );

  // On-person, not held, not in a container.
  const worn = useCallback(
    (uid) => patch(uid, { state: 'worn', container: null, hand: undefined }),
    [patch]
  );
  const drop = useCallback(
    (uid) => patch(uid, { state: 'dropped', container: null, hand: undefined }),
    [patch]
  );
  // pickUp / retrieve / unhand are all "back to Worn on your person".
  const pickUp = worn;
  const retrieve = worn;
  const unhand = worn;

  // Worn → stowed in a specific container (state is irrelevant once inside;
  // effective derivation forces Stowed).
  const stow = useCallback(
    (uid, containerUid) =>
      patch(uid, { container: containerUid, state: 'worn', hand: undefined }),
    [patch]
  );
  // Move an already-stowed item between containers (placement only).
  const moveToContainer = useCallback(
    (uid, containerUid) => patch(uid, { container: containerUid }),
    [patch]
  );

  // Apply a SWAP atomically. Worn-only source ⇒ any previously-held item not
  // re-chosen returns to Worn. Same uid in both hands ⇒ Held in 2 Hands.
  const setHands = useCallback(
    ({ hand1 = null, hand2 = null }) =>
      setLoadout((cur) => {
        const next = { ...(cur || {}) };
        Object.keys(next).forEach((uid) => {
          const st = next[uid] && next[uid].state;
          if (
            (st === 'held1' || st === 'held2') &&
            uid !== hand1 &&
            uid !== hand2
          ) {
            next[uid] = { ...next[uid], state: 'worn', container: null, hand: undefined };
          }
        });
        if (hand1 && hand1 === hand2) {
          next[hand1] = {
            ...(next[hand1] || {}),
            state: 'held2',
            container: null,
            hand: undefined,
          };
        } else {
          if (hand1)
            next[hand1] = {
              ...(next[hand1] || {}),
              state: 'held1',
              container: null,
              hand: 1,
            };
          if (hand2)
            next[hand2] = {
              ...(next[hand2] || {}),
              state: 'held1',
              container: null,
              hand: 2,
            };
        }
        return next;
      }),
    [setLoadout]
  );

  return {
    loadout,
    worn,
    drop,
    pickUp,
    retrieve,
    unhand,
    stow,
    moveToContainer,
    setHands,
  };
};

export default useLoadout;
