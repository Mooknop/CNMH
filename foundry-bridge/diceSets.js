// Feature: Dice So Nice dice sets (#1490 S7). The GM assigns each character
// (and enemies) a 3D-dice appearance in the app's Theme page; the map syncs on
//   cnmh_dicesets_global = { [charId]: appearance, enemy: appearance }
// where appearance is DSN's documented object ({ colorset?, foreground,
// background, outline, edge, texture?, material, font?, system? }).
//
// Styling happens in DSN's diceSoNiceRollStart hook — ONE mechanism covers
// every 3D roll on this client: the app's delegated rollreq dice, native enemy
// saves (rollActorSave), NPC initiative (combat.rollNPC), and GM manual rolls
// from mapped actors. Resolution: chat-message speaker actor → actorMap →
// charId set; an actor with NO mapping (NPCs) gets the 'enemy' set; a mapped
// PC without a configured set — and rolls with no speaker actor at all — keep
// the DSN defaults. With DSN absent the hook simply never fires.
//
// The map is persisted campaign CONFIG (unlike the live-only roll rails), so
// bridge.js seeds it from FULL_STATE on connect exactly like the actor map.
// All Foundry access goes through pf2eAdapter.js.

import { onHook, getChatMessageSpeakerActorId } from './pf2eAdapter.js';
import { getActorMap } from './encounter.js';

export const ENEMY_SET_KEY = 'enemy';

const APPEARANCE_FIELDS = [
  'colorset', 'foreground', 'background', 'outline', 'edge',
  'texture', 'material', 'font', 'system',
];

let _sets = {};

export function updateDiceSets(value) {
  _sets = value && typeof value === 'object' ? value : {};
}

// Keep only DSN's known string fields; null when nothing usable remains, so a
// half-cleared entry never stamps an empty appearance.
function sanitizeSet(set) {
  if (!set || typeof set !== 'object') return null;
  const out = {};
  for (const f of APPEARANCE_FIELDS) {
    if (typeof set[f] === 'string' && set[f].trim()) out[f] = set[f].trim();
  }
  return Object.keys(out).length ? out : null;
}

// Exported for tests; registered on the DSN hook by initDiceSets.
export function handleDiceSoNiceRollStart(messageId, context) {
  const roll = context?.roll;
  if (!roll) return;
  const actorId = messageId ? getChatMessageSpeakerActorId(messageId) : null;
  if (!actorId) return; // unattributed roll — leave DSN defaults
  const charId = getActorMap()[actorId] ?? null;
  const set = sanitizeSet(charId ? _sets[charId] : _sets[ENEMY_SET_KEY]);
  if (!set) return;
  roll.options = roll.options || {};
  roll.options.appearance = set;
}

export function initDiceSets() {
  onHook('diceSoNiceRollStart', handleDiceSoNiceRollStart);
}
