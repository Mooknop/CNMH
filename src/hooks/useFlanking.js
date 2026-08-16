import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { RELAY, globalKey } from '../sync/keys';

// "Which enemies do I flank?" (#1749 S5) — one reader for
// `cnmh_flanked_global` = { [enemyEntryId]: { byCharIds: [charId, …] } }.
//
// The channel has been on the wire since the flanking push landed and four
// surfaces already read it by hand (InitiativeStrip, Dossier, MinionStrikeModal,
// DockEnemyPane), each re-deriving the same `byCharIds.includes(me)` test.
// `TargetPicker` has accepted an `isFlanking` prop since the day it was
// written and NO mount has ever passed one, so its ⚔ badge has been dead code
// — this hook is what finally feeds it, and the map markers beside it.
//
// INFORMATIONAL ONLY, exactly as every other consumer treats it: the app's
// off-guard attack bonus comes from a manual player toggle built by
// `utils/attackToggles.js` off the app's own enemy-effects rail, never from
// this channel. Whether the bridge's flank knowledge should feed that bonus is
// a real question and an explicitly different epic (#1749's deferred ledger).
//
// Fails closed and silent: no relay data (bridge offline, no tokens placed)
// means no badges, never a thrown read.
//
// @param {string} charId - the viewer/attacker, matched against `byCharIds`
export function useFlanking(charId) {
  const [flankedMap] = useSyncedState(globalKey(RELAY.FLANKED), {});

  const isFlanking = useCallback(
    (entryId) => !!(charId && entryId && flankedMap?.[entryId]?.byCharIds?.includes(charId)),
    [flankedMap, charId]
  );

  // The same answer as a list, for surfaces that style a whole set at once
  // (the map markers) rather than asking per row (the chips).
  const flankedIds = useMemo(() => {
    if (!charId || !flankedMap || typeof flankedMap !== 'object') return [];
    return Object.entries(flankedMap)
      .filter(([, v]) => Array.isArray(v?.byCharIds) && v.byCharIds.includes(charId))
      .map(([entryId]) => entryId);
  }, [flankedMap, charId]);

  return { isFlanking, flankedIds };
}

export default useFlanking;
