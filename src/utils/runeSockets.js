// Rune-socket model (#857 S6a) — the foundation for the Runesmithing tab (S6b)
// and its checkout commit (S7). Pure helpers over the app's structured rune block
// (`runes: { potency, striking|resilient, property: [] }`): derive a socket view,
// find compatible runes for a socket, and apply a rune (fundamental OR property).
//
// Unlike the prototype's flat `slots:[{type,rune}]`, sockets are DERIVED:
//   • one potency socket (the +N fundamental),
//   • one striking socket (weapons) / resilient socket (armor),
//   • property sockets numbering the potency tier (potency unlocks property).
// Applying a fundamental SETS a tier (potency number / striking|resilient key);
// applying a property rune APPENDS to `runes.property` (capacity = potency).
//
// This generalises runeWorkOrder.foldRuneIntoWeapon (which appends property runes
// only) and lives ALONGSIDE it — the live property-only etch flow keeps using the
// old helper until S7 retires it and switches the commit to applyRune.

import { newEntryUid } from './uid';
import { isArmor } from './InventoryUtils';
import { propertySlotCapacity } from './weaponRunes';
import { armorPropertySlotCapacity } from './armorRunes';
import { accessoryEligible, isAccessoryHost } from './accessoryRunes';
import { runeTarget } from './runeClassify';
import { REINFORCING, shieldPropertySlotCapacity } from './shieldRunes';
import { shieldCategory, shieldCategoriesFromUsage } from './shieldCategory';
import { isDragonbreath, dragonbreathRunes, dragonbreathUpgradeOption, applyDragonbreathUpgrade } from './dragonbreath';

// runeTarget is the canonical rune classifier (#885); re-exported here so the
// socket helpers + their callers keep importing it from one place.
export { runeTarget };

/** What a piece of gear is for rune purposes: 'shield' (has a shield block),
 *  'weapon' (has Strikes), 'armor' (has an armor block), 'ring' (a power ring —
 *  #967 R4), else null (not runesmithable). The power ring is neither weapon nor
 *  armor, so it's detected by the explicit `powerRing` marker the R1 catalog item
 *  carries. Shield is checked BEFORE strikes (#1165 S2): a shield with a bash
 *  `strikes` block is a shield target (one reinforcing socket), NOT a weapon —
 *  its bash no longer surfaces weapon potency/striking sockets. */
export const gearTarget = (item) => {
  if (!item || typeof item !== 'object') return null;
  if (item.powerRing) return 'ring';
  if (item.shield) return 'shield';
  if (item.strikes) return 'weapon';
  if (isArmor(item)) return 'armor';
  return null;
};

/** A power ring's property-socket capacity is its GRADE, not a potency rune:
 *  the resolved grade merges `ringSockets` (R1 `overrides`) onto the item. */
export const ringSocketCapacity = (item) => Number(item && item.ringSockets) || 0;

const runesOf = (item) => (item && item.runes && typeof item.runes === 'object' ? item.runes : {});

// A dragonbreath weapon's fundamentals are implied by its tier template (M4b),
// not etched runes: they are LOCKED (changed only by a tier upgrade, #1210 M4c)
// and their implied potency is what unlocks the property slots. Returns the
// effective { potency, striking, property } for such a weapon, else null.
const dbFundamentals = (item) => (isDragonbreath(item) ? dragonbreathRunes(item) : null);

const propertyCapacity = (item, target) =>
  target === 'armor' ? armorPropertySlotCapacity(runesOf(item))
    : target === 'ring' ? ringSocketCapacity(item)
      : target === 'shield' ? shieldPropertySlotCapacity(runesOf(item)) // #1196 G2: from reinforcing grade
        : propertySlotCapacity(dbFundamentals(item) || runesOf(item)); // weapon: implied potency for a dragonbreath

// A property-rune slot entry is either a bare id (string) or a { id, choice }
// object (a choice-bearing rune like Energy-Resistant, #1196 G2). These read
// each part regardless of shape.
const propRuneId = (p) => (p && typeof p === 'object' ? p.id : p);
const propRuneChoice = (p) => (p && typeof p === 'object' ? p.choice : undefined);

/**
 * Which shield size categories a property rune permits, from its `usage`
 * restriction (e.g. "etched onto a light shield", "a light or medium shield").
 * Returns null when unrestricted (no usage string, or none of the category words
 * present). Shield-only — weapon/armor property runes have no category gate.
 */
export const runeShieldCategories = (rune) => shieldCategoriesFromUsage(rune);

/** Whether `rune`'s category usage restriction admits shield `item` (via its Bulk). */
export const shieldRuneUsageAllows = (item, rune) => {
  const cats = runeShieldCategories(rune);
  if (!cats) return true; // unrestricted
  const cat = shieldCategory(item?.weight);
  return cat ? cats.includes(cat) : true; // unknown Bulk → don't block
};

/**
 * Derive the socket view for a piece of gear, in display order: potency, the
 * target's second fundamental (striking | resilient), then one property socket
 * per potency tier, then — on any usage-tagged host (#1033 S5) — the single
 * accessory socket. Each socket: { type, target, filled, value?/rune?, index? }.
 * Returns [] for gear that is neither runesmithable nor an accessory host; an
 * accessory-ONLY host (a cloak, a shield — no gearTarget) carries just the one
 * accessory socket.
 */
export const gearSockets = (item) => {
  const target = gearTarget(item);
  const runes = runesOf(item);
  const sockets = [];
  if (target === 'shield') {
    // A shield has ONE fundamental socket — reinforcing — and (per #1196 G2) a
    // number of property sockets set by its reinforcing grade (minor/lesser → 1,
    // moderate/greater → 2, major/supreme → 3). The accessory socket (below) rides
    // orthogonally and never consumes a property slot.
    sockets.push({ type: 'reinforcing', target: 'shield', filled: !!runes.reinforcing, value: runes.reinforcing || null });
    const property = Array.isArray(runes.property) ? runes.property : [];
    const cap = propertyCapacity(item, 'shield');
    for (let i = 0; i < cap; i += 1) {
      sockets.push({ type: 'property', target: 'shield', index: i, filled: property[i] != null, rune: property[i] != null ? property[i] : null });
    }
  } else if (target) {
    const property = Array.isArray(runes.property) ? runes.property : [];
    const cap = propertyCapacity(item, target);

    // A power ring has NO fundamental sockets — its imbue capacity is fixed by
    // grade (ringSockets), so every socket is a property (imbue) socket. Weapon
    // and armor lead with their two fundamentals (potency + striking|resilient)
    // before the potency-gated property sockets.
    if (target !== 'ring') {
      // Dragonbreath weapon (#1210 M4c): the fundamental sockets show the tier's
      // implied +N / striking grade, always FILLED and LOCKED — they can't be
      // etched or upgraded directly (a tier upgrade is a separate work-order).
      const db = dbFundamentals(item);
      sockets.push({
        type: 'potency', target,
        filled: db ? true : (runes.potency || 0) > 0,
        value: db ? db.potency : (runes.potency || 0),
        ...(db ? { locked: true } : {}),
      });
      if (target === 'weapon') {
        sockets.push({
          type: 'striking', target,
          filled: db ? true : !!runes.striking,
          value: db ? db.striking : (runes.striking || null),
          ...(db ? { locked: true } : {}),
        });
      } else {
        sockets.push({ type: 'resilient', target, filled: !!runes.resilient, value: runes.resilient || null });
      }
    }
    for (let i = 0; i < cap; i += 1) {
      sockets.push({ type: 'property', target, index: i, filled: property[i] != null, rune: property[i] != null ? property[i] : null });
    }
  }
  // The one accessory slot rides AFTER the target sockets — orthogonal to
  // gearTarget, so a dual-host (armor-runed Explorer's Clothing) shows both.
  if (isAccessoryHost(item)) {
    sockets.push({ type: 'accessory', target: 'accessory', filled: runes.accessory != null, rune: runes.accessory != null ? runes.accessory : null });
  }
  return sockets;
};

/**
 * Project a piece of gear as if its staged FUNDAMENTAL runes were already
 * applied, so the socket board reflects in-progress staging (#879): staging +1
 * potency on a +0 item opens, in the same visit, the property slot that tier
 * unlocks. `stagedRunes` is the `socketKey → rune` map for one gear (fundamental
 * keys are `potency`/`striking`/`resilient`). Staged PROPERTY runes are
 * deliberately not folded in — they render against the projected sockets via the
 * caller's staged map, keeping property-socket indices aligned. A staged rune
 * that won't apply (e.g. a non-upgrade) is skipped. Returns the gear unchanged
 * when nothing applies.
 */
export const projectStagedGear = (gear, stagedRunes) => {
  if (!gear || !stagedRunes || typeof stagedRunes !== 'object') return gear;
  return ['potency', 'striking', 'resilient', 'reinforcing'].reduce((g, key) => {
    const rune = stagedRunes[key];
    return rune ? applyRune(g, rune) || g : g;
  }, gear);
};

/**
 * The runes in `stock` that can fill `socketType` on `item`: same target, and —
 * for a fundamental socket — the matching fundamental kind. A potency rune only
 * qualifies if it raises the current tier (an upgrade, never a side- or down-
 * grade); a striking/resilient rune only if it differs from what's equipped.
 * The accessory socket (#1033 S5) matches by usage tags instead (and closes
 * once inscribed — one rune, no upgrade path). `stock` is an array of rune docs
 * (property or fundamental).
 */
export const compatibleRunes = (item, socketType, stock) => {
  if (socketType === 'accessory') {
    return (Array.isArray(stock) ? stock : []).filter((r) => accessoryEligible(item, r));
  }
  const target = gearTarget(item);
  if (!target) return [];
  // Dragonbreath fundamentals are template-locked (#1210 M4c): never directly
  // etchable. The only fundamental "option" is a TIER UPGRADE (#1210 M4d),
  // offered on the potency socket (it bumps both fundamentals at once) as a
  // synthetic rune that rides the work-order rail; the striking socket offers
  // nothing on its own.
  if ((socketType === 'potency' || socketType === 'striking') && dbFundamentals(item)) {
    if (socketType === 'striking') return [];
    const opt = dragonbreathUpgradeOption(item);
    return opt ? [opt] : [];
  }
  const runes = runesOf(item);
  return (Array.isArray(stock) ? stock : []).filter((r) => {
    if (runeTarget(r) !== target) return false;
    if (socketType === 'property') {
      if (r.type !== 'property') return false;
      // Shield property runes (#1196 G2): honor the rune's category usage gate and
      // hide one already applied unless it's explicitly duplicable (Energy-Resistant).
      if (target === 'shield') {
        if (!shieldRuneUsageAllows(item, r)) return false;
        if (!r.duplicable && (runes.property || []).some((p) => propRuneId(p) === r.id)) return false;
      }
      return true;
    }
    if (r.type !== 'fundamental' || r.fundamental !== socketType) return false;
    if (socketType === 'potency') return (r.tier || 0) > (runes.potency || 0);
    if (socketType === 'reinforcing') {
      // Reinforcing upgrades by RANK (like potency), not by !== — a higher grade
      // replaces a lower one; same/lower grades don't qualify.
      const cur = REINFORCING[runes.reinforcing]?.rank || 0;
      return (REINFORCING[r.tierKey]?.rank || 0) > cur;
    }
    return runes[socketType] !== r.tierKey; // striking | resilient differs from equipped
  });
};

/**
 * Apply one rune to a piece of gear, returning a fresh-uid runed snapshot (the
 * shape useRuneWork credits back), or `null` when it can't be applied:
 * incompatible target, no free property slot, a duplicate property rune, or a
 * non-upgrade fundamental. Transient loadout fields (state/hand) are dropped so
 * the owner's tree re-derives placement.
 */
export const applyRune = (gear, rune, opts = {}) => {
  if (!gear || !rune) return null;

  // Accessory runes (#1033 S1) bypass the single-target model entirely: the
  // host is classified by usage tags (accessoryEligible), not gearTarget, so a
  // cloak (no target) and an armor-runed Explorer's Clothing (target 'armor')
  // both take the one accessory slot the same way.
  if (runeTarget(rune) === 'accessory') {
    if (rune.type !== 'property' || !accessoryEligible(gear, rune)) return null;
    const { state, hand, ...rest } = gear;
    const nextRunes = { ...runesOf(gear), accessory: rune.id };
    // Etch-time config (#1059): a Dragon's Breath rune staged with a chosen
    // dragon type bakes it onto the entry as `accessoryConfig`, so the depicted
    // damage type is fixed at purchase (useCharacter reads it; the ItemModal
    // picker can still override via the runeconfig overlay).
    if (rune.etchConfig && typeof rune.etchConfig === 'object') {
      nextRunes.accessoryConfig = { ...rune.etchConfig };
    }
    return { ...rest, uid: newEntryUid(), runes: nextRunes };
  }

  const target = gearTarget(gear);
  if (!target || runeTarget(rune) !== target) return null;
  // Dragonbreath tier upgrade (#1210 M4d): the synthetic upgrade "rune" bumps the
  // template tier (both fundamentals at once), preserving the dragon kind +
  // property runes. Handled before the fundamental-lock guard, since it is
  // shaped like a potency rune but is a tier change, not an etch.
  if (rune.dragonbreathUpgrade && isDragonbreath(gear)) {
    const upgraded = applyDragonbreathUpgrade(gear, rune.dragonbreathUpgrade);
    if (!upgraded) return null;
    const { state, hand, ...rest } = upgraded;
    return { ...rest, uid: newEntryUid() };
  }
  // Dragonbreath fundamentals are template-locked (#1210 M4c) — reject a direct
  // potency/striking etch; property runes still apply into the implied slots,
  // and the stored runes block stays free of the implied fundamentals (the
  // template supplies them at resolve time, so writing them would double up).
  if (rune.type === 'fundamental' && (rune.fundamental === 'potency' || rune.fundamental === 'striking') && isDragonbreath(gear)) {
    return null;
  }
  const runes = runesOf(gear);
  const property = Array.isArray(runes.property) ? runes.property : [];
  let nextRunes;

  if (rune.type === 'property') {
    const used = property.filter(Boolean).length;
    if (used >= propertyCapacity(gear, target)) return null;
    // Shield property runes (#1196 G2) honor a category usage gate.
    if (target === 'shield' && !shieldRuneUsageAllows(gear, rune)) return null;
    // A duplicable rune (Energy-Resistant) may be applied more than once — but
    // never with a choice already present. Every other property rune is unique.
    // The chosen value comes from opts (GM instant-apply) or, for a shop-staged
    // rune, from its baked `etchConfig.choice` (#1059 carrier) — mirroring how
    // the accessory branch above reads etchConfig, so a player-etched choice
    // survives fulfillment (applyRunesToGear calls applyRune without opts).
    const choice = opts && opts.choice != null
      ? opts.choice
      : (rune.etchConfig && rune.etchConfig.choice != null ? rune.etchConfig.choice : undefined);
    const sameId = property.filter((p) => propRuneId(p) === rune.id);
    const exactDup = sameId.some((p) => (propRuneChoice(p) ?? null) === (choice ?? null));
    if (exactDup || (sameId.length && !rune.duplicable)) return null;
    // Store a bare id, or { id, choice } when a choice was made — the resolver
    // (contentUtils) inlines the doc and carries the choice through.
    const entry = choice !== undefined ? { id: rune.id, choice } : rune.id;
    nextRunes = { ...runes, property: [...property, entry] };
  } else if (rune.type === 'fundamental' && rune.fundamental === 'potency') {
    if ((runes.potency || 0) >= (rune.tier || 0)) return null;
    nextRunes = { ...runes, potency: rune.tier };
  } else if (rune.type === 'fundamental' && rune.fundamental === 'striking' && target === 'weapon') {
    if (runes.striking === rune.tierKey) return null;
    nextRunes = { ...runes, striking: rune.tierKey };
  } else if (rune.type === 'fundamental' && rune.fundamental === 'resilient' && target === 'armor') {
    if (runes.resilient === rune.tierKey) return null;
    nextRunes = { ...runes, resilient: rune.tierKey };
  } else if (rune.type === 'fundamental' && rune.fundamental === 'reinforcing' && target === 'shield') {
    // Reinforcing sets the single fundamental socket; only a rank upgrade applies.
    const cur = REINFORCING[runes.reinforcing]?.rank || 0;
    if ((REINFORCING[rune.tierKey]?.rank || 0) <= cur) return null;
    nextRunes = { ...runes, reinforcing: rune.tierKey };
  } else {
    return null;
  }

  const { state, hand, ...rest } = gear;
  return { ...rest, uid: newEntryUid(), runes: nextRunes };
};

/**
 * Whether a piece of gear belongs on the storefront etch list (#1033 S5).
 * Target gear (weapon / armor / power ring) always shows, as before. An
 * accessory-ONLY host (a cloak, boots, a shield — no target sockets) shows
 * only when the shop stocks at least one rune it could actually take, so
 * every light-bulk trinket in a full inventory doesn't flood the board — and
 * an already-inscribed one drops off again (one rune per item, nothing left
 * to etch; its inscription still shows on any dual-host card and in the
 * inventory ItemModal). `stock` is the shop's rune-doc list (the same one
 * the socket picker reads).
 */
export const inEtchList = (item, stock) =>
  !!gearTarget(item) ||
  (isAccessoryHost(item) && compatibleRunes(item, 'accessory', stock).length > 0);
