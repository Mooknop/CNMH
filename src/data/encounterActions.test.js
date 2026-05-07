import {
  BASIC_ACTIONS_OFFENSIVE,
  BASIC_ACTIONS_DEFENSIVE,
  BASIC_ACTIONS_MOVEMENT,
  BASIC_ENCOUNTER_FREE_ACTIONS,
} from './encounterActions';

const VALID_HIGHLIGHT_SKILLS = ['athletics', 'deception', 'stealth'];

describe('encounterActions data', () => {
  const allStandardArrays = [
    ['BASIC_ACTIONS_OFFENSIVE', BASIC_ACTIONS_OFFENSIVE],
    ['BASIC_ACTIONS_DEFENSIVE', BASIC_ACTIONS_DEFENSIVE],
    ['BASIC_ACTIONS_MOVEMENT', BASIC_ACTIONS_MOVEMENT],
  ];

  describe.each(allStandardArrays)('%s', (name, arr) => {
    it('is a non-empty array', () => {
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBeGreaterThan(0);
    });

    it('every item has name, actionCount, traits, description', () => {
      arr.forEach((item) => {
        expect(typeof item.name).toBe('string');
        expect(item.name.length).toBeGreaterThan(0);
        expect(typeof item.actionCount).toBe('number');
        expect(item.actionCount).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(item.traits)).toBe(true);
        expect(typeof item.description).toBe('string');
        expect(item.description.length).toBeGreaterThan(0);
      });
    });

    it('highlightSkill, when present, is a known skill id', () => {
      arr.forEach((item) => {
        if (item.highlightSkill !== undefined) {
          expect(VALID_HIGHLIGHT_SKILLS).toContain(item.highlightSkill);
        }
      });
    });

    it('all item names are unique', () => {
      const names = arr.map((i) => i.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe('BASIC_ACTIONS_OFFENSIVE', () => {
    it('contains Strike and Escape with no highlightSkill', () => {
      const strike = BASIC_ACTIONS_OFFENSIVE.find((a) => a.name === 'Strike');
      const escape = BASIC_ACTIONS_OFFENSIVE.find((a) => a.name === 'Escape');
      expect(strike).toBeDefined();
      expect(escape).toBeDefined();
      expect(strike.highlightSkill).toBeUndefined();
      expect(escape.highlightSkill).toBeUndefined();
    });

    it('athletics actions have highlightSkill: athletics', () => {
      ['Grapple', 'Shove', 'Trip', 'Disarm', 'Reposition'].forEach((name) => {
        const action = BASIC_ACTIONS_OFFENSIVE.find((a) => a.name === name);
        expect(action).toBeDefined();
        expect(action.highlightSkill).toBe('athletics');
      });
    });

    it('Feint has highlightSkill: deception', () => {
      const feint = BASIC_ACTIONS_OFFENSIVE.find((a) => a.name === 'Feint');
      expect(feint.highlightSkill).toBe('deception');
    });
  });

  describe('BASIC_ACTIONS_DEFENSIVE', () => {
    it('contains Ready with actionCount 2', () => {
      const ready = BASIC_ACTIONS_DEFENSIVE.find((a) => a.name === 'Ready');
      expect(ready).toBeDefined();
      expect(ready.actionCount).toBe(2);
    });

    it('no defensive actions have a highlightSkill', () => {
      BASIC_ACTIONS_DEFENSIVE.forEach((item) => {
        expect(item.highlightSkill).toBeUndefined();
      });
    });
  });

  describe('BASIC_ACTIONS_MOVEMENT', () => {
    it('Hide and Sneak have highlightSkill: stealth', () => {
      ['Hide', 'Sneak'].forEach((name) => {
        const action = BASIC_ACTIONS_MOVEMENT.find((a) => a.name === name);
        expect(action).toBeDefined();
        expect(action.highlightSkill).toBe('stealth');
      });
    });

    it('all movement actions have the Move trait or Secret trait', () => {
      BASIC_ACTIONS_MOVEMENT.forEach((action) => {
        const hasExpectedTrait =
          action.traits.includes('Move') || action.traits.includes('Secret');
        expect(hasExpectedTrait).toBe(true);
      });
    });
  });

  describe('BASIC_ENCOUNTER_FREE_ACTIONS', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(BASIC_ENCOUNTER_FREE_ACTIONS)).toBe(true);
      expect(BASIC_ENCOUNTER_FREE_ACTIONS.length).toBeGreaterThan(0);
    });

    it('every item has name, trigger, traits, description', () => {
      BASIC_ENCOUNTER_FREE_ACTIONS.forEach((item) => {
        expect(typeof item.name).toBe('string');
        expect(typeof item.trigger).toBe('string');
        expect(item.trigger.length).toBeGreaterThan(0);
        expect(Array.isArray(item.traits)).toBe(true);
        expect(typeof item.description).toBe('string');
      });
    });

    it('contains Delay and Release', () => {
      const names = BASIC_ENCOUNTER_FREE_ACTIONS.map((a) => a.name);
      expect(names).toContain('Delay');
      expect(names).toContain('Release');
    });
  });
});
