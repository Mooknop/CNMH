import {
  profLabel,
  skillProficienciesFor,
  activityHighlightLabel,
  getExpertHighlightSkill,
} from './explorationUtils';

describe('explorationUtils', () => {
  describe('profLabel', () => {
    it('returns null below Expert', () => expect(profLabel(1)).toBeNull());
    it('returns Expert for rank 2', () => expect(profLabel(2)).toBe('Expert'));
    it('returns Master for rank 3', () => expect(profLabel(3)).toBe('Master'));
    it('returns Legendary for rank 4', () => expect(profLabel(4)).toBe('Legendary'));
  });

  describe('skillProficienciesFor', () => {
    it('handles object-style proficiency data', () => {
      const char = { skills: { stealth: { proficiency: 3 }, perception: { proficiency: 1 } } };
      expect(skillProficienciesFor(char)).toEqual({ stealth: 3, perception: 1 });
    });
    it('handles bare numeric proficiency data', () => {
      const char = { skills: { stealth: 2 } };
      expect(skillProficienciesFor(char)).toEqual({ stealth: 2 });
    });
    it('returns empty object for character without skills', () => {
      expect(skillProficienciesFor({})).toEqual({});
    });
  });

  describe('activityHighlightLabel', () => {
    const activity = { highlightSkills: ['stealth', 'perception'] };

    it('returns Expert when best rank is 2', () => {
      expect(activityHighlightLabel(activity, { stealth: 2, perception: 1 })).toBe('Expert');
    });
    it('returns Master when best rank is 3', () => {
      expect(activityHighlightLabel(activity, { stealth: 3 })).toBe('Master');
    });
    it('returns null when below Expert', () => {
      expect(activityHighlightLabel(activity, { stealth: 1 })).toBeNull();
    });
    it('returns null for activity without highlightSkills', () => {
      expect(activityHighlightLabel({ name: 'Hustle' }, { stealth: 4 })).toBeNull();
    });
  });

  describe('getExpertHighlightSkill', () => {
    const activity = { highlightSkills: ['arcana', 'occultism'] };

    it('returns the highest-ranked Expert+ skill', () => {
      expect(getExpertHighlightSkill(activity, { arcana: 3, occultism: 2 })).toBe('arcana');
    });
    it('returns null when no skill is Expert+', () => {
      expect(getExpertHighlightSkill(activity, { arcana: 1, occultism: 0 })).toBeNull();
    });
    it('returns null for activity without highlightSkills', () => {
      expect(getExpertHighlightSkill({ name: 'Hustle' }, { arcana: 4 })).toBeNull();
    });
  });
});
