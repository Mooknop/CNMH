import { DOWNTIME_ACTIVITIES, DOWNTIME_ACTIVITY_TYPES } from './downtimeActivities';

describe('downtimeActivities data', () => {
  describe('DOWNTIME_ACTIVITY_TYPES', () => {
    it('is exactly instant and accumulate', () => {
      expect(DOWNTIME_ACTIVITY_TYPES).toEqual(['instant', 'accumulate']);
    });
  });

  describe('DOWNTIME_ACTIVITIES', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(DOWNTIME_ACTIVITIES)).toBe(true);
      expect(DOWNTIME_ACTIVITIES.length).toBeGreaterThan(0);
    });

    it('every activity has required string fields', () => {
      DOWNTIME_ACTIVITIES.forEach((activity) => {
        expect(typeof activity.name).toBe('string');
        expect(activity.name.length).toBeGreaterThan(0);
        expect(Array.isArray(activity.traits)).toBe(true);
        expect(typeof activity.description).toBe('string');
        expect(activity.description.length).toBeGreaterThan(0);
      });
    });

    it('all activity names are unique', () => {
      const names = DOWNTIME_ACTIVITIES.map((a) => a.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('every activity declares a valid type', () => {
      DOWNTIME_ACTIVITIES.forEach((activity) => {
        expect(DOWNTIME_ACTIVITY_TYPES).toContain(activity.type);
      });
    });

    it('accumulate activities declare a positive numeric benchmarkHours', () => {
      DOWNTIME_ACTIVITIES.filter((a) => a.type === 'accumulate').forEach((activity) => {
        expect(typeof activity.benchmarkHours).toBe('number');
        expect(activity.benchmarkHours).toBeGreaterThan(0);
      });
    });

    it('instant activities do not declare benchmarkHours', () => {
      DOWNTIME_ACTIVITIES.filter((a) => a.type === 'instant').forEach((activity) => {
        expect(activity.benchmarkHours).toBeUndefined();
      });
    });

    it('requiresTrainedInAny is a non-empty array when present', () => {
      DOWNTIME_ACTIVITIES.forEach((activity) => {
        if (activity.requiresTrainedInAny !== undefined) {
          expect(Array.isArray(activity.requiresTrainedInAny)).toBe(true);
          expect(activity.requiresTrainedInAny.length).toBeGreaterThan(0);
        }
      });
    });

    it('highlightSkills is a non-empty array when present', () => {
      DOWNTIME_ACTIVITIES.forEach((activity) => {
        if (activity.highlightSkills !== undefined) {
          expect(Array.isArray(activity.highlightSkills)).toBe(true);
          expect(activity.highlightSkills.length).toBeGreaterThan(0);
        }
      });
    });

    it('every activity has a non-empty mechanics.note', () => {
      DOWNTIME_ACTIVITIES.forEach((activity) => {
        expect(activity.mechanics).toBeDefined();
        expect(typeof activity.mechanics.note).toBe('string');
        expect(activity.mechanics.note.length).toBeGreaterThan(0);
      });
    });
  });

  describe('specific activity spot-checks', () => {
    it('includes the four foundation activities', () => {
      ['Earn Income', 'Retrain', 'Research', 'Crafting'].forEach((name) => {
        expect(DOWNTIME_ACTIVITIES.find((a) => a.name === name)).toBeDefined();
      });
    });

    it('Earn Income is instant', () => {
      const ei = DOWNTIME_ACTIVITIES.find((a) => a.name === 'Earn Income');
      expect(ei.type).toBe('instant');
    });

    it('Retrain, Research and Crafting accumulate', () => {
      ['Retrain', 'Research', 'Crafting'].forEach((name) => {
        expect(DOWNTIME_ACTIVITIES.find((a) => a.name === name).type).toBe('accumulate');
      });
    });

    it('Crafting requires trained Crafting and highlights crafting', () => {
      const craft = DOWNTIME_ACTIVITIES.find((a) => a.name === 'Crafting');
      expect(craft.requiresTrainedInAny).toContain('crafting');
      expect(craft.highlightSkills).toContain('crafting');
    });
  });
});
