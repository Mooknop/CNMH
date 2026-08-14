// Movement action accounting (#415, #391). Originally shared by the PC movement
// sheet, minion movement, and the foe dock so all three charged Strides the same
// way: 1 action on the first step, then one more each time the running distance
// under the current Stride would cross the actor's Speed.

// #1736 S5: MoveActionSheet's PC Stride retired its 5-ft D-pad fallback once the
// destination-tap confirm-gate flow (actionsForDistance below) shipped and was
// verified — it no longer calls this. needsNewStride is NOT dead, though: it
// still backs the per-step stepper fallback in MinionMove and DockEnemyPane
// (foe movement), which keep their D-pads on a below-protocol-floor bridge.
// Leave this in place for those two surfaces; only remove it if/when they also
// retire their steppers.
/**
 * Whether the next step starts a *new* Stride action.
 *
 * @param {number} feetThisAction - distance already walked under the current Stride
 *                                  (0 before the first step of a fresh Stride)
 * @param {number} stepFeet       - the distance of the step about to be taken
 * @param {number} speed          - the actor's land Speed in feet
 * @returns {boolean}
 */
export const needsNewStride = (feetThisAction, stepFeet, speed) =>
  feetThisAction === 0 || feetThisAction + stepFeet > speed;

// The bridge protocol that taught the movement rail to resolve combat entryIds
// (#1572 A1) — the dock's foe Move tab gates on this floor so an older module
// never shows a pad whose requests would be silently ignored.
export const ENEMY_MOVE_PROTOCOL = 10;

// The bridge protocol that taught the movement rail the plan/confirm pipeline
// (#1736 S1/S2) — findMovementPath/constrainMovementPath/measureMovementPath
// wrappers plus the moveplan→moveplanned relay pair and moveconfirm's
// waypoints[] field. PC Stride gates the destination-tap flow on this floor;
// below it (or no hello at all) falls back to the 5-ft stepper unchanged.
export const FULL_MOVE_PROTOCOL = 14;

// The bridge protocol that taught the relay a filtered pathpreview channel,
// per-token-scene grid conversion, and mover-centered snapshot captures
// (#1744 WS-1/WS-2) — `snapreq` grows optional `{ moverId, radiusFeet }` and
// `snapdone` grows additive `{ moverId, trigger }`. The Move sheet's
// grid/map surface toggle only appears at this floor or above; below it (or
// no hello at all) the abstract grid is the only surface, exactly as today.
export const MAP_MOVE_PROTOCOL = 16;

// Device-local pref key (useDevicePref, #1575 D3) for the Move sheet's
// grid-vs-map surface toggle (#1744 S4, OQ-4 ruling: sticky per device, no
// imposed default). 'grid' | 'map'.
export const MOVE_SURFACE_PREF = 'moveSurface';

/**
 * Actions needed to cover a terrain-aware move cost against a Speed budget —
 * the generalized, charge-at-confirm form of needsNewStride's per-step
 * accounting (#1736 S2). Used both to price a planned route at confirm time
 * and to figure the refund when Foundry legally stops a move short.
 *
 * @param {number} costFeet - real (terrain-aware) distance of the move
 * @param {number} speed    - the actor's land Speed in feet
 * @returns {number}
 */
export const actionsForDistance = (costFeet, speed) => {
  if (!costFeet || costFeet <= 0) return 0;
  // No usable Speed to divide by (e.g. a base-less doc before the spine
  // derives one) — fall back to the stepper's own floor of 1 action per tap
  // rather than dividing by zero or negative.
  if (!speed || speed <= 0) return 1;
  return Math.ceil(costFeet / speed);
};
