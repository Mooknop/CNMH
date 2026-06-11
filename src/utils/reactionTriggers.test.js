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

    it('damaged-any wakes for both self and ally damage events', () => {
      // Amulet's Abeyance: "you or an ally within 15 feet" takes damage.
      const abeyance = { name: "Amulet's Abeyance", triggerType: 'damaged-any' };
      expect(matchingReactions([abeyance], 'damaged')).toEqual([abeyance]);
      expect(matchingReactions([abeyance], 'ally-damaged')).toEqual([abeyance]);
      expect(matchingReactions([abeyance], 'ranged-attack')).toEqual([]);
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
});
