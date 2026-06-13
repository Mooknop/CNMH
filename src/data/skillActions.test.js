import { describe, it, expect } from 'vitest';
import { SKILL_ACTIONS, skillActionsFor, getSkillAction } from './skillActions';

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

    it('applies off-guard to the enemy, and to the PC on a crit-fail', () => {
      const f = getSkillAction('feint');
      expect(f.outcomes.success).toEqual({ condition: 'off-guard' });
      expect(f.outcomes.criticalSuccess).toEqual({ condition: 'off-guard' });
      expect(f.outcomes.criticalFailure).toEqual({ selfCondition: 'off-guard' });
    });
  });

  describe('Escape', () => {
    it('is a self-targeted Attack action with a skill choice and no preset DC', () => {
      const e = getSkillAction('escape');
      expect(e.selfTarget).toBe(true);
      expect(e.traits).toContain('Attack');
      expect(e.skillOptions).toEqual(['athletics', 'acrobatics']);
      expect(e.defense).toBeNull();
    });

    it('clears grabbed/restrained/immobilized from the PC on success', () => {
      const e = getSkillAction('escape');
      expect(e.outcomes.success.removeSelf).toEqual(['grabbed', 'restrained', 'immobilized']);
      expect(e.outcomes.criticalSuccess.removeSelf).toEqual(['grabbed', 'restrained', 'immobilized']);
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
