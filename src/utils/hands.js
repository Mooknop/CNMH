// src/utils/hands.js
// Derive the two hand slots from an effective inventory list. A two-handed grip
// (state 'held2') fills both slots with the same item; otherwise each 'held1'
// item is placed by its `hand` (1 or 2), with any hand-less held items falling
// into the first free slot(s). Shared by the encounter hands surfaces and the
// Inventory Hands strip so the derivation lives in exactly one place.
import { isContainer } from './InventoryUtils';
import { isBodyBound } from './itemState';

export const deriveHands = (items = []) => {
  const list = Array.isArray(items) ? items : [];
  const two = list.find((e) => e && e.state === 'held2');
  if (two) return { slot1: two, slot2: two };
  const ones = list.filter((e) => e && e.state === 'held1');
  const noHand = ones.filter((e) => e.hand == null);
  const byHand = (h) => ones.find((e) => e.hand === h);
  return {
    slot1: byHand(1) || noHand[0] || null,
    slot2: byHand(2) || noHand[1] || null,
  };
};

// Whether the item demands both hands to wield, from its usage text ("held in
// 2 hands" / "held in two hands" — both spellings appear in the seed). Same
// reading as whetstone's regrip check; a versatile two-hand-trait weapon
// defaults to one hand and is intentionally not matched.
export const isTwoHanded = (item) =>
  /\b(?:2|two)\s+hands\b/i.test(String(item?.usage || ''));

// The Worn items a hand could take: on-person, not a container (can't be
// held), not body-bound (tattoos can't leave the body for a hand).
export const wieldableWorn = (items = []) =>
  (Array.isArray(items) ? items : []).filter(
    (e) => e && e.state === 'worn' && !isContainer(e) && !isBodyBound(e)
  );

// Everything the Items-segment Hands group lists: currently-held items (a 2H
// grip contributes one row) followed by the wieldable Worn pool.
export const handCandidates = (items = []) => {
  const { slot1, slot2 } = deriveHands(items);
  const held = slot1 === slot2 ? [slot1].filter(Boolean) : [slot1, slot2].filter(Boolean);
  return [...held, ...wieldableWorn(items)];
};

export default deriveHands;
