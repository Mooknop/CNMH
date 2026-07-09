import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { isHeldState } from '../utils/itemState';
import { normalizeShield, isShieldBroken } from '../utils/InventoryUtils';
import { applyShieldBlock } from '../utils/shieldBlock';
import { resolveShieldBlock, shieldDisplayName } from '../utils/shieldRunes';
import { RELAY, syncKey } from '../sync/keys';

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
    syncKey(RELAY.SHIELDRAISE, charId || 'none'),
    IDLE_RAISE
  );

  // Per-shield mutable HP map. Keyed by item uid; falls back to the authored
  // shield.hp when no block has been recorded this session.
  const [shieldState, setShieldState] = useSyncedState(
    `cnmh_shieldstate_${charId || 'none'}`,
    {}
  );

  // The shield currently in a hand. First held entry wins. `maxHp` is the
  // authored (full) HP — the cap the live overlay is restored toward.
  const heldShield = useMemo(() => {
    const entry = (inventory || []).find(
      (e) => e && e.shield && isHeldState(e.state)
    );
    if (!entry) return null;
    // Fold any reinforcing rune into the base durability stats before normalizing,
    // so Hardness/HP/BT (and maxHp) reflect the etched rune (#1165 S1).
    const base = normalizeShield(resolveShieldBlock(entry));
    // Overlay the session HP if a block has been recorded.
    const liveHp = shieldState?.[entry.uid]?.hp;
    const shield = liveHp !== undefined ? { ...base, hp: liveHp } : base;
    // Resolved Remaster name ("Minor Reinforcing Steel Shield") for every held-
    // shield surface; a non-reinforced shield keeps its own name (#1165 S4).
    return { uid: entry.uid, name: shieldDisplayName(entry), shield, maxHp: base.hp };
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
  // `hardnessBonus` adds effective Hardness for this block only — e.g. a
  // deflecting shield's +2 vs a ranged attack (#1196 G1), decided by the caller.
  const applyBlock = useCallback(
    (dealt, { hardnessBonus = 0 } = {}) => {
      if (!heldShield) return null;
      const { hp, hardness = 0, brokenThreshold = 0 } = heldShield.shield;
      const result = applyShieldBlock({
        dealt,
        hardness,
        shieldHp: hp ?? 0,
        brokenThreshold,
        hardnessBonus,
      });
      setShieldState((cur) => ({
        ...(cur || {}),
        [heldShield.uid]: { hp: result.shieldHpAfter },
      }));
      return result;
    },
    [heldShield, setShieldState]
  );

  // Repair (#579): restore HP to the held shield, capped at its full HP. A
  // positive restore above the broken threshold clears the Broken state via the
  // normal HP comparison (isShieldBroken). React-free callers pass the amount.
  const repairShield = useCallback(
    (amount) => {
      if (!heldShield || !(amount > 0)) return null;
      const max = heldShield.maxHp ?? heldShield.shield?.hp ?? 0;
      const current = heldShield.shield?.hp ?? 0;
      const next = Math.min(max, current + amount);
      setShieldState((cur) => ({
        ...(cur || {}),
        [heldShield.uid]: { hp: next },
      }));
      return next;
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

  return { heldShield, raised, broken, raiseShield, lowerShield, applyBlock, repairShield, shieldEffect };
};

export default useShield;
