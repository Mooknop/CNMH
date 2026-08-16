import { useState, useCallback, useMemo } from 'react';

// Slice 2 substrate: local target selection for the encounter.
//
// Targets are encounter entryIds, sourced from the live initiative order.
// Selection itself is transient UI state and lives in local `useState`, not
// `useSyncedState` — it does not need to be shared between clients to work.
// What DOES need to leave this client is a separate concern: compose
// `useActionTargetSync(charId, targets, { kind, sourceUid })` (#1749 S1)
// alongside this hook to debounce-write `cnmh_action_<charId>` so the GM's
// Foundry canvas picks up the same selection. That write did not exist for
// years (this doc comment used to claim it did — it didn't); it is now a
// separate, opt-in hook rather than baked into `targets` changing here,
// because several callers of THIS hook (save prompts, familiar maneuvers,
// skill actions) have no strike/spell `kind` to report. Callers clear the
// local selection on turn end.
//
// `selectable` already drops any order entry with `hidden: true` (#1749
// OQ-5 ruling: the chip list must not out a creature the players can't see,
// same as the map overlay it accompanies) — shape-tolerant, a `hidden` field
// absent entirely (older bridge, below the floor that adds it) reads as
// visible. Because `validTargets` below re-filters `targets` against
// `selectable` on every render (originally to drop a defeated enemy that
// left the order), a currently-targeted entry that TURNS hidden mid-turn is
// dropped from the selection by that same pass — no separate code path.
//
// Self is excluded by default (you attack others); pass includeSelf for buffs
// that can target the caster.
//
// `defaultTargetId` pre-selects one entry on mount (#412) — used to seed the
// focused foe so focus → resolve is one tap. An id that isn't selectable is
// harmlessly dropped by the validTargets filter below.
//
// @param {string} charId  - the acting character (used to identify "self")
// @param {Array}  order   - encounter.order entries [{ entryId, kind, name, charId?, hidden? }]
// @param {{ includeSelf?: boolean, defaultTargetId?: string|null }} [opts]
export const useTargeting = (charId, order = [], opts = {}) => {
  const { includeSelf = false, defaultTargetId = null } = opts;
  const [targets, setTargets] = useState(() => (defaultTargetId ? [defaultTargetId] : []));

  const selectable = useMemo(
    () =>
      (order || []).filter(
        (e) => e && e.entryId && !e.hidden && (includeSelf || e.charId !== charId)
      ),
    [order, charId, includeSelf]
  );

  // Drop any selected entryId no longer present in the order (e.g. a defeated
  // enemy removed from the encounter) so a stale id never travels with an action.
  const validTargets = useMemo(
    () => targets.filter((id) => selectable.some((e) => e.entryId === id)),
    [targets, selectable]
  );

  const isTargeted = useCallback((entryId) => validTargets.includes(entryId), [validTargets]);

  const toggleTarget = useCallback((entryId) => {
    setTargets((cur) =>
      cur.includes(entryId) ? cur.filter((id) => id !== entryId) : [...cur, entryId]
    );
  }, []);

  const clearTargets = useCallback(() => setTargets([]), []);

  // Human-readable names for the current selection (for log lines).
  const targetNames = useMemo(
    () =>
      validTargets
        .map((id) => selectable.find((e) => e.entryId === id)?.name)
        .filter(Boolean),
    [validTargets, selectable]
  );

  return {
    targets: validTargets,
    selectable,
    isTargeted,
    toggleTarget,
    clearTargets,
    targetNames,
  };
};

export default useTargeting;
