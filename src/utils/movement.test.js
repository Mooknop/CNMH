import { needsNewStride, actionsForDistance, FULL_MOVE_PROTOCOL, ENEMY_MOVE_PROTOCOL } from './movement';

describe('needsNewStride', () => {
  it('charges a new action on the first step of a Stride (feetThisAction 0)', () => {
    expect(needsNewStride(0, 5, 30)).toBe(true);
  });

  it('does not charge while accumulated distance stays within Speed', () => {
    expect(needsNewStride(5, 5, 30)).toBe(false);
    expect(needsNewStride(25, 5, 30)).toBe(false); // 25 + 5 = 30, exactly Speed
  });

  it('charges again when the step would cross Speed', () => {
    expect(needsNewStride(30, 5, 30)).toBe(true); // 30 + 5 = 35 > 30
  });

  it('handles larger step sizes that overshoot mid-segment', () => {
    expect(needsNewStride(20, 15, 30)).toBe(true); // 20 + 15 = 35 > 30
  });
});

describe('actionsForDistance (#1736 S2)', () => {
  it('a move of 0 (or falsy/negative) feet costs 0 actions', () => {
    expect(actionsForDistance(0, 30)).toBe(0);
    expect(actionsForDistance(null, 30)).toBe(0);
    expect(actionsForDistance(undefined, 30)).toBe(0);
    expect(actionsForDistance(-5, 30)).toBe(0);
  });

  it('ceils partial-Speed distances up to a whole action', () => {
    expect(actionsForDistance(5, 30)).toBe(1);
    expect(actionsForDistance(25, 30)).toBe(1);
    expect(actionsForDistance(30, 30)).toBe(1); // exactly Speed
  });

  it('charges an extra action once distance crosses a Speed multiple', () => {
    expect(actionsForDistance(31, 30)).toBe(2);
    expect(actionsForDistance(60, 30)).toBe(2);
    expect(actionsForDistance(61, 30)).toBe(3);
  });

  it('treats a missing/non-positive Speed as 1 action per tap (stepper floor)', () => {
    expect(actionsForDistance(5, 0)).toBe(1);
    expect(actionsForDistance(5, null)).toBe(1);
    expect(actionsForDistance(5, -10)).toBe(1);
  });
});

describe('protocol floors', () => {
  it('FULL_MOVE_PROTOCOL is at or above ENEMY_MOVE_PROTOCOL (later floor, later feature)', () => {
    expect(FULL_MOVE_PROTOCOL).toBeGreaterThan(ENEMY_MOVE_PROTOCOL);
  });
});
