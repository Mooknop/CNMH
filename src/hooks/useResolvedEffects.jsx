import { useContext, useMemo } from 'react';
import { useEffects } from './useEffects';
import { useShield } from './useShield';
import { useWornGear } from './useWornGear';
import { useSyncedState } from './useSyncedState';
import { heldShieldRuneEffects } from '../utils/shieldRuneEffects';
import { brokenArmorEffect } from '../utils/rustBlessing';
import { useContent } from '../contexts/ContentContext';
import { CharacterContext } from '../contexts/CharacterContext';
import { APP, syncKey } from '../sync/keys';

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
  // Broken worn armor (#539): a status penalty to AC (−1/−2/−3 by category;
  // one step kinder under Rust Blessing) synthesized into the effect universe
  // so it nets against other status modifiers in the normal engine.
  const [itemHpState] = useSyncedState(syncKey(APP.ITEMHP, charId || 'none'), {});
  const characterCtx = useContext(CharacterContext);
  const characterDoc = characterCtx?.getCharacter?.(charId) || null;

  return useMemo(() => {
    const brokenArmor = brokenArmorEffect(inventory, itemHpState, characterDoc);
    const synth = [
      ...(shieldEffect ? [shieldEffect] : []),
      ...wornEffects,
      // Held-shield property runes (#1196 G3): passive effects from a wielded
      // shield (e.g. Energy-Resistant resistance vs its chosen type).
      ...heldShieldRuneEffects(inventory),
      ...(brokenArmor ? [brokenArmor] : []),
    ];
    if (!synth.length) {
      return { effects: activeEffects, catalog: contentCatalog };
    }
    return {
      effects: [...activeEffects, ...synth.map((s) => s.entry)],
      catalog: [...(contentCatalog || []), ...synth.map((s) => s.def)],
    };
  }, [activeEffects, contentCatalog, shieldEffect, wornEffects, inventory, itemHpState, characterDoc]);
};

export default useResolvedEffects;
