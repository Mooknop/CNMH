// Reaction trigger vocabulary + GM event catalog (#221).
//
// A reaction declares an optional `triggerType` (authored in the GM character
// editor). The GM trigger console fires a trigger EVENT at one or more PCs;
// a PC's reaction matches when its triggerType is in the event's match list.
// Matching runs on the player's device, where the character's reactions live.

import { getActions, getReactions } from './actionUtils';

// What a reaction can declare. Shown as the "reaction trigger" select in the
// GM ability editor; stored on the ability as `triggerType: <id>`.
export const TRIGGER_TYPES = [
  { id: 'attack-ranged',     label: 'A ranged attack targets you' },
  { id: 'attack-melee',      label: 'A melee attack targets you' },
  { id: 'attack-any',        label: 'Any attack targets you' },
  { id: 'damaged-self',      label: 'A creature damages you' },
  { id: 'damaged-ally',      label: 'An ally nearby is damaged' },
  { id: 'damaged-any',       label: 'You or an ally nearby is damaged' },
  { id: 'self-check-failed', label: 'You fail a check' },
  { id: 'enemy-skill-check', label: 'An enemy attempts a skill check' },
  { id: 'auditory-visual-effect', label: 'You or an ally is affected by an auditory or visual effect' },
  { id: 'grabbed',           label: 'You become grabbed, restrained, or immobilized' },
  { id: 'fall',              label: 'You begin to fall' },
];

// What the GM can fire. `matches` lists the triggerTypes the event wakes up.
export const TRIGGER_EVENTS = [
  { id: 'ranged-attack',     label: 'Ranged attack incoming', matches: ['attack-ranged', 'attack-any'] },
  { id: 'melee-attack',      label: 'Melee attack incoming',  matches: ['attack-any', 'attack-melee'] },
  { id: 'damaged',           label: 'PC was damaged',         matches: ['damaged-self', 'damaged-any'] },
  { id: 'ally-damaged',      label: 'Ally damaged nearby',    matches: ['damaged-ally', 'damaged-any'] },
  { id: 'check-failed',      label: 'PC failed a check',      matches: ['self-check-failed'] },
  { id: 'enemy-skill-check', label: 'Enemy attempting a skill check', matches: ['enemy-skill-check'] },
  { id: 'auditory-visual-effect', label: 'Auditory/visual effect', matches: ['auditory-visual-effect'] },
  { id: 'grabbed',           label: 'PC grabbed / restrained / immobilized', matches: ['grabbed'] },
  { id: 'fall',              label: 'PC begins to fall', matches: ['fall'] },
];

export const eventById = (eventId) =>
  TRIGGER_EVENTS.find((e) => e.id === eventId) || null;

// Whether a triggerType id is one the engine actually broadcasts against
// (#278). Used both by the ability editor — to flag an authored value that
// doesn't match any TRIGGER_TYPES entry (typo, or an id later removed) — and
// by the coverage audit below.
export const isKnownTriggerType = (triggerType) =>
  TRIGGER_TYPES.some((t) => t.id === triggerType);

// Whether an ability/spell is reaction-cost, per the authored `actions` string
// convention every cost parser shares (UseAbilityModal, actionIconUtils, the
// editor cost codec). Used to pick reaction-cost spells out of staff data.
export const isReactionCost = (ability) =>
  typeof ability?.actions === 'string' && ability.actions.toLowerCase().includes('reaction');

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

/**
 * Map an actor-feed entry (relayed from the bridge, #472b) to the TRIGGER_EVENTS
 * id it satisfies for *this viewer*, or null when it arms nothing. The bridge
 * emits only neutral facts (type, attackRange, targetActorId); this is the sole
 * place those facts become reaction-trigger semantics, so the bridge and #221
 * can't disagree. Narration only — it never fires a reaction.
 *
 * @param {object} entry - feed entry: { type, attackRange?, targetActorId? }
 * @param {object} ctx
 * @param {string} ctx.actorKind     - 'pc' | 'enemy' (the acting combatant)
 * @param {string} ctx.viewerCharId  - the character whose stage this is
 * @param {(foundryActorId:string)=>string|null} ctx.targetCharIdOf
 *        - resolves the entry's target to a PC charId (null for non-PCs)
 * @returns {string|null} a TRIGGER_EVENTS id
 */
export const feedTriggerEvent = (entry, { actorKind, viewerCharId, targetCharIdOf } = {}) => {
  if (!entry?.type) return null;
  const targetCharId = entry.targetActorId ? targetCharIdOf?.(entry.targetActorId) ?? null : null;

  switch (entry.type) {
    case 'attack-roll':
      // Attack triggers are "targets you" — only arm when this viewer is the mark.
      if (targetCharId !== viewerCharId) return null;
      return entry.attackRange === 'ranged' ? 'ranged-attack' : 'melee-attack';
    case 'skill-check':
      return actorKind === 'enemy' ? 'enemy-skill-check' : null;
    case 'damage-roll':
      if (!targetCharId) return null;             // damage to a non-PC arms no ally reaction
      return targetCharId === viewerCharId ? 'damaged' : 'ally-damaged';
    default:
      return null;
  }
};

/**
 * Reaction-trigger coverage audit for one character (#278). Finds
 * reaction-cost abilities that will never prompt: either no `triggerType`
 * was authored, or the authored value isn't (or is no longer) one of
 * TRIGGER_TYPES.
 *
 * Reuses the same enumeration GmTriggerConsole/matchingReactions read —
 * `getReactions(character)` — since every entry there is a reaction by
 * virtue of its bucket (character.reactions / item.reactions / feat.reactions
 * carry no `actions` cost string of their own). `getActions(character)` is
 * also scanned, filtered through `isReactionCost`, as a defensive catch for a
 * reaction-cost ability that was authored into the actions list instead of
 * the reactions one — it would otherwise never surface here.
 *
 * @param {Object} character - character doc (getReactions/getActions input)
 * @returns {{ missing: Array, unknown: Array }} reaction-cost abilities that
 *   won't ever be woken by a fired trigger event, split by cause. Each entry
 *   keeps its original ability shape (name, triggerType, source, …).
 */
export const reactionCoverageGaps = (character) => {
  if (!character) return { missing: [], unknown: [] };
  const reactionCost = [
    ...getReactions(character),
    ...getActions(character).filter(isReactionCost),
  ];
  const missing = reactionCost.filter((r) => r && !r.triggerType);
  const unknown = reactionCost.filter((r) => r && r.triggerType && !isKnownTriggerType(r.triggerType));
  return { missing, unknown };
};
