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
