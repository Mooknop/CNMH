import { useContext, useEffect, useRef } from 'react';
import { CharacterContext } from '../contexts/CharacterContext';
import { useSession } from '../contexts/SessionContext';
import { useGameDate } from '../contexts/GameDateContext';
import { usePlayMode } from './usePlayMode';
import { useSyncedState } from './useSyncedState';
import { useDowntimePartyReady } from './useDowntimePartyReady';
import { periodState } from '../utils/downtimeUtils';
import { APP, globalKey } from '../sync/keys';

// Auto-advance: when every PC commits their last downtime day, write a
// summary, advance the clock by the full block, close the block, and return
// to Exploration mode — no GM button needed. Extracted from DowntimeControl
// (#1624) so the SAME effect can also be mounted from the dock's Period view
// (#1856, the redesign's re-housing of this control) without duplicating the
// logic. DowntimeControl (mounted on /gm) and the dock's Period view (mounted
// on /gm/dock) are two different ROUTES — under ordinary in-app navigation
// only one is ever mounted in a given browser tab — but nothing stops a GM
// from having both open in two tabs/windows against the same campaign
// session, and both mounted instances subscribe to the same per-PC
// `downtime` keys, so both would observe the same allReady flip.
//
// GUARD. A per-instance ref (`autoAdvancedRef`) still stops a SINGLE instance
// from re-firing across re-renders while allReady stays true — that part is
// unchanged from the original DowntimeControl effect. The NEW guard lives in
// the setBlock call itself: useSyncedState's setter (`setAndSync`) invokes a
// functional updater SYNCHRONOUSLY against its own latest known value, so
// re-checking `prev.active` inside that updater tells this call whether IT is
// the one actually closing the block. `closedHere` defaults to `true` (not
// `false`) rather than requiring proof of a flip, because a stubbed setBlock —
// as DowntimeControl's existing test suite uses, a plain `vi.fn()` that never
// invokes its argument — must not silently swallow the summary/advance/mode-
// switch when there's only one instance in play. The guard only ever
// downgrades a real "someone already closed it" observation into a skip; it
// never upgrades a skip that didn't happen into a false fire.
//
// This does not make a genuine two-TAB race provably impossible: each tab
// holds its own independent copy of the synced block (useSyncedState's
// `latest` ref is per hook instance, not shared across browser contexts), so
// two effects that both read `active: true` in the same instant — before
// either write has round-tripped over the wire — will both compute
// `closedHere = true` and both fire. What this DOES fix is every same-
// JS-runtime case (two hook instances mounted in one page, the shape covered
// by this file's own test) and it shrinks the two-tab window from "for as
// long as both tabs stay mounted" (the old bare per-instance ref never
// noticed the other tab at all) down to "before the first write's broadcast
// lands" — a real reduction even though it isn't a distributed lock.
export function useDowntimeAutoAdvance() {
  const { characters } = useContext(CharacterContext) || {};
  const { getState } = useSession();
  const { setGmMode } = usePlayMode();
  const { advanceDays } = useGameDate();
  const [block, setBlock] = useSyncedState(globalKey(APP.DOWNTIMEBLOCK), null);
  const [, setSummary] = useSyncedState(globalKey(APP.DOWNTIMESUMMARY), null);

  // Primitive deps to avoid spurious effect re-runs when the block's object
  // reference changes (every synced read is a fresh object).
  const blockActive = block?.active ?? false;
  const blockDays = block?.days ?? 0;
  const blockStartedAt = block?.startedAt ?? null;

  const { allReady } = useDowntimePartyReady(blockActive ? blockDays : 0, blockStartedAt);

  // Capture latest characters without adding the array to effect deps.
  const charactersRef = useRef(characters);
  charactersRef.current = characters;

  const autoAdvancedRef = useRef(false);
  useEffect(() => {
    if (!blockActive) {
      autoAdvancedRef.current = false; // reset so a new block can fire again
      return;
    }
    if (!allReady || autoAdvancedRef.current) return;
    autoAdvancedRef.current = true;

    // See the file header: this is the cross-instance guard. `closedHere`
    // stays `true` unless the updater actually runs and finds the block
    // already inactive.
    let closedHere = true;
    setBlock((prev) => {
      if (!prev?.active) {
        closedHere = false;
        return prev;
      }
      return { ...prev, active: false };
    });
    if (!closedHere) return;

    const summaryChars = (charactersRef.current || []).map((c) => {
      const dt = getState(c.id, APP.DOWNTIME);
      const { selected, ledger } = periodState(dt, blockStartedAt, blockDays);
      return { id: c.id, name: c.name, selected, ledger };
    });
    setSummary({ period: { days: blockDays, startedAt: blockStartedAt }, chars: summaryChars });
    advanceDays(blockDays);
    setGmMode('exploration');
  }, [allReady, blockActive, blockDays, blockStartedAt, advanceDays, setBlock, setGmMode, setSummary, getState]);
}

export default useDowntimeAutoAdvance;
