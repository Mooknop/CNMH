import { useCallback, useMemo, useState } from 'react';

// The map surface's own tap-order list (#1749 OQ-2 ruling, option (b)):
// "the map surface keeps its own tap-order list, handed to ordered resolvers
// (multi-ray) as an override; useTargeting stays unordered." `useTargeting`
// deliberately has no ordering contract — five other flows share it and none
// of them need one — so giving the MAP a memory of tap sequence lives here
// instead, self-contained and decoupled from targeting state entirely.
//
// A future map-mode tap handler composes this alongside useTargeting's
// `toggleTarget`, calling both on the same tap:
//
//   const tapOrder = useTapOrder({ max: rayCount });
//   const onMarkerTap = (entryId) => { toggleTarget(entryId); tapOrder.toggle(entryId); };
//   // MultiRayResolver's per-ray dropdowns can be pre-filled from tapOrder.order,
//   // while resolverTargets / saveTargets / everything else keeps reading
//   // useTargeting's unordered `targets` exactly as it does today.
//
// Not wired into anything yet — this is the standalone primitive (wave 1);
// composing it into a tap handler is wave 2.
//
// Semantics: append on a fresh tap; a re-tap of an already-tapped entry
// REMOVES it (matches toggleTarget's toggle semantics, so the two stay in
// lockstep when driven by the same tap). `max` (optional) caps the ORDER's
// length — a tap that would grow past it is silently ignored (the existing
// entries stay tapped; nothing is evicted to make room). No `max` means no
// cap, matching the fact that no targeting flow today has a maximum either
// (see the epic's OQ-2 table).
export function useTapOrder({ max } = {}) {
  const [order, setOrder] = useState([]);

  const toggle = useCallback((entryId) => {
    if (!entryId) return;
    setOrder((cur) => {
      if (cur.includes(entryId)) return cur.filter((id) => id !== entryId);
      if (Number.isFinite(max) && cur.length >= max) return cur;
      return [...cur, entryId];
    });
  }, [max]);

  const clear = useCallback(() => setOrder([]), []);
  const isTapped = useCallback((entryId) => order.includes(entryId), [order]);

  // The SET view (#1749 task framing: "exposing both the SET... and the
  // ORDER") — `order` already has no duplicates (a re-tap removes rather than
  // appending again), so this is a same-membership, order-erased view for a
  // caller that only cares "is this entryId among the tapped ones", not
  // which came first.
  const set = useMemo(() => new Set(order), [order]);

  return { order, set, toggle, clear, isTapped };
}

export default useTapOrder;
