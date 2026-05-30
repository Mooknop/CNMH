import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { isHeldState } from '../utils/itemState';
import { normalizeShield, isShieldBroken } from '../utils/InventoryUtils';

// Raise a Shield (PF2e): while wielding a shield, spend 1 action to gain a
// circumstance bonus to AC equal to the shield's AC bonus until the start of
// your next turn. Only the highest circumstance bonus to AC applies, so a raised
// shield doesn't stack with Take Cover or the Shield cantrip — EffectUtils'
// bestOfKind already enforces that once this is injected as a circumstance bonus.
//
// "Raised" is transient combat state (it auto-lowers at the start of the
// wielder's next turn), so it lives on the session relay at
// cnmh_shieldraise_<charId> rather than in the durable loadout. The shape
// matches the optional Foundry mirror key from the plan: { raised, uid, ts }.
export const RAISED_SHIELD_EFFECT_ID = 'raised-shield';

const IDLE = { raised: false, uid: null, ts: 0 };

/**
 * @param {string} charId
 * @param {Array} inventory - the character's effective inventory (held state stamped)
 */
export const useShield = (charId, inventory = []) => {
  const [raiseState, setRaiseState] = useSyncedState(
    `cnmh_shieldraise_${charId || 'none'}`,
    IDLE
  );

  // The shield currently in a hand. Companions/multiple shields are rare; the
  // first held shield entry wins. Normalized so legacy data shapes work.
  const heldShield = useMemo(() => {
    const entry = (inventory || []).find(
      (e) => e && e.shield && isHeldState(e.state)
    );
    if (!entry) return null;
    return { uid: entry.uid, name: entry.name, shield: normalizeShield(entry.shield) };
  }, [inventory]);

  const broken = heldShield ? isShieldBroken(heldShield.shield) : false;

  // Raised only counts while the same shield is still held and unbroken. A
  // dropped/swapped/broken shield silently stops contributing its bonus.
  const raised =
    !!raiseState?.raised &&
    !!heldShield &&
    raiseState.uid === heldShield.uid &&
    !broken;

  const raiseShield = useCallback(
    (uid) => setRaiseState({ raised: true, uid, ts: Date.now() }),
    [setRaiseState]
  );

  const lowerShield = useCallback(
    () => setRaiseState({ raised: false, uid: null, ts: Date.now() }),
    [setRaiseState]
  );

  // The synthetic active-effect entry + catalog def StatsBlock feeds to
  // computeEffectBonuses while the shield is raised. The bonus amount is dynamic
  // (the shield's AC bonus), so it can't be a static catalog entry — it's built
  // here and appended to both the active-effect list and the catalog.
  const shieldEffect = useMemo(() => {
    if (!raised || !heldShield) return null;
    const bonus = heldShield.shield?.bonus || 0;
    return {
      entry: { id: RAISED_SHIELD_EFFECT_ID, effectId: RAISED_SHIELD_EFFECT_ID },
      def: {
        id: RAISED_SHIELD_EFFECT_ID,
        name: 'Raised Shield',
        modifiers: [{ stat: 'ac', kind: 'circumstance', amount: bonus }],
      },
    };
  }, [raised, heldShield]);

  return { heldShield, raised, broken, raiseShield, lowerShield, shieldEffect };
};

export default useShield;
