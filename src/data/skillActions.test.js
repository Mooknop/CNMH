import { describe, it, expect } from 'vitest';
import {
  SKILL_ACTIONS,
  skillActionsFor,
  getSkillAction,
  skillActionFeatAugments,
  augmentSkillAction,
  effectConditionalToggles,
} from './skillActions';

describe('skillActions registry', () => {
  it('defines Demoralize with the expected resolution shape', () => {
    const demo = getSkillAction('demoralize');
    expect(demo).toBeTruthy();
    expect(demo.skill).toBe('intimidation');
    expect(demo.actionCost).toBe(1);
    expect(demo.defense).toBe('will');
    expect(demo.outcomes.criticalSuccess).toEqual({ condition: 'frightened', value: 2 });
    expect(demo.outcomes.success).toEqual({ condition: 'frightened', value: 1 });
    expect(demo.outcomes.failure).toBeUndefined();
    expect(demo.immunity).toEqual({ duration: { value: 10, unit: 'minute' }, scope: 'per-caster' });
  });

  it('every entry has a unique id and a skill', () => {
    const ids = SKILL_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    SKILL_ACTIONS.forEach((a) => expect(typeof a.skill).toBe('string'));
  });

  describe('Athletics maneuvers', () => {
    it('defines the four maneuvers as Attack-trait athletics actions with no immunity', () => {
      ['trip', 'grapple', 'shove', 'disarm'].forEach((id) => {
        const m = getSkillAction(id);
        expect(m).toBeTruthy();
        expect(m.skill).toBe('athletics');
        expect(m.traits).toContain('Attack');
        expect(m.immunity).toBeUndefined();
      });
    });

    it('uses the correct target defenses per RAW', () => {
      expect(getSkillAction('trip').defense).toBe('reflex');
      expect(getSkillAction('disarm').defense).toBe('reflex');
      expect(getSkillAction('grapple').defense).toBe('fortitude');
      expect(getSkillAction('shove').defense).toBe('fortitude');
    });

    it('Grapple applies grabbed on success and restrained on crit', () => {
      const g = getSkillAction('grapple');
      expect(g.outcomes.success).toEqual({ condition: 'grabbed' });
      expect(g.outcomes.criticalSuccess).toEqual({ condition: 'restrained' });
    });

    it('Trip applies prone and leaves the PC prone on a crit-fail', () => {
      const t = getSkillAction('trip');
      expect(t.outcomes.success).toEqual({ condition: 'prone' });
      expect(t.outcomes.criticalFailure).toEqual({ selfCondition: 'prone' });
    });

    it('Shove and Disarm are note-only (no enemy condition)', () => {
      expect(getSkillAction('shove').outcomes.success.condition).toBeUndefined();
      expect(getSkillAction('shove').outcomes.success.note).toBeTruthy();
      expect(getSkillAction('disarm').outcomes.success.note).toBeTruthy();
    });
  });

  describe('Feint', () => {
    it('rolls Deception vs Perception with no MAP and no immunity', () => {
      const f = getSkillAction('feint');
      expect(f.skill).toBe('deception');
      expect(f.defense).toBe('perception');
      expect(f.traits).not.toContain('Attack');
      expect(f.immunity).toBeUndefined();
    });

    it('applies off-guard scoped to the attacker on a hit, and to the PC on a crit-fail', () => {
      const f = getSkillAction('feint');
      // off-guard is scoped to your own attacks (#348), not global.
      expect(f.outcomes.success).toEqual({ condition: 'off-guard', scopedToAttacker: true });
      expect(f.outcomes.criticalSuccess).toEqual({ condition: 'off-guard', scopedToAttacker: true });
      expect(f.outcomes.criticalFailure).toEqual({ selfCondition: 'off-guard' });
    });
  });

  describe('Tumble Through (#349)', () => {
    it('is a 1-action Acrobatics Move action vs Reflex with note-only outcomes', () => {
      const t = getSkillAction('tumble-through');
      expect(t).toBeTruthy();
      expect(t.skill).toBe('acrobatics');
      expect(t.actionCost).toBe(1);
      expect(t.defense).toBe('reflex');
      expect(t.traits).toContain('Move');
      expect(t.traits).not.toContain('Attack'); // no MAP
      expect(t.outcomes.success.note).toBeTruthy();
      expect(t.outcomes.failure.note).toBeTruthy();
      expect(t.outcomes.success.condition).toBeUndefined();
    });
  });

  describe('Escape', () => {
    it('is a self-targeted Attack action with a skill choice and no preset DC', () => {
      const e = getSkillAction('escape');
      expect(e.selfTarget).toBe(true);
      expect(e.traits).toContain('Attack');
      // Athletics, Acrobatics, or the unarmed-attack modifier (#349).
      expect(e.skillOptions).toEqual(['athletics', 'acrobatics', 'unarmed']);
      expect(e.defense).toBeNull();
    });

    it('clears grabbed/restrained/immobilized from the PC on success', () => {
      const e = getSkillAction('escape');
      expect(e.outcomes.success.removeSelf).toEqual(['grabbed', 'restrained', 'immobilized']);
      expect(e.outcomes.criticalSuccess.removeSelf).toEqual(['grabbed', 'restrained', 'immobilized']);
    });
  });

  describe('Seek (#223)', () => {
    it('is a 1-action Perception action with a GM-entered DC and note outcomes', () => {
      const s = getSkillAction('seek');
      expect(s).toBeTruthy();
      expect(s.skill).toBe('perception');
      expect(s.actionCost).toBe(1);
      expect(s.defense).toBeNull();
      expect(s.traits).not.toContain('Attack');
      expect(s.outcomes.success.note).toBeTruthy();
      expect(s.outcomes.criticalSuccess.note).toBeTruthy();
    });
  });

  describe('skillActionFeatAugments (#223)', () => {
    const ranger = {
      name: 'Ashka',
      feats: [{ name: 'Ranger Dedication' }],
      familiar: { name: 'Lazarus', abilities: [{ name: 'Threat Display' }, { name: 'Manual Dexterity' }] },
    };
    const plain = { name: 'Nobody', feats: [], familiar: null };

    it('adds a Threat Display hint to Demoralize when the familiar has it', () => {
      const { hints, toggles } = skillActionFeatAugments(ranger, getSkillAction('demoralize'));
      expect(toggles).toEqual([]);
      expect(hints).toHaveLength(1);
      expect(hints[0]).toMatch(/Threat Display/);
      expect(hints[0]).toMatch(/Lazarus/);
    });

    it('adds a Hunt Prey +2 toggle to Seek for a Ranger Dedication holder', () => {
      const { toggles, hints } = skillActionFeatAugments(ranger, getSkillAction('seek'));
      expect(hints).toEqual([]);
      expect(toggles).toEqual([{ id: 'hunt-prey-seek', label: 'Hunt Prey vs prey', bonus: 2 }]);
    });

    it('adds nothing for a PC without the feat/familiar', () => {
      expect(skillActionFeatAugments(plain, getSkillAction('demoralize'))).toEqual({ toggles: [], hints: [] });
      expect(skillActionFeatAugments(plain, getSkillAction('seek'))).toEqual({ toggles: [], hints: [] });
    });

    it('does not cross-apply (no prey toggle on Demoralize, no hint on Seek)', () => {
      expect(skillActionFeatAugments(ranger, getSkillAction('demoralize')).toggles).toEqual([]);
      expect(skillActionFeatAugments(ranger, getSkillAction('seek')).hints).toEqual([]);
    });

    it('augmentSkillAction merges augments immutably and returns the base when empty', () => {
      const baseSeek = getSkillAction('seek');
      const aug = augmentSkillAction(ranger, baseSeek);
      expect(aug).not.toBe(baseSeek);
      expect(aug.toggles).toEqual([{ id: 'hunt-prey-seek', label: 'Hunt Prey vs prey', bonus: 2 }]);
      expect(baseSeek.toggles).toBeUndefined(); // base untouched
      // No augments → same reference back.
      expect(augmentSkillAction(plain, baseSeek)).toBe(baseSeek);
    });
  });

  describe('effectConditionalToggles (#338)', () => {
    const cat = [
      { id: 'climb-aid', name: 'Climbing Aid', modifiers: [{ stat: 'athletics', kind: 'item', amount: 1, vs: 'Climb' }] },
      { id: 'plain-buff', name: 'Plain', modifiers: [{ stat: 'athletics', kind: 'status', amount: 2 }] },
    ];
    const effects = [{ id: 'e1', effectId: 'climb-aid' }, { id: 'e2', effectId: 'plain-buff' }];
    const grapple = getSkillAction('grapple'); // athletics maneuver

    it('maps a conditional skill modifier to a toggle for a matching action', () => {
      const toggles = effectConditionalToggles(grapple, effects, cat);
      expect(toggles).toEqual([{ id: 'effect-Climbing Aid-Climb', label: 'Climbing Aid (vs Climb)', bonus: 1 }]);
    });

    it('ignores unconditional skill modifiers (they already net into the roll)', () => {
      const toggles = effectConditionalToggles(grapple, [{ id: 'e2', effectId: 'plain-buff' }], cat);
      expect(toggles).toEqual([]);
    });

    it('returns [] for an action whose skill nothing targets', () => {
      expect(effectConditionalToggles(getSkillAction('demoralize'), effects, cat)).toEqual([]);
    });

    it('returns [] when there are no active effects', () => {
      expect(effectConditionalToggles(grapple, [], cat)).toEqual([]);
      expect(effectConditionalToggles(grapple, undefined, cat)).toEqual([]);
    });

    it('augmentSkillAction merges effect toggles alongside feat toggles', () => {
      const ranger = { name: 'A', feats: [{ name: 'Ranger Dedication' }] };
      const aug = augmentSkillAction(ranger, getSkillAction('seek'), { effects, effectCatalog: cat });
      // Seek rolls perception, not athletics → no effect toggle, only the feat one.
      expect(aug.toggles).toEqual([{ id: 'hunt-prey-seek', label: 'Hunt Prey vs prey', bonus: 2 }]);

      const augG = augmentSkillAction(ranger, grapple, { effects, effectCatalog: cat });
      expect(augG.toggles).toContainEqual({ id: 'effect-Climbing Aid-Climb', label: 'Climbing Aid (vs Climb)', bonus: 1 });
    });
  });

  describe('skillActionsFor', () => {
    const pc = { id: 'AshkaBGosh', name: 'Ashka' };

    it('returns the basic actions for a PC in encounter mode', () => {
      const actions = skillActionsFor(pc, { encounterMode: true });
      expect(actions.map((a) => a.id)).toContain('demoralize');
    });

    it('returns nothing outside an encounter', () => {
      expect(skillActionsFor(pc, { encounterMode: false })).toEqual([]);
      expect(skillActionsFor(pc)).toEqual([]);
    });

    it('returns nothing without a character', () => {
      expect(skillActionsFor(null, { encounterMode: true })).toEqual([]);
    });
  });
});
