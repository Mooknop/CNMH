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
