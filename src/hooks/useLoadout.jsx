import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { APP, syncKey } from '../sync/keys';

// Single writer for the durable live-loadout map
// cnmh_loadout_<characterId> = { [uid]: { state?, container?, hand?, strapHand? } }.
// Shared by the encounter hands surfaces (HandsGroup) and the Inventory-tab action buttons so
// the patch semantics live in exactly one place. Reads flow back through
// useCharacter's effective tree (kept in sync same-client by the Slice-A
// SessionContext fix).
//
// Convention: any explicit placement clears `hand`; a held assignment clears
// `container` (held ⇒ on-person). `hand: undefined` is dropped by JSON on
// persist, so the stored map stays clean.
//
// `strapHand` (1|2) marks a buckler-class shield worn ON that hand while its
// state stays 'worn' — it never occupies a held slot, so setHands leaves
// strapped items where they are. Leaving the hand's company (drop/stow) also
// unstraps; a Swap that hands the strapped uid something is defensively
// unstrapped too.
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
    (uid) =>
      patch(uid, { state: 'dropped', container: null, hand: undefined, strapHand: undefined }),
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
      patch(uid, { container: containerUid, state: 'worn', hand: undefined, strapHand: undefined }),
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
            strapHand: undefined,
          };
        } else {
          if (hand1)
            next[hand1] = {
              ...(next[hand1] || {}),
              state: 'held1',
              container: null,
              hand: 1,
              strapHand: undefined,
            };
          if (hand2)
            next[hand2] = {
              ...(next[hand2] || {}),
              state: 'held1',
              container: null,
              hand: 2,
              strapHand: undefined,
            };
        }
        return next;
      }),
    [setLoadout]
  );

  // Strap a buckler-class shield onto a hand: worn ON it, never occupying its
  // held slot. One strapped item per hand — a previous occupant of that strap
  // is released (stays Worn). Strapping is an on-person placement, so it also
  // pulls the item out of any container.
  const strapTo = useCallback(
    (uid, hand) =>
      setLoadout((cur) => {
        const next = { ...(cur || {}) };
        Object.keys(next).forEach((k) => {
          if (k !== uid && next[k] && next[k].strapHand === hand) {
            next[k] = { ...next[k], strapHand: undefined };
          }
        });
        next[uid] = {
          ...(next[uid] || {}),
          state: 'worn',
          container: null,
          hand: undefined,
          strapHand: hand,
        };
        return next;
      }),
    [setLoadout]
  );
  // Off the arm, still Worn on your person.
  const unstrap = useCallback(
    (uid) => patch(uid, { strapHand: undefined }),
    [patch]
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
    strapTo,
    unstrap,
  };
};

export default useLoadout;
