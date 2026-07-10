// Feature: Active-combatant action feed (#472b) — the Foundry half of the stage
// action feed the app renders (#472a, src/components/encounter/stage/ActorFeed.jsx).
//
// Watches createChatMessage, keeps only the messages authored by the combatant
// whose turn it currently is, and turns each into a feed entry. Per-turn action
// economy is summed from the parsed costs — verified against the PF2e v7 source,
// CombatantPF2e persists no actions-spent/remaining value, so there is nothing
// authoritative to read; summing is the source of truth. The feed clears and
// re-keys on every turn change.
//
// Emits cnmh_actorfeed_global as { entryId, actions, spent, reaction, feed }
// where entryId is the active combatant's id and each feed entry is
// { n, cost, label, detail?, result?, tone?, state }.

import {
  getActiveCombat, getCombatState, getCombatantActorId, getChatMessageContext,
  onHook,
} from './pf2eAdapter.js';
import { RELAY } from './syncKeys.js';

let _sendUpdate = null;  // injected by bridge.js on init
// Per-turn accumulator. null until a combat/turn is observed.
// Shape: { entryId, actorId, n, spent, reaction, feed }
let _state = null;

export function initActorFeed(sendUpdateFn) {
  _sendUpdate = sendUpdateFn;
  onHook('createChatMessage', (message)        => onChatMessage(message));
  onHook('createCombat',      ()               => resetForActiveCombatant());
  onHook('updateCombat',      (combat, diff)   => onUpdateCombat(combat, diff));
  onHook('deleteCombat',      ()               => { _state = null; });
}

// --- turn lifecycle -------------------------------------------------------

function onUpdateCombat(_combat, diff) {
  // Foundry advances the turn/round via updateCombat; any other combat edit
  // (e.g. an initiative tweak) leaves the current actor's feed intact.
  if (diff?.turn === undefined && diff?.round === undefined) return;
  resetForActiveCombatant();
}

// Resolve the actor whose turn it is, then start a fresh, empty feed for them.
function resetForActiveCombatant() {
  const info = activeCombatantInfo();
  _state = {
    entryId:  info?.entryId ?? null,
    actorId:  info?.actorId ?? null,
    n:        0,
    spent:    0,
    reaction: true,
    feed:     [],
  };
  emit();
}

function activeCombatantInfo() {
  const combat = getActiveCombat();
  if (!combat) return null;
  const { activeCombatantId, combatants } = getCombatState(combat);
  if (!activeCombatantId) return null;
  // combatants is a Foundry Collection in Foundry and a plain array in tests;
  // both expose .find.
  const combatant = combatants?.find?.((c) => c.id === activeCombatantId) ?? null;
  if (!combatant) return null;
  return { entryId: activeCombatantId, actorId: getCombatantActorId(combatant) };
}

// --- chat-message parsing -------------------------------------------------

function onChatMessage(message) {
  const ctx = getChatMessageContext(message);
  if (!ctx) return;                                   // not a roll-context message

  if (!_state) resetForActiveCombatant();             // combat began before we keyed in
  if (!_state?.actorId) return;                       // no active combatant yet
  if (ctx.actorId !== _state.actorId) return;         // not the acting combatant

  const cost = compactCost(ctx);
  accrueEconomy(cost);
  _state.feed.push(buildEntry(ctx, cost, ++_state.n));
  emit();
}

function accrueEconomy(cost) {
  if (typeof cost === 'number') _state.spent = Math.min(3, _state.spent + cost);
  else if (cost === 'r')        _state.reaction = false;
  // 'f' (free) and null (e.g. a save) cost nothing.
}

function buildEntry(ctx, cost, n) {
  const detail = ctx.targetName ? `vs ${ctx.targetName}` : undefined;
  const result = resultText(ctx);
  const tone   = (ctx.outcome === 'failure' || ctx.outcome === 'criticalFailure')
    ? 'amber'
    : undefined;
  return {
    n,
    ...(cost != null ? { cost } : {}),
    label: ctx.itemName ?? prettyType(ctx.type),
    ...(detail ? { detail } : {}),
    ...(result ? { result } : {}),
    ...(tone   ? { tone }   : {}),
    // Neutral facts the app maps to a reaction-trigger event (#472c). The bridge
    // stays semantics-free; src/utils/reactionTriggers.js owns the interpretation.
    type: ctx.type,
    ...(ctx.attackRange   ? { attackRange:   ctx.attackRange }   : {}),
    ...(ctx.targetActorId ? { targetActorId: ctx.targetActorId } : {}),
    // Typed damage read-out (#1355) — amount + per-type instances off the
    // DamageRoll, so the app's taken-damage juice can correlate an hp drop to
    // its types. `ts` bounds that correlation (stage matches within ~seconds).
    ...(ctx.damageTotal != null ? { damageTotal: ctx.damageTotal } : {}),
    ...(ctx.damageInstances ? { damageInstances: ctx.damageInstances } : {}),
    ts: Date.now(),
    state: 'done',
  };
}

// --- pure mappers (PF2e vocabulary → app feed vocabulary) -----------------

// Compact action cost the app's ActionSymbol understands: 1|2|3|'r'|'f', or null
// when the action carries no economy cost (e.g. a saving throw on your turn).
function compactCost(ctx) {
  // A reactive/free variant (e.g. Attack of Opportunity also rolls an attack)
  // is tagged on the item, so honor that before the per-type default.
  if (ctx.actionType === 'reaction') return 'r';
  if (ctx.actionType === 'free')     return 'f';
  switch (ctx.type) {
    case 'attack-roll':  return 1;            // a Strike is 1 action
    case 'saving-throw': return null;         // a save is not one of your 3 actions
    case 'damage-roll':  return null;         // the damage of an action already counted — never its own action
    case 'spell-cast':   return normGlyph(ctx.spellTime);
    case 'skill-check':
    default:
      return normGlyph(ctx.actionCount) ?? 1;
  }
}

// Normalize a PF2e cost token (number, '1'|'2'|'3', 'reaction', 'free') to the
// compact form. Anything else (e.g. a '1 minute' ritual) → null: not a combat action.
function normGlyph(raw) {
  if (raw === 'reaction') return 'r';
  if (raw === 'free')     return 'f';
  const n = Number(raw);
  return n === 1 || n === 2 || n === 3 ? n : null;
}

const ATTACK_RESULT = {
  criticalSuccess: 'Critical Hit',
  success:         'Hit',
  failure:         'Miss',
  criticalFailure: 'Critical Miss',
};
const CHECK_RESULT = {
  criticalSuccess: 'Critical Success',
  success:         'Success',
  failure:         'Failure',
  criticalFailure: 'Critical Failure',
};

function resultText(ctx) {
  if (!ctx.outcome) return undefined;
  const table = ctx.type === 'attack-roll' ? ATTACK_RESULT : CHECK_RESULT;
  return table[ctx.outcome];
}

const TYPE_LABEL = {
  'attack-roll':  'Strike',
  'spell-cast':   'Spell',
  'skill-check':  'Skill check',
  'saving-throw': 'Save',
  'damage-roll':  'Damage',
};
function prettyType(type) {
  return TYPE_LABEL[type] ?? 'Action';
}

// --- relay ----------------------------------------------------------------

function emit() {
  if (!_state?.entryId) return;  // nothing meaningful to address yet
  _sendUpdate?.('global', RELAY.ACTORFEED, {
    entryId:  _state.entryId,
    actions:  3,
    spent:    _state.spent,
    reaction: _state.reaction,
    feed:     _state.feed,
  });
}
