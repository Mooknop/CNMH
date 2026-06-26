import { describe, it, expect } from 'vitest';
import {
  SKILL_ACTIONS,
  skillActionsFor,
  getSkillAction,
  skillActionFeatAugments,
  augmentSkillAction,
  effectConditionalToggles,
} from './skillActions';
import { SKILL_KEYS } from '../utils/EffectUtils';
import { defaultContent } from '../utils/contentUtils';

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

  describe('Track (#407)', () => {
    it('is an exploration-surface Survival check with a GM DC and note outcomes', () => {
      const t = getSkillAction('track');
      expect(t).toBeTruthy();
      expect(t.skill).toBe('survival');
      expect(t.defense).toBeNull();
      expect(t.selfTarget).toBe(true);
      expect(t.surfaces).toEqual(['exploration']);
      expect(t.traits).not.toContain('Attack');
      ['criticalSuccess', 'success', 'failure', 'criticalFailure'].forEach((d) =>
        expect(t.outcomes[d].note).toBeTruthy()
      );
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

    it('adds a Hunt Prey +2 toggle to Track for a Ranger Dedication holder (#407)', () => {
      const { toggles, hints } = skillActionFeatAugments(ranger, getSkillAction('track'));
      expect(hints).toEqual([]);
      expect(toggles).toEqual([{ id: 'hunt-prey-track', label: 'Hunt Prey vs prey', bonus: 2 }]);
      // …and nothing for a PC without the feat.
      expect(skillActionFeatAugments(plain, getSkillAction('track'))).toEqual({ toggles: [], hints: [] });
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

  describe('effectConditionalToggles (#510 — scoped to the action vs-context)', () => {
    const cat = [
      { id: 'gecko', name: 'Gecko Potion', modifiers: [
        { stat: 'athletics', kind: 'item', amount: 1, vs: 'Climb' },
        { stat: 'thievery',  kind: 'item', amount: 1, vs: 'Palm an Object' },
      ] },
      { id: 'plain-buff', name: 'Plain', modifiers: [{ stat: 'athletics', kind: 'status', amount: 2 }] },
    ];
    const effects = [{ id: 'e1', effectId: 'gecko' }, { id: 'e2', effectId: 'plain-buff' }];
    const climb = getSkillAction('climb');
    const grapple = getSkillAction('grapple');

    it('offers the toggle on the action whose vs-context matches the modifier', () => {
      const toggles = effectConditionalToggles(climb, effects, cat);
      expect(toggles).toEqual([{ id: 'effect-Gecko Potion-Climb', label: 'Gecko Potion (vs Climb)', bonus: 1 }]);
    });

    it('does NOT offer a sibling-action toggle (the #510 fix) — Climb modifier never shows on Grapple', () => {
      // Grapple shares the Athletics skill but declares no vsContexts, so the
      // "+1 vs Climb" modifier must not leak onto it.
      expect(effectConditionalToggles(grapple, effects, cat)).toEqual([]);
    });

    it('scopes by the action context, not just the skill (Palm an Object → thievery)', () => {
      const palm = getSkillAction('palm-an-object');
      expect(effectConditionalToggles(palm, effects, cat)).toEqual([
        { id: 'effect-Gecko Potion-Palm an Object', label: 'Gecko Potion (vs Palm an Object)', bonus: 1 },
      ]);
    });

    it('matches case-insensitively / trimming whitespace', () => {
      const looseCat = [{ id: 'g2', name: 'Loose', modifiers: [{ stat: 'athletics', kind: 'item', amount: 1, vs: '  climb ' }] }];
      const toggles = effectConditionalToggles(climb, [{ id: 'e', effectId: 'g2' }], looseCat);
      expect(toggles).toHaveLength(1);
    });

    it('ignores unconditional skill modifiers (they already net into the roll)', () => {
      expect(effectConditionalToggles(climb, [{ id: 'e2', effectId: 'plain-buff' }], cat)).toEqual([]);
    });

    it('returns [] for an action with no declared vsContexts', () => {
      expect(effectConditionalToggles(getSkillAction('demoralize'), effects, cat)).toEqual([]);
    });

    it('returns [] when there are no active effects', () => {
      expect(effectConditionalToggles(climb, [], cat)).toEqual([]);
      expect(effectConditionalToggles(climb, undefined, cat)).toEqual([]);
    });

    it('augmentSkillAction merges effect toggles alongside feat toggles', () => {
      const ranger = { name: 'A', feats: [{ name: 'Ranger Dedication' }] };
      // Seek rolls perception; the gecko cat has no perception 'find secret doors'
      // modifier → no effect toggle, only the Hunt Prey feat one.
      const augSeek = augmentSkillAction(ranger, getSkillAction('seek'), { effects, effectCatalog: cat });
      expect(augSeek.toggles).toEqual([{ id: 'hunt-prey-seek', label: 'Hunt Prey vs prey', bonus: 2 }]);

      const augClimb = augmentSkillAction(ranger, climb, { effects, effectCatalog: cat });
      expect(augClimb.toggles).toContainEqual({ id: 'effect-Gecko Potion-Climb', label: 'Gecko Potion (vs Climb)', bonus: 1 });
    });
  });

  describe('skillActionsFor', () => {
    const pc = { id: 'AshkaBGosh', name: 'Ashka' };

    it('returns the basic actions for a PC in encounter mode, excluding exploration-only ones', () => {
      const ids = skillActionsFor(pc, { encounterMode: true }).map((a) => a.id);
      expect(ids).toContain('demoralize');
      expect(ids).not.toContain('track'); // exploration-only
    });

    it('returns only exploration-surface actions in exploration mode (#407)', () => {
      const ids = skillActionsFor(pc, { explorationMode: true }).map((a) => a.id);
      expect(ids).toContain('track');
      expect(ids).not.toContain('demoralize'); // encounter-only
      expect(ids).not.toContain('seek');       // encounter-only
    });

    it('returns nothing with no active surface', () => {
      expect(skillActionsFor(pc, { encounterMode: false })).toEqual([]);
      expect(skillActionsFor(pc)).toEqual([]);
    });

    it('returns nothing without a character', () => {
      expect(skillActionsFor(null, { encounterMode: true })).toEqual([]);
      expect(skillActionsFor(null, { explorationMode: true })).toEqual([]);
    });

    it('exposes Climb and Palm an Object in both surfaces (#510)', () => {
      const enc = skillActionsFor(pc, { encounterMode: true }).map((a) => a.id);
      const exp = skillActionsFor(pc, { explorationMode: true }).map((a) => a.id);
      expect(enc).toEqual(expect.arrayContaining(['climb', 'palm-an-object']));
      expect(exp).toEqual(expect.arrayContaining(['climb', 'palm-an-object']));
    });
  });

  // Drift guard (#510): every conditional ('vs X') skill/perception modifier in
  // the live content must either be hosted by a skill action that declares the
  // matching vsContext, or be intentionally sheet-hint-only (no launchable
  // action). Catches a content vs-string typo or a new conditional modifier that
  // silently stops matching its action.
  describe('content vs-contexts stay in sync with skill actions (#510)', () => {
    const SKILL_STATS = new Set([...SKILL_KEYS, 'perception']);
    // Contexts surfaced only as the passive sheet hint — Recall Knowledge spans
    // 7 skills via a separate flow, with no single launchable action.
    const SHEET_ONLY = new Set(['recall knowledge']);
    const norm = (s) => String(s || '').trim().toLowerCase();

    // skill id → set of normalized vs-contexts any action on that skill hosts.
    const hostedContexts = new Map();
    for (const a of SKILL_ACTIONS) {
      for (const sk of [a.skill, ...(a.skillOptions || [])].filter(Boolean)) {
        if (!hostedContexts.has(sk)) hostedContexts.set(sk, new Set());
        for (const c of a.vsContexts || []) hostedContexts.get(sk).add(norm(c));
      }
    }

    it('every conditional skill/perception modifier is hosted by an action or sheet-only', () => {
      const effects = defaultContent().effect;
      const uncovered = [];
      for (const e of effects) {
        for (const m of e.modifiers || []) {
          if (!m.vs || !SKILL_STATS.has(m.stat)) continue;
          const v = norm(m.vs);
          if (SHEET_ONLY.has(v)) continue;
          if (!hostedContexts.get(m.stat)?.has(v)) {
            uncovered.push(`${e.id}: ${m.stat} vs "${m.vs}"`);
          }
        }
      }
      expect(uncovered).toEqual([]);
    });
  });
});
