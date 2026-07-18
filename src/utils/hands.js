// src/utils/hands.js
// Derive the two hand slots from an effective inventory list. A two-handed grip
// (state 'held2') fills both slots with the same item; otherwise each 'held1'
// item is placed by its `hand` (1 or 2), with any hand-less held items falling
// into the first free slot(s). Shared by the encounter hands surfaces and the
// Inventory Hands strip so the derivation lives in exactly one place.
//
// Strapped shields (bucklers, shield gauntlets — `shield.strapped` in the
// catalog) are worn ON a hand rather than held IN it: they ride along as
// `strap1`/`strap2` overlays without ever occupying a slot, and can only be
// Raised / Activated while their hand passes `handAllowsStrapUse`.
import { isContainer } from './InventoryUtils';
import { isBodyBound } from './itemState';

// A shield that straps to a hand instead of being held (buckler class).
// Strap-only by design: it never enters held1/held2 and never fills a slot.
export const isStrappedShield = (item) => !!(item && item.shield && item.shield.strapped);

export const deriveHands = (items = []) => {
  const list = Array.isArray(items) ? items : [];
  const strapFor = (h) =>
    list.find(
      (e) => e && e.state === 'worn' && e.strapHand === h && isStrappedShield(e)
    ) || null;
  const straps = { strap1: strapFor(1), strap2: strapFor(2) };
  const two = list.find((e) => e && e.state === 'held2');
  if (two) return { slot1: two, slot2: two, ...straps };
  const ones = list.filter((e) => e && e.state === 'held1');
  const noHand = ones.filter((e) => e.hand == null);
  const byHand = (h) => ones.find((e) => e.hand === h);
  return {
    slot1: byHand(1) || noHand[0] || null,
    slot2: byHand(2) || noHand[1] || null,
    ...straps,
  };
};

// The buckler rule (table-agreed, matches RAW): a strapped shield can be
// Raised / its abilities Activated while that hand is empty OR holding a light
// object (Bulk L or negligible — weight < 1 in Bulk units) that isn't a
// weapon. Wielding anything heavier, or any weapon, ties the hand up.
export const handAllowsStrapUse = (hands, hand) => {
  const occupant = hand === 2 ? hands?.slot2 : hands?.slot1;
  if (!occupant) return true;
  return !occupant.strikes && (occupant.weight || 0) < 1;
};

// Whether the item demands both hands to wield, from its usage text ("held in
// 2 hands" / "held in two hands" — both spellings appear in the seed). Same
// reading as whetstone's regrip check; a versatile two-hand-trait weapon
// defaults to one hand and is intentionally not matched.
export const isTwoHanded = (item) =>
  /\b(?:2|two)\s+hands\b/i.test(String(item?.usage || ''));

// Whether the item is something you'd wield — the Hands group's Swap list is
// for gear that belongs in a hand, not every worn belonging. Weapons (Strike
// data), shields, staves/wands, and anything whose usage says it's held
// (torches, healer's tools, …) qualify; potions, armor, and plain worn
// trinkets don't (consumables already have their own draw-costed tiles).
export const isWieldable = (item) => {
  if (!item) return false;
  // Strapped shields are strap-only: they go on a hand via the Strap flow,
  // never into a held slot, so the Swap pool must not offer them.
  if (isStrappedShield(item)) return false;
  // Attachments, runes and talismans ride on a host — they carry strike/usage
  // data but are never wielded on their own (Shield Spikes, weapon runes, …).
  // Seed shapes vary: an `attachment` field / Attached trait (spikes, boss) or
  // an attached/affixed/applied usage string (runes, talismans).
  if (item.attachment) return false;
  if ((item.traits || []).some((t) => String(t).toLowerCase() === 'attached')) return false;
  if (/\b(attached|affixed|applied)\b/i.test(String(item.usage || ''))) return false;
  return (
    !!item.strikes ||
    !!item.shield ||
    !!item.staff ||
    !!item.wand ||
    /\bheld\b/i.test(String(item.usage || ''))
  );
};

// The Worn items a hand could take: on-person, wieldable, not a container
// (can't be held), not body-bound (tattoos can't leave the body for a hand).
export const wieldableWorn = (items = []) =>
  (Array.isArray(items) ? items : []).filter(
    (e) =>
      e &&
      e.state === 'worn' &&
      isWieldable(e) &&
      !isContainer(e) &&
      !isBodyBound(e)
  );

// The strapped-class shields available to the Strap flow: on-person (Worn,
// top-level — a stowed buckler must be retrieved first), whether currently
// strapped to a hand or not.
export const strappableWorn = (items = []) =>
  (Array.isArray(items) ? items : []).filter(
    (e) => e && e.state === 'worn' && isStrappedShield(e)
  );

// Everything the Items-segment Hands group lists: currently-held items (a 2H
// grip contributes one row), the wieldable Worn pool, then the strappable
// shields (their own Strap flow, but they're hand gear all the same — a
// buckler-only character still gets the Hands group).
export const handCandidates = (items = []) => {
  const { slot1, slot2 } = deriveHands(items);
  const held = slot1 === slot2 ? [slot1].filter(Boolean) : [slot1, slot2].filter(Boolean);
  return [...held, ...wieldableWorn(items), ...strappableWorn(items)];
};

export default deriveHands;
