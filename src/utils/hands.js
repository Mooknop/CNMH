// src/utils/hands.js
// Derive the two hand slots from an effective inventory list. A two-handed grip
// (state 'held2') fills both slots with the same item; otherwise each 'held1'
// item is placed by its `hand` (1 or 2), with any hand-less held items falling
// into the first free slot(s). Shared by the Encounter HandsPanel and the
// Inventory Hands strip so the derivation lives in exactly one place.
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

export default deriveHands;
