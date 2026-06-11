import {
  TRIGGER_TYPES,
  TRIGGER_EVENTS,
  eventById,
  matchingReactions,
} from './reactionTriggers';

const deflect    = { name: 'Deflect Projectile',  triggerType: 'attack-ranged' };
const wing       = { name: 'Wing Deflection',     triggerType: 'attack-any' };
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

  it('eventById finds events and returns null for unknown ids', () => {
    expect(eventById('ranged-attack')).toMatchObject({ id: 'ranged-attack' });
    expect(eventById('nope')).toBeNull();
  });

  describe('matchingReactions', () => {
    const all = [deflect, wing, oversell, retributive, upstage, untyped];

    it('ranged attack wakes both attack-ranged and attack-any', () => {
      expect(matchingReactions(all, 'ranged-attack')).toEqual([deflect, wing]);
    });

    it('melee attack wakes only attack-any', () => {
      expect(matchingReactions(all, 'melee-attack')).toEqual([wing]);
    });

    it('damaged / ally-damaged / enemy-skill-check map one-to-one', () => {
      expect(matchingReactions(all, 'damaged')).toEqual([oversell]);
      expect(matchingReactions(all, 'ally-damaged')).toEqual([retributive]);
      expect(matchingReactions(all, 'enemy-skill-check')).toEqual([upstage]);
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
});
