// Device-local pending-roll bus (#1575 D2). The dice-tower round-trip
// (useFoundryDice) can take up to 10s with nothing but a button label to show
// for it; RollToast subscribes here to float a "Rolling in Foundry…" card
// while a request is in flight.
//
// Deliberately NOT the fx channel: fx is the cross-device, fire-and-forget
// record of RESOLVED rolls ("nothing may gate on this channel"), while a
// pending card belongs only to the device that asked and must settle or
// vanish deterministically. A plain module-level pub/sub is enough — every
// mounted useFoundryDice instance emits into it, ids are unique per request.

const listeners = new Set();

// Returns the unsubscribe function.
export const subscribePendingRolls = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// evt shapes:
//   { id, phase: 'start', charId, formula, flavor }  — request sent
//   { id, phase: 'settle', total, face }             — ack landed (face = raw
//                                                      d20, null off-d20)
//   { id, phase: 'drop' }                            — nack/timeout/unmount;
//                                                      the card just vanishes
export const emitPendingRoll = (evt) => {
  listeners.forEach((listener) => listener(evt));
};
