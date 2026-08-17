import { useCallback, useContext, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { useItemHp } from './useItemHp';
import { CharacterContext } from '../contexts/CharacterContext';
import { isHeldState } from '../utils/itemState';
import { isStrappedShield } from '../utils/hands';
import { normalizeShield, isShieldBroken } from '../utils/InventoryUtils';
import { applyShieldBlock } from '../utils/shieldBlock';
import { resolveShieldBlock, shieldDisplayName } from '../utils/shieldRunes';
import {
  shieldBuffHardnessBonus, shieldBuffGrantedTraits, shieldBuffEnergyBlock,
} from '../utils/shieldTalismans';
import { isDestroyedHp } from '../utils/itemDurability';
import { hasRustBlessing } from '../utils/rustBlessing';
import { RELAY, APP, syncKey } from '../sync/keys';

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
//   cnmh_itemhp_<charId>       = { [uid]: { hp } }   — shared item-HP overlay (#541)
// Shield HP predating the durability epic lives on cnmh_shieldstate_<charId>;
// useItemHp reads that as a fallback. Neither key syncs back to Foundry; the
// shield is a self-contained item.
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

  // Shared per-item mutable HP map (#541). Keyed by item uid; falls back to
  // the authored shield.hp when no block has been recorded this session.
  // tempHpFor reads the Heartstone temp-HP pool riding the same record (#1246).
  const { hpFor, tempHpFor, setHp } = useItemHp(charId);

  // Active shield-talisman buffs (#1246) live in the character's effects store
  // as `shieldBuff`-tagged entries (the whetstone pattern — no new synced key).
  // Read here so the held shield's Hardness folds in an Adamantine Flake and
  // the block surface sees a Prismatic Crystal's energy-block window.
  const [activeEffects] = useSyncedState(syncKey(APP.EFFECTS, charId || 'none'), []);

  // The shield currently in the character's charge — kept as `heldShield` for
  // its 16 consumers, but since the strapped-shields slices it also covers a
  // buckler-class shield worn ON a hand (`strapHand` + stamped `strapUsable`,
  // see utils/hands.js). A shield held IN a hand still wins; among strapped
  // shields, one whose hand currently allows use shadows a blocked one.
  // `maxHp` is the authored (full) HP — the cap the live overlay is restored
  // toward.
  const heldShield = useMemo(() => {
    const list = inventory || [];
    const entry =
      list.find((e) => e && e.shield && isHeldState(e.state)) ||
      list.find((e) => e && e.shield && e.strapHand && e.strapUsable) ||
      list.find((e) => e && e.shield && e.strapHand);
    if (!entry) return null;
    // Fold any reinforcing rune into the base durability stats before normalizing,
    // so Hardness/HP/BT (and maxHp) reflect the etched rune (#1165 S1).
    const base = normalizeShield(resolveShieldBlock(entry));
    // Overlay the session HP if a block has been recorded.
    const liveHp = hpFor(entry.uid);
    const withHp = liveHp !== undefined ? { ...base, hp: liveHp } : base;
    // An active Adamantine Flake buff (#1246) raises the shield's Hardness for
    // its minute — folded here so applyBlock and every display agree.
    const buffHardness = shieldBuffHardnessBonus(activeEffects, entry.uid);
    const shield = buffHardness
      ? { ...withHp, hardness: (withHp.hardness || 0) + buffHardness }
      : withHp;
    // Resolved Remaster name ("Minor Reinforcing Steel Shield") for every held-
    // shield surface; a non-reinforced shield keeps its own name (#1165 S4).
    return {
      uid: entry.uid,
      name: shieldDisplayName(entry),
      shield,
      maxHp: base.hp,
      // Heartstone temp-HP pool (#1246) — spent before HP on a block.
      tempHp: tempHpFor(entry.uid),
      // Talisman-buff annotations (#1246): the folded Hardness bonus, granted
      // traits (Tree Sap), and the energy type a Prismatic Crystal lets this
      // shield block (and be immune to) — null when none is active.
      buffHardness,
      buffTraits: shieldBuffGrantedTraits(activeEffects, entry.uid),
      energyBlock: shieldBuffEnergyBlock(activeEffects, entry.uid),
      // Strapped-shield extras (absent/false for a held shield). `strapUsable`
      // is the effective-inventory stamp of the buckler rule: the strapped
      // hand is empty or holds a light non-weapon.
      strapped: !isHeldState(entry.state) && !!entry.strapHand,
      strapHand: !isHeldState(entry.state) ? entry.strapHand : undefined,
      strapUsable: isHeldState(entry.state) || entry.strapUsable === true,
    };
  }, [inventory, hpFor, tempHpFor, activeEffects]);

  const broken = heldShield ? isShieldBroken(heldShield.shield) : false;
  const destroyed = heldShield ? isDestroyedHp(heldShield.shield?.hp ?? 0) : false;

  // Rust Blessing (campaign boon): the wielder keeps using a BROKEN shield —
  // full AC bonus and Shield Block — though destruction at 0 HP still ends it.
  // Resolved from the character doc by id so every useShield call site agrees;
  // outside a CharacterProvider (bare hook tests) the boon is simply off.
  const characterCtx = useContext(CharacterContext);
  const wieldBroken = hasRustBlessing(characterCtx?.getCharacter?.(charId));

  // Can the shield be used at all right now (Raise / Block)? A strapped
  // shield additionally needs its hand to pass the buckler rule.
  const usable =
    !!heldShield && !destroyed && (!broken || wieldBroken) && heldShield.strapUsable;

  const raised =
    !!raiseState?.raised &&
    !!heldShield &&
    raiseState.uid === heldShield.uid &&
    usable;

  // A raised strapped shield that can no longer stay raised: its hand got tied
  // up (something was placed into it mid-raise), or it was unstrapped/stowed.
  // `raised` is already false in those cases — the AC bonus is gone — but the
  // persisted raise state is stale-true and would silently spring back the
  // moment the hand empties. Resolved against the raise state's own uid (not
  // the current selection) so a second shield can't mask it; the owning client
  // (TurnTrackerPanel) watches this and actively lowers + logs.
  const strapObstructed = useMemo(() => {
    if (!raiseState?.raised) return false;
    const entry = (inventory || []).find((e) => e && e.uid === raiseState.uid);
    if (!entry || !isStrappedShield(entry) || isHeldState(entry.state)) return false;
    return !(entry.strapHand && entry.strapUsable === true);
  }, [raiseState, inventory]);

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
  // `shieldImmune` (#1246 — Prismatic Crystal) blocks the crystal's energy type:
  // the character's share is normal but the shield itself takes nothing.
  const applyBlock = useCallback(
    (dealt, { hardnessBonus = 0, shieldImmune = false } = {}) => {
      if (!heldShield) return null;
      const { hp, hardness = 0, brokenThreshold = 0 } = heldShield.shield;
      const result = applyShieldBlock({
        dealt,
        hardness,
        shieldHp: hp ?? 0,
        brokenThreshold,
        hardnessBonus,
        shieldTempHp: heldShield.tempHp || 0,
        shieldImmune,
      });
      setHp(heldShield.uid, result.shieldHpAfter, result.shieldTempHpAfter);
      return result;
    },
    [heldShield, setHp]
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
      setHp(heldShield.uid, next);
      return next;
    },
    [heldShield, setHp]
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

  return { heldShield, raised, broken, destroyed, usable, wieldBroken, strapObstructed, raiseShield, lowerShield, applyBlock, repairShield, shieldEffect };
};

export default useShield;
