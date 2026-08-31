import {
  rankFor,
  ladderBounds,
  clampToLadder,
  stepReputation,
  rankChangeLogText,
} from './reputation';

const FACTION = {
  id: 'scarnetti-consortium',
  name: 'Scarnetti Consortium',
  reputation: 0,
  ranks: [
    { name: 'Hunted', min: -50, max: -30 },
    { name: 'Disliked', min: -29, max: -10, effect: 'Prices +10%.' },
    { name: 'Neutral', min: -9, max: 9 },
    { name: 'Friendly', min: 10, max: 29, effect: 'Prices -10%.' },
    { name: 'Revered', min: 30, max: 50 },
  ],
};

const NO_RANKS_FACTION = { id: 'unaligned', name: 'Unaligned', reputation: 0 };

describe('utils/reputation', () => {
  describe('rankFor', () => {
    it('finds the rank at an interior score', () => {
      expect(rankFor(FACTION, 0).name).toBe('Neutral');
    });

    it('finds the rank at its exact min boundary', () => {
      expect(rankFor(FACTION, 10).name).toBe('Friendly');
      expect(rankFor(FACTION, -30).name).toBe('Hunted');
    });

    it('finds the rank at its exact max boundary', () => {
      expect(rankFor(FACTION, 9).name).toBe('Neutral');
      expect(rankFor(FACTION, 50).name).toBe('Revered');
    });

    it('returns null when the score sits outside every rank', () => {
      expect(rankFor(FACTION, 51)).toBeNull();
      expect(rankFor(FACTION, -51)).toBeNull();
    });

    it('returns null for a faction with no ranks', () => {
      expect(rankFor(NO_RANKS_FACTION, 0)).toBeNull();
    });

    it('does not throw on a missing/malformed faction', () => {
      expect(rankFor(null, 0)).toBeNull();
      expect(rankFor({ ranks: 'nope' }, 0)).toBeNull();
    });
  });

  describe('ladderBounds', () => {
    it('spans the lowest min to the highest max', () => {
      expect(ladderBounds(FACTION)).toEqual({ min: -50, max: 50 });
    });

    it('falls back to +-50 when the faction has no ranks', () => {
      expect(ladderBounds(NO_RANKS_FACTION)).toEqual({ min: -50, max: 50 });
      expect(ladderBounds(null)).toEqual({ min: -50, max: 50 });
    });
  });

  describe('clampToLadder', () => {
    it('passes through a value inside the bounds', () => {
      expect(clampToLadder(FACTION, 12)).toBe(12);
    });

    it('clamps above the max and below the min', () => {
      expect(clampToLadder(FACTION, 999)).toBe(50);
      expect(clampToLadder(FACTION, -999)).toBe(-50);
    });
  });

  describe('stepReputation', () => {
    it('adds the delta and clamps to the ladder', () => {
      expect(stepReputation(FACTION, 48, 5)).toBe(50);
      expect(stepReputation(FACTION, -49, -5)).toBe(-50);
    });

    it('treats a non-numeric current value as 0', () => {
      expect(stepReputation(FACTION, undefined, 3)).toBe(3);
    });
  });

  describe('rankChangeLogText', () => {
    it('is silent for drift that stays within the same rank', () => {
      expect(rankChangeLogText(FACTION, 0, 5)).toBeNull();
    });

    it('reports a rise across a rank boundary', () => {
      expect(rankChangeLogText(FACTION, 9, 10)).toBe(
        'Reputation: Scarnetti Consortium rose to Friendly (10)'
      );
    });

    it('reports a fall across a rank boundary', () => {
      expect(rankChangeLogText(FACTION, -9, -10)).toBe(
        'Reputation: Scarnetti Consortium fell to Disliked (-10)'
      );
    });

    it('is silent when the new score lands outside every rank', () => {
      expect(rankChangeLogText(FACTION, 50, 51)).toBeNull();
    });

    it('is silent with no prior rank and no new rank', () => {
      expect(rankChangeLogText(NO_RANKS_FACTION, 0, 5)).toBeNull();
    });
  });
});
