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

    it('Coerce has a fixed-skill roll with a circumstance bonus', () => {
      const coerce = EXPLORATION_ACTIVITIES.find((a) => a.name === 'Coerce');
      expect(coerce.mechanics.roll.type).toBe('skill');
      expect(coerce.mechanics.roll.skill).toBe('intimidation');
      expect(coerce.mechanics.roll.circumstanceBonus).toBe(4);
    });

    it('Gather Information has a secret diplomacy roll', () => {
      const gi = EXPLORATION_ACTIVITIES.find((a) => a.name === 'Gather Information');
      expect(gi.mechanics.roll.type).toBe('skill');
      expect(gi.mechanics.roll.secret).toBe(true);
    });

    it('Identify Magic uses a skill-pick roll from magic skills', () => {
      const im = EXPLORATION_ACTIVITIES.find((a) => a.name === 'Identify Magic');
      expect(im.mechanics.roll.type).toBe('skill-pick');
      expect(im.mechanics.roll.skills).toContain('arcana');
    });

    it('activities with skill-pick rolls declare at least one skill', () => {
      const pickActivities = EXPLORATION_ACTIVITIES.filter(
        (a) => a.mechanics.roll?.type === 'skill-pick'
      );
      expect(pickActivities.length).toBeGreaterThan(0);
      pickActivities.forEach((a) => {
        expect(Array.isArray(a.mechanics.roll.skills)).toBe(true);
        expect(a.mechanics.roll.skills.length).toBeGreaterThan(0);
      });
    });

    it('Avoid Notice has a stealth roll with an on-success effect', () => {
      const an = EXPLORATION_ACTIVITIES.find((a) => a.name === 'Avoid Notice');
      expect(an.mechanics.roll.skill).toBe('stealth');
      expect(an.mechanics.roll.onSuccessEffect).toBe('avoid-notice-hidden');
    });

    it('Treat Poison has a medicine roll targeting a party PC with an on-success effect', () => {
      const tp = EXPLORATION_ACTIVITIES.find((a) => a.name === 'Treat Poison');
      expect(tp.mechanics.roll.skill).toBe('medicine');
      expect(tp.mechanics.roll.target).toBe('party-pc');
      expect(tp.mechanics.roll.onSuccessEffect).toBe('treat-poison-resist');
    });

    it('Search has a secret Perception roll', () => {
      const s = EXPLORATION_ACTIVITIES.find((a) => a.name === 'Search');
      expect(s.mechanics.roll.skill).toBe('perception');
      expect(s.mechanics.roll.secret).toBe(true);
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
