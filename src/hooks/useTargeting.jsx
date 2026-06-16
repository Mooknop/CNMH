import { useState, useCallback, useMemo } from 'react';

// Slice 2 substrate: local target selection for the encounter.
//
// Targets are encounter entryIds, sourced from the live initiative order. The
// selection is transient UI state (it does not need to sync until an action is
// actually used — that goes out over cnmh_action_<charId>), so it lives in local
// state. Callers clear it on turn end.
//
// Self is excluded by default (you attack others); pass includeSelf for buffs
// that can target the caster.
//
// `defaultTargetId` pre-selects one entry on mount (#412) — used to seed the
// focused foe so focus → resolve is one tap. An id that isn't selectable is
// harmlessly dropped by the validTargets filter below.
//
// @param {string} charId  - the acting character (used to identify "self")
// @param {Array}  order   - encounter.order entries [{ entryId, kind, name, charId? }]
// @param {{ includeSelf?: boolean, defaultTargetId?: string|null }} [opts]
export const useTargeting = (charId, order = [], opts = {}) => {
  const { includeSelf = false, defaultTargetId = null } = opts;
  const [targets, setTargets] = useState(() => (defaultTargetId ? [defaultTargetId] : []));

  const selectable = useMemo(
    () =>
      (order || []).filter(
        (e) => e && e.entryId && (includeSelf || e.charId !== charId)
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
