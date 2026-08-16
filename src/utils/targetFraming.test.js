import { describe, it, expect } from 'vitest';
import {
  targetFramingRadiusFeet,
  meleeReachFeet,
  MELEE_FRAMING_RADIUS_FT,
  MAX_TARGET_FRAMING_RADIUS_FT,
  TARGET_FRAMING_INCREMENTS,
} from './targetFraming';

describe('targetFraming (#1749 S4)', () => {
  describe('targetFramingRadiusFeet', () => {
    it('frames a melee strike at the close-quarters radius', () => {
      expect(targetFramingRadiusFeet({ ability: { type: 'melee', name: 'Longsword' } }))
        .toBe(MELEE_FRAMING_RADIUS_FT);
    });

    it('frames an ability with no range at all at the close-quarters radius', () => {
      expect(targetFramingRadiusFeet({ ability: { name: 'Demoralize' } }))
        .toBe(MELEE_FRAMING_RADIUS_FT);
      expect(targetFramingRadiusFeet({})).toBe(MELEE_FRAMING_RADIUS_FT);
    });

    it('multiplies a ranged Strike increment by the framing increment count', () => {
      // 20 ft increment x 2 = 40, inside both clamps.
      expect(targetFramingRadiusFeet({
        ability: { type: 'ranged', range: '20 feet' },
        isRangedStrike: true,
      })).toBe(20 * TARGET_FRAMING_INCREMENTS);
    });

    it('caps a long-ranged weapon at the legibility ceiling rather than its real reach', () => {
      // A 60-ft-increment bow can legally fire 240 ft (4 increments). Framing
      // that would put a 5-ft square at ~8 CSS px on a phone — the chip list is
      // the escape hatch for the long shot (OQ-1 ruling).
      expect(targetFramingRadiusFeet({
        ability: { type: 'ranged', range: '60 feet' },
        isRangedStrike: true,
      })).toBe(MAX_TARGET_FRAMING_RADIUS_FT);
    });

    it('never frames tighter than the melee radius, even for a 10-ft thrown weapon', () => {
      expect(targetFramingRadiusFeet({
        ability: { type: 'ranged', range: '10 feet' },
        isRangedStrike: true,
      })).toBe(MELEE_FRAMING_RADIUS_FT);
    });

    it("treats a non-Strike's range as a maximum, not an increment", () => {
      // A 30-ft spell reaches 30 ft, full stop — multiplying it would frame
      // twice the battlefield the spell can actually touch.
      expect(targetFramingRadiusFeet({ ability: { name: 'Electric Arc', range: '30 feet' } }))
        .toBe(30);
    });
  });

  describe('meleeReachFeet', () => {
    it('is 5 ft by default and 10 ft with the Reach trait', () => {
      expect(meleeReachFeet({ name: 'Fist' })).toBe(5);
      expect(meleeReachFeet({ name: 'Glaive', traits: ['Reach', 'Forceful'] })).toBe(10);
      expect(meleeReachFeet(null)).toBe(5);
    });
  });
});
