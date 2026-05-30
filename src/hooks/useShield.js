import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { isHeldState } from '../utils/itemState';
import { normalizeShield, isShieldBroken } from '../utils/InventoryUtils';
import { applyShieldBlock } from '../utils/shieldBlock';

// Raise a Shield (PF2e): while wielding a shield, spend 1 action to gain a
// circumstance bonus to AC equal to the shield's AC bonus until the start of
// your next turn.
//
// Shield Block (PF2e): reaction triggered when a raised shield takes a physical
// hit — the shield's Hardness reduces damage; both character and shield take
// the remainder. If shield HP drops to/below its broken threshold it breaks.
//
// All shield state lives in the app:
//   cnmh_shieldraise_<charId>  = { raised, uid, ts }
//   cnmh_shieldstate_<charId>  = { [uid]: { hp } }   — mutable HP per shield
// Neither key syncs back to Foundry; the shield is a self-contained item.
export const RAISED_SHIELD_EFFECT_ID = 'raised-shield';

const IDLE_RAISE = { raised: false, uid: null, ts: 0 };

/**
 * @param {string} charId
 * @param {Array}  inventory - the character's effective inventory (held state stamped)
 */
export const useShield = (charId, inventory = []) => {
  const [raiseState, setRaiseState] = useSyncedState(
    `cnmh_shieldraise_${charId || 'none'}`,
    IDLE_RAISE
  );

  // Per-shield mutable HP map. Keyed by item uid; falls back to the authored
  // shield.hp when no block has been recorded this session.
  const [shieldState, setShieldState] = useSyncedState(
    `cnmh_shieldstate_${charId || 'none'}`,
    {}
  );

  // The shield currently in a hand. First held entry wins.
  const heldShield = useMemo(() => {
    const entry = (inventory || []).find(
      (e) => e && e.shield && isHeldState(e.state)
    );
    if (!entry) return null;
    const base = normalizeShield(entry.shield);
    // Overlay the session HP if a block has been recorded.
    const liveHp = shieldState?.[entry.uid]?.hp;
    const shield = liveHp !== undefined ? { ...base, hp: liveHp } : base;
    return { uid: entry.uid, name: entry.name, shield };
  }, [inventory, shieldState]);

  const broken = heldShield ? isShieldBroken(heldShield.shield) : false;

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

  // Apply a Shield Block against incoming damage. Runs the math app-side,
  // persists the new HP, and returns the full result for the caller to log.
  const applyBlock = useCallback(
    (dealt) => {
      if (!heldShield) return null;
      const { hp, hardness = 0, brokenThreshold = 0 } = heldShield.shield;
      const result = applyShieldBlock({
        dealt,
        hardness,
        shieldHp: hp ?? 0,
        brokenThreshold,
      });
      setShieldState((cur) => ({
        ...(cur || {}),
        [heldShield.uid]: { hp: result.shieldHpAfter },
      }));
      return result;
    },
    [heldShield, setShieldState]
  );

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

  return { heldShield, raised, broken, raiseShield, lowerShield, applyBlock, shieldEffect };
};

export default useShield;
