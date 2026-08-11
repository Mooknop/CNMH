// Movement action accounting (#415, #391). Shared by the PC movement sheet
// (MoveActionSheet) and minion movement (MinionMove) so both charge Strides the
// same way: 1 action on the first step, then one more each time the running
// distance under the current Stride would cross the actor's Speed.

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
