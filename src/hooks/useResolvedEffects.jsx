import { useMemo } from 'react';
import { useEffects } from './useEffects';
import { useShield } from './useShield';
import { useWornGear } from './useWornGear';
import { useContent } from '../contexts/ContentContext';

// The character's full active-effect universe plus the catalog needed to resolve
// it (#922 S2). One source of truth for every effect reader:
//
//   effects  = app effects + Foundry effects (useEffects) + the always-on
//              synthetic effects from a raised shield and worn/invested gear
//   catalog  = the content effect catalog + the synthetic defs
//
// Shield/worn defs carry dynamic ids (`raised-shield`, `worn-<uid>`) that are
// NOT in the content catalog, so the returned `catalog` appends them — otherwise
// a reader handed only `useContent().effects` couldn't resolve those entries.
//
// This is the merge StatsBlock used to do inline; extracting it lets the
// damage-resistance apply-sites (resistanceFor at AdjustHpModal / PersistentChip)
// see worn gear too, not just `cnmh_effects`.
//
// @param {string} charId
// @param {Array}  inventory - the character's effective (state-stamped) inventory
// @returns {{ effects: Array, catalog: Array }}
export const useResolvedEffects = (charId, inventory = []) => {
  const { effects: activeEffects } = useEffects(charId);
  const { effects: contentCatalog } = useContent();
  const { shieldEffect } = useShield(charId, inventory);
  const { wornEffects } = useWornGear(charId, inventory);

  return useMemo(() => {
    const synth = [
      ...(shieldEffect ? [shieldEffect] : []),
      ...wornEffects,
    ];
    if (!synth.length) {
      return { effects: activeEffects, catalog: contentCatalog };
    }
    return {
      effects: [...activeEffects, ...synth.map((s) => s.entry)],
      catalog: [...(contentCatalog || []), ...synth.map((s) => s.def)],
    };
  }, [activeEffects, contentCatalog, shieldEffect, wornEffects]);
};

export default useResolvedEffects;
