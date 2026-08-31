import {
  rankFor,
  ladderBounds,
  clampToLadder,
  stepReputation,
  rankChangeLogText,
  GMG_LADDER,
  ladderSegments,
  repTone,
  segmentTone,
  formatSignedRep,
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

  describe('ladderSegments (#1855)', () => {
    it('derives segments from a faction\'s own ranks, sorted worst to best', () => {
      // Authored out of order on purpose — sort order must not depend on it.
      const scrambled = {
        ranks: [
          { name: 'Friendly', min: 10, max: 29 },
          { name: 'Hunted', min: -50, max: -30 },
          { name: 'Neutral', min: -9, max: 9 },
        ],
      };
      const segs = ladderSegments(scrambled);
      expect(segs.map((s) => s.name)).toEqual(['Hunted', 'Neutral', 'Friendly']);
      expect(segs[0]).toEqual({ name: 'Hunted', abbr: 'Hun', min: -50, max: -30, span: 21 });
      expect(segs[2]).toEqual({ name: 'Friendly', abbr: 'Fri', min: 10, max: 29, span: 20 });
    });

    it('falls back to the GMG default ladder for a faction with no valid ranks', () => {
      expect(ladderSegments(NO_RANKS_FACTION)).toEqual(ladderSegments({ ranks: GMG_LADDER }));
      expect(ladderSegments({ ranks: [{ name: 'broken' }] }).length).toBe(GMG_LADDER.length);
    });

    it('matches the GMG spec table\'s spans and abbreviations exactly', () => {
      expect(ladderSegments(NO_RANKS_FACTION)).toEqual([
        { name: 'Hunted', abbr: 'Hun', min: -50, max: -30, span: 21 },
        { name: 'Hated', abbr: 'Hat', min: -29, max: -15, span: 15 },
        { name: 'Disliked', abbr: 'Dis', min: -14, max: -5, span: 10 },
        { name: 'Ignored', abbr: 'Ign', min: -4, max: 4, span: 9 },
        { name: 'Liked', abbr: 'Lik', min: 5, max: 14, span: 10 },
        { name: 'Admired', abbr: 'Adm', min: 15, max: 29, span: 15 },
        { name: 'Revered', abbr: 'Rev', min: 30, max: 50, span: 21 },
      ]);
    });
  });

  describe('repTone', () => {
    it('is positive above +4, negative below -4, neutral in between', () => {
      expect(repTone(5)).toBe('positive');
      expect(repTone(-5)).toBe('negative');
      expect(repTone(4)).toBe('neutral');
      expect(repTone(-4)).toBe('neutral');
      expect(repTone(0)).toBe('neutral');
    });

    it('treats a non-numeric value as neutral', () => {
      expect(repTone(undefined)).toBe('neutral');
    });
  });

  describe('segmentTone', () => {
    it('is positive for a friendly band (min >= 5)', () => {
      expect(segmentTone({ min: 5, max: 14 })).toBe('positive');
    });

    it('is negative for a hostile band (max <= -5)', () => {
      expect(segmentTone({ min: -14, max: -5 })).toBe('negative');
    });

    it('is neutral for the middle band', () => {
      expect(segmentTone({ min: -4, max: 4 })).toBe('neutral');
    });
  });

  describe('formatSignedRep', () => {
    it('prefixes a positive score with +', () => {
      expect(formatSignedRep(12)).toBe('+12');
    });

    it('leaves a negative score as-is', () => {
      expect(formatSignedRep(-12)).toBe('-12');
    });

    it('renders zero with no sign', () => {
      expect(formatSignedRep(0)).toBe('0');
    });
  });
});
