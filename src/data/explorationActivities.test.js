import { EXPLORATION_ACTIVITIES, CATEGORY_ORDER } from './explorationActivities';

describe('explorationActivities data', () => {
  describe('CATEGORY_ORDER', () => {
    it('is a non-empty array of strings', () => {
      expect(Array.isArray(CATEGORY_ORDER)).toBe(true);
      expect(CATEGORY_ORDER.length).toBeGreaterThan(0);
      CATEGORY_ORDER.forEach((c) => expect(typeof c).toBe('string'));
    });

    it('contains the expected categories', () => {
      ['Scouting', 'Social', 'Knowledge', 'Magic', 'Healing'].forEach((cat) => {
        expect(CATEGORY_ORDER).toContain(cat);
      });
    });
  });

  describe('EXPLORATION_ACTIVITIES', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(EXPLORATION_ACTIVITIES)).toBe(true);
      expect(EXPLORATION_ACTIVITIES.length).toBeGreaterThan(0);
    });

    it('every activity has required string fields', () => {
      EXPLORATION_ACTIVITIES.forEach((activity) => {
        expect(typeof activity.name).toBe('string');
        expect(activity.name.length).toBeGreaterThan(0);
        expect(typeof activity.category).toBe('string');
        expect(Array.isArray(activity.traits)).toBe(true);
        expect(typeof activity.description).toBe('string');
        expect(activity.description.length).toBeGreaterThan(0);
      });
    });

    it('every activity category exists in CATEGORY_ORDER', () => {
      EXPLORATION_ACTIVITIES.forEach((activity) => {
        expect(CATEGORY_ORDER).toContain(activity.category);
      });
    });

    it('all activity names are unique', () => {
      const names = EXPLORATION_ACTIVITIES.map((a) => a.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('requiresTrainedInAny is an array when present', () => {
      EXPLORATION_ACTIVITIES.forEach((activity) => {
        if (activity.requiresTrainedInAny !== undefined) {
          expect(Array.isArray(activity.requiresTrainedInAny)).toBe(true);
          expect(activity.requiresTrainedInAny.length).toBeGreaterThan(0);
        }
      });
    });

    it('requiresAnyFlag is an array when present', () => {
      EXPLORATION_ACTIVITIES.forEach((activity) => {
        if (activity.requiresAnyFlag !== undefined) {
          expect(Array.isArray(activity.requiresAnyFlag)).toBe(true);
        }
      });
    });

    it('highlightSkills is an array when present', () => {
      EXPLORATION_ACTIVITIES.forEach((activity) => {
        if (activity.highlightSkills !== undefined) {
          expect(Array.isArray(activity.highlightSkills)).toBe(true);
          expect(activity.highlightSkills.length).toBeGreaterThan(0);
        }
      });
    });

    it('every activity declares a valid travel pace in mechanics', () => {
      EXPLORATION_ACTIVITIES.forEach((activity) => {
        expect(activity.mechanics).toBeDefined();
        expect(['half', 'double', 'full']).toContain(activity.mechanics.speed);
      });
    });

    it('mechanics.note is a non-empty string when present', () => {
      EXPLORATION_ACTIVITIES.forEach((activity) => {
        if (activity.mechanics.note !== undefined) {
          expect(typeof activity.mechanics.note).toBe('string');
          expect(activity.mechanics.note.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('specific activity spot-checks', () => {
    it('Treat Wounds requires trained Medicine and is in Healing', () => {
      const tw = EXPLORATION_ACTIVITIES.find((a) => a.name === 'Treat Wounds');
      expect(tw).toBeDefined();
      expect(tw.category).toBe('Healing');
      expect(tw.requiresTrainedInAny).toContain('medicine');
      expect(tw.highlightSkills).toContain('medicine');
    });

    it('Detect Magic requires spellcasting or focus spells and is in Magic', () => {
      const dm = EXPLORATION_ACTIVITIES.find((a) => a.name === 'Detect Magic');
      expect(dm).toBeDefined();
      expect(dm.category).toBe('Magic');
      expect(dm.requiresAnyFlag).toContain('hasSpellcasting');
      expect(dm.requiresAnyFlag).toContain('hasFocusSpells');
    });

    it('Refocus has been removed (focus refreshes outside encounters instead)', () => {
      const rf = EXPLORATION_ACTIVITIES.find((a) => a.name === 'Refocus');
      expect(rf).toBeUndefined();
    });

    it('Defend grants the defend self-buff at half speed', () => {
      const def = EXPLORATION_ACTIVITIES.find((a) => a.name === 'Defend');
      expect(def.mechanics.speed).toBe('half');
      expect(def.mechanics.effect).toBe('defend');
    });

    it('Hustle travels at double speed', () => {
      const hustle = EXPLORATION_ACTIVITIES.find((a) => a.name === 'Hustle');
      expect(hustle.mechanics.speed).toBe('double');
    });

    it('Avoid Notice is in Scouting and highlights stealth', () => {
      const an = EXPLORATION_ACTIVITIES.find((a) => a.name === 'Avoid Notice');
      expect(an.category).toBe('Scouting');
      expect(an.highlightSkills).toContain('stealth');
    });

    it('Decipher Writing requires trained in a knowledge skill', () => {
      const dw = EXPLORATION_ACTIVITIES.find((a) => a.name === 'Decipher Writing');
      expect(dw.requiresTrainedInAny).toEqual(
        expect.arrayContaining(['arcana', 'occultism', 'religion', 'society'])
      );
    });

    it('Hustle has no skill requirement or highlight', () => {
      const hustle = EXPLORATION_ACTIVITIES.find((a) => a.name === 'Hustle');
      expect(hustle.requiresFlag).toBeUndefined();
      expect(hustle.requiresAnyFlag).toBeUndefined();
      expect(hustle.requiresTrainedInAny).toBeUndefined();
      expect(hustle.highlightSkills).toBeUndefined();
    });
  });

  describe('coverage across categories', () => {
    it('each category in CATEGORY_ORDER has at least one activity', () => {
      CATEGORY_ORDER.forEach((cat) => {
        const count = EXPLORATION_ACTIVITIES.filter((a) => a.category === cat).length;
        expect(count).toBeGreaterThan(0);
      });
    });
  });
});
