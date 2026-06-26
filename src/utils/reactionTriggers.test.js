import {
  TRIGGER_TYPES,
  TRIGGER_EVENTS,
  eventById,
  matchingReactions,
  feedTriggerEvent,
  isReactionCost,
} from './reactionTriggers';

const deflect    = { name: 'Deflect Projectile',  triggerType: 'attack-ranged' };
const wing       = { name: 'Wing Deflection',     triggerType: 'attack-any' };
const turtle     = { name: 'Dragon Turtle Plate', triggerType: 'attack-melee' };
const oversell   = { name: 'Overselling Flourish', triggerType: 'damaged-self' };
const retributive = { name: 'Retributive Strike', triggerType: 'damaged-ally' };
const upstage    = { name: 'Upstage',             triggerType: 'enemy-skill-check' };
const untyped    = { name: 'Attack of Opportunity' }; // no triggerType authored

describe('reactionTriggers', () => {
  it('every event matches only declared trigger types', () => {
    const typeIds = TRIGGER_TYPES.map((t) => t.id);
    TRIGGER_EVENTS.forEach((e) => {
      expect(e.matches.length).toBeGreaterThan(0);
      e.matches.forEach((m) => expect(typeIds).toContain(m));
    });
  });

  it('isReactionCost reads the authored actions string', () => {
    expect(isReactionCost({ actions: 'Reaction' })).toBe(true);
    expect(isReactionCost({ actions: 'reaction' })).toBe(true);
    expect(isReactionCost({ actions: 'Two Actions' })).toBe(false);
    expect(isReactionCost({ actionCount: 1 })).toBe(false);
    expect(isReactionCost(undefined)).toBe(false);
  });

  it('eventById finds events and returns null for unknown ids', () => {
    expect(eventById('ranged-attack')).toMatchObject({ id: 'ranged-attack' });
    expect(eventById('nope')).toBeNull();
  });

  describe('matchingReactions', () => {
    const all = [deflect, wing, turtle, oversell, retributive, upstage, untyped];

    it('ranged attack wakes attack-ranged and attack-any, but not melee-only', () => {
      expect(matchingReactions(all, 'ranged-attack')).toEqual([deflect, wing]);
    });

    it('melee attack wakes attack-any and attack-melee, but not ranged-only', () => {
      expect(matchingReactions(all, 'melee-attack')).toEqual([wing, turtle]);
    });

    it('damaged / ally-damaged / enemy-skill-check map one-to-one', () => {
      expect(matchingReactions(all, 'damaged')).toEqual([oversell]);
      expect(matchingReactions(all, 'ally-damaged')).toEqual([retributive]);
      expect(matchingReactions(all, 'enemy-skill-check')).toEqual([upstage]);
    });

    it('damaged-any wakes for both self and ally damage events', () => {
      // Amulet's Abeyance: "you or an ally within 15 feet" takes damage.
      const abeyance = { name: "Amulet's Abeyance", triggerType: 'damaged-any' };
      expect(matchingReactions([abeyance], 'damaged')).toEqual([abeyance]);
      expect(matchingReactions([abeyance], 'ally-damaged')).toEqual([abeyance]);
      expect(matchingReactions([abeyance], 'ranged-attack')).toEqual([]);
    });

    it('auditory-visual-effect wakes Counter Performance', () => {
      // Counter Performance: you or an ally is affected by an auditory/visual effect.
      const counter = { name: 'Counter Performance', triggerType: 'auditory-visual-effect' };
      expect(matchingReactions([counter], 'auditory-visual-effect')).toEqual([counter]);
      expect(matchingReactions([counter], 'damaged')).toEqual([]);
    });

    it('grabbed wakes a grab-triggered reaction (Swallow-Spike)', () => {
      const spike = { name: 'Grow Spikes', triggerType: 'grabbed' };
      expect(matchingReactions([spike], 'grabbed')).toEqual([spike]);
      expect(matchingReactions([spike], 'melee-attack')).toEqual([]);
    });

    it('check-failed wakes self-check-failed reactions', () => {
      // Avoid Dire Fate: you fail a check matching your harrow omen suit.
      const direFate = { name: 'Avoid Dire Fate', triggerType: 'self-check-failed' };
      expect(matchingReactions([direFate], 'check-failed')).toEqual([direFate]);
      expect(matchingReactions([direFate], 'damaged')).toEqual([]);
    });

    it('reactions without triggerType never match', () => {
      expect(matchingReactions([untyped], 'ranged-attack')).toEqual([]);
    });

    it('stowed item reactions (active === false) never match', () => {
      const stowed = { ...deflect, active: false };
      expect(matchingReactions([stowed], 'ranged-attack')).toEqual([]);
      // active: true and undefined both pass
      expect(matchingReactions([{ ...deflect, active: true }], 'ranged-attack')).toHaveLength(1);
    });

    it('handles empty/undefined inputs and unknown events', () => {
      expect(matchingReactions(undefined, 'ranged-attack')).toEqual([]);
      expect(matchingReactions([], 'ranged-attack')).toEqual([]);
      expect(matchingReactions(all, 'unknown-event')).toEqual([]);
    });
  });

  describe('feedTriggerEvent', () => {
    // Map foundry actor ids → PC charIds the way the live order does.
    const targetCharIdOf = (fid) => ({ 'fa-me': 'me', 'fa-ally': 'ally' })[fid] ?? null;
    const ctx = { actorKind: 'enemy', viewerCharId: 'me', targetCharIdOf };

    it('a ranged attack at you wakes ranged-attack; a melee attack wakes melee-attack', () => {
      expect(feedTriggerEvent(
        { type: 'attack-roll', attackRange: 'ranged', targetActorId: 'fa-me' }, ctx
      )).toBe('ranged-attack');
      expect(feedTriggerEvent(
        { type: 'attack-roll', attackRange: 'melee', targetActorId: 'fa-me' }, ctx
      )).toBe('melee-attack');
    });

    it('an attack aimed at someone else arms nothing for you', () => {
      expect(feedTriggerEvent(
        { type: 'attack-roll', attackRange: 'ranged', targetActorId: 'fa-ally' }, ctx
      )).toBeNull();
    });

    it('an enemy skill check wakes enemy-skill-check; a PC skill check does not', () => {
      expect(feedTriggerEvent({ type: 'skill-check' }, ctx)).toBe('enemy-skill-check');
      expect(feedTriggerEvent({ type: 'skill-check' }, { ...ctx, actorKind: 'pc' })).toBeNull();
    });

    it('damage resolves per viewer: you → damaged, an ally → ally-damaged', () => {
      expect(feedTriggerEvent(
        { type: 'damage-roll', targetActorId: 'fa-me' }, ctx
      )).toBe('damaged');
      expect(feedTriggerEvent(
        { type: 'damage-roll', targetActorId: 'fa-ally' }, ctx
      )).toBe('ally-damaged');
    });

    it('damage to a non-PC arms nothing', () => {
      expect(feedTriggerEvent({ type: 'damage-roll', targetActorId: 'fa-foe' }, ctx)).toBeNull();
    });

    it('unknown / typeless entries return null', () => {
      expect(feedTriggerEvent({ type: 'spell-cast' }, ctx)).toBeNull();
      expect(feedTriggerEvent({}, ctx)).toBeNull();
      expect(feedTriggerEvent(null, ctx)).toBeNull();
    });
  });
});
