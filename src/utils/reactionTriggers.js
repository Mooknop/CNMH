// Reaction trigger vocabulary + GM event catalog (#221).
//
// A reaction declares an optional `triggerType` (authored in the GM character
// editor). The GM trigger console fires a trigger EVENT at one or more PCs;
// a PC's reaction matches when its triggerType is in the event's match list.
// Matching runs on the player's device, where the character's reactions live.

// What a reaction can declare. Shown as the "reaction trigger" select in the
// GM ability editor; stored on the ability as `triggerType: <id>`.
export const TRIGGER_TYPES = [
  { id: 'attack-ranged',     label: 'A ranged attack targets you' },
  { id: 'attack-any',        label: 'Any attack targets you' },
  { id: 'damaged-self',      label: 'A creature damages you' },
  { id: 'damaged-ally',      label: 'An ally nearby is damaged' },
  { id: 'enemy-skill-check', label: 'An enemy attempts a skill check' },
];

// What the GM can fire. `matches` lists the triggerTypes the event wakes up.
export const TRIGGER_EVENTS = [
  { id: 'ranged-attack',     label: 'Ranged attack incoming', matches: ['attack-ranged', 'attack-any'] },
  { id: 'melee-attack',      label: 'Melee attack incoming',  matches: ['attack-any'] },
  { id: 'damaged',           label: 'PC was damaged',         matches: ['damaged-self'] },
  { id: 'ally-damaged',      label: 'Ally damaged nearby',    matches: ['damaged-ally'] },
  { id: 'enemy-skill-check', label: 'Enemy attempting a skill check', matches: ['enemy-skill-check'] },
];

export const eventById = (eventId) =>
  TRIGGER_EVENTS.find((e) => e.id === eventId) || null;

/**
 * Reactions from `getReactions(character)` that wake up for a trigger event.
 * Item-sourced reactions carry `active: false` while the item is stowed —
 * those never match.
 *
 * @param {Array}  reactions - normalized reaction list (getReactions output)
 * @param {string} eventId   - a TRIGGER_EVENTS id
 * @returns {Array} matching reactions (possibly empty)
 */
export const matchingReactions = (reactions, eventId) => {
  const event = eventById(eventId);
  if (!event) return [];
  return (reactions || []).filter(
    (r) => r && r.triggerType && event.matches.includes(r.triggerType) && r.active !== false
  );
};
