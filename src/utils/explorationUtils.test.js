import {
  profLabel,
  skillProficienciesFor,
  activityHighlightLabel,
  getExpertHighlightSkill,
  pickableRollSkills,
  bestRollSkill,
  explorationRollBonus,
  explorationDegreeOfSuccess,
  rollD20,
  isDockRollable,
  applyExplorationSuccessEffect,
} from './explorationUtils';

// Level 1, every ability at the 10/+0 default — makes getSkillModifier's
// output exactly `proficiency * 2 + 1` (or 0 untrained), so bonuses below are
// spelled out as arithmetic, not magic numbers.
const makeChar = (skills = {}) => ({ level: 1, abilities: {}, skills });

beforeEach(() => window.localStorage.clear());

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

  // ─── Roll math (#1812) — shared by RollActivityModal (player) and
  // DockExplorationRoster (GM secret checks) ─────────────────────────────────

  describe('pickableRollSkills', () => {
    it('fixed skill:type returns exactly that skill regardless of training', () => {
      const roll = { type: 'skill', skill: 'stealth' };
      expect(pickableRollSkills(roll, { skillProficiencies: {} })).toEqual(['stealth']);
    });

    it('skill-pick filters to the trained subset', () => {
      const roll = { type: 'skill-pick', skills: ['arcana', 'religion', 'occultism'] };
      const model = { skillProficiencies: { arcana: 2, occultism: 0 } };
      expect(pickableRollSkills(roll, model)).toEqual(['arcana']);
    });

    it('returns [] for no roll config', () => {
      expect(pickableRollSkills(null, {})).toEqual([]);
    });
  });

  describe('bestRollSkill', () => {
    it('auto-picks the trained skill with the highest modifier', () => {
      const roll = { type: 'skill-pick', skills: ['arcana', 'religion'] };
      const model = { skillProficiencies: { arcana: 1, religion: 2 } };
      const character = makeChar({ arcana: { proficiency: 1 }, religion: { proficiency: 2 } });
      // religion Expert (rank 2) = +5, arcana Trained (rank 1) = +3
      expect(bestRollSkill(roll, character, model)).toBe('religion');
    });

    it('returns null when nothing is trained', () => {
      const roll = { type: 'skill-pick', skills: ['arcana', 'religion'] };
      expect(bestRollSkill(roll, makeChar(), { skillProficiencies: {} })).toBeNull();
    });
  });

  describe('explorationRollBonus', () => {
    it('nets the skill modifier with the activity circumstance bonus and Follow the Expert', () => {
      const roll = { type: 'skill', skill: 'intimidation', circumstanceBonus: 4, circumstanceLabel: 'Coerce' };
      const character = makeChar({ intimidation: { proficiency: 1 } }); // Trained = +3
      const { bonus, circumstanceBonus, circumstanceLabel } = explorationRollBonus(
        roll, 'intimidation', character, { followExpertBonus: 2 }
      );
      expect(bonus).toBe(3 + 4 + 2);
      expect(circumstanceBonus).toBe(6);
      expect(circumstanceLabel).toBe('Coerce + Follow the Expert');
    });

    it('is null when there is no skill to roll', () => {
      expect(explorationRollBonus({ type: 'skill' }, null, makeChar())).toEqual({
        bonus: null, circumstanceBonus: 0, circumstanceLabel: '',
      });
    });

    // "Roll math parity" — the dock and the player-side modal call this exact
    // function with the exact same arguments for the same PC/skill, so two
    // independent calls (standing in for "player's client" and "the dock")
    // cannot diverge. This is what RollActivityModal's own bonus computation
    // was refactored onto in this slice (#1812) — see that file.
    it('gives identical results for the same PC/skill on repeated (independent) calls', () => {
      const character = makeChar({ perception: { proficiency: 2 } }); // Expert = +5
      const roll = { type: 'skill', skill: 'perception' };
      const playerSide = explorationRollBonus(roll, 'perception', character, {});
      const dockSide = explorationRollBonus(roll, 'perception', character, {});
      expect(dockSide).toEqual(playerSide);
      expect(dockSide.bonus).toBe(5);
    });
  });

  describe('explorationDegreeOfSuccess', () => {
    it('success at exactly DC', () => expect(explorationDegreeOfSuccess(15, 15)).toBe('success'));
    it('critical success at DC + 10', () => expect(explorationDegreeOfSuccess(25, 15)).toBe('criticalSuccess'));
    it('failure just under DC', () => expect(explorationDegreeOfSuccess(14, 15)).toBe('failure'));
    it('critical failure at DC - 10', () => expect(explorationDegreeOfSuccess(5, 15)).toBe('criticalFailure'));
    it('applies no nat 1/20 stepping (unlike computeSaveDegree)', () => {
      // A nat 20 that still misses DC by more than 10 stays a plain failure
      // in this dialect — RollActivityModal never applied the shift, and
      // this extraction preserves that verbatim.
      expect(explorationDegreeOfSuccess(20, 100)).toBe('criticalFailure');
    });
  });

  describe('rollD20', () => {
    it('maps the RNG bucket to the matching face for every face 1-20', () => {
      for (let face = 1; face <= 20; face++) {
        expect(rollD20(() => (face - 0.5) / 20)).toBe(face);
      }
    });

    it('defaults to Math.random', () => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
      expect(rollD20()).toBe(1);
      spy.mockRestore();
    });
  });

  describe('isDockRollable', () => {
    it('true for a plain skill roll', () => {
      expect(isDockRollable({ type: 'skill', skill: 'stealth' })).toBe(true);
    });
    it('false for a party-pc target roll (Treat Poison)', () => {
      expect(isDockRollable({ type: 'skill', skill: 'medicine', target: 'party-pc' })).toBe(false);
    });
    it('false for no roll config', () => {
      expect(isDockRollable(null)).toBe(false);
    });
  });

  describe('applyExplorationSuccessEffect', () => {
    it('appends the tagged entry and writes through getState/sendUpdate + localStorage', () => {
      const sendUpdate = vi.fn();
      const getState = vi.fn(() => [{ id: 'keep', effectId: 'bless', source: 'spell' }]);
      const next = applyExplorationSuccessEffect('avoid-notice-hidden', 'izzy', { getState, sendUpdate });

      expect(next).toEqual([
        { id: 'keep', effectId: 'bless', source: 'spell' },
        expect.objectContaining({ effectId: 'avoid-notice-hidden', source: 'exploration' }),
      ]);
      expect(sendUpdate).toHaveBeenCalledWith('izzy', 'effects', next);
      expect(JSON.parse(window.localStorage.getItem('cnmh_effects_izzy'))).toEqual(next);
    });

    it('no-ops without an effectId or targetId', () => {
      const sendUpdate = vi.fn();
      expect(applyExplorationSuccessEffect(null, 'izzy', { getState: vi.fn(), sendUpdate })).toBeNull();
      expect(applyExplorationSuccessEffect('avoid-notice-hidden', null, { getState: vi.fn(), sendUpdate })).toBeNull();
      expect(sendUpdate).not.toHaveBeenCalled();
    });
  });
});
