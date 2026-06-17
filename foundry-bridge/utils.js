// Echo-loop guard helpers.
//
// When the bridge writes to Foundry (actor.update, token move, combat.nextTurn,
// etc.) it tags the operation with a Foundry options flag. The bridge's own hook
// listeners check for this flag and bail out, preventing the change from bouncing
// back to the app as a new outbound update.

export const BRIDGE_SOURCE_FLAG = '_bridgeSource';
export const BRIDGE_UPDATE_FLAG = '_bridgeUpdate';

export function isBridgeEcho(options) {
  return options?.[BRIDGE_SOURCE_FLAG] === 'app' || options?.[BRIDGE_UPDATE_FLAG] === true;
}

// PF2e condition slug → CNMH condition id mapping.
// Add slugs as needed; these are the ones the app already knows about.
export const CONDITION_SLUG_MAP = {
  'blinded':          'blinded',
  'clumsy':           'clumsy',
  'confused':         'confused',
  'controlled':       'controlled',
  'dazzled':          'dazzled',
  'deafened':         'deafened',
  'doomed':           'doomed',
  'drained':          'drained',
  'dying':            'dying',
  'encumbered':       'encumbered',
  'enfeebled':        'enfeebled',
  'fascinated':       'fascinated',
  'fatigued':         'fatigued',
  'flat-footed':      'flat-footed',
  'fleeing':          'fleeing',
  'frightened':       'frightened',
  'grabbed':          'grabbed',
  'helpful':          'helpful',
  'hidden':           'hidden',
  'hostile':          'hostile',
  'immobilized':      'immobilized',
  'indifferent':      'indifferent',
  'invisible':        'invisible',
  'observed':         'observed',
  'paralyzed':        'paralyzed',
  'petrified':        'petrified',
  'prone':            'prone',
  'quickened':        'quickened',
  'restrained':       'restrained',
  'sickened':         'sickened',
  'slowed':           'slowed',
  'stunned':          'stunned',
  'stupefied':        'stupefied',
  'unconscious':      'unconscious',
  'undetected':       'undetected',
  'unfriendly':       'unfriendly',
  'unnoticed':        'unnoticed',
  'wounded':          'wounded',
};

export function slugToAppConditionId(slug) {
  return CONDITION_SLUG_MAP[slug] ?? slug;
}

// PF2e effect-item slug → CNMH effect-catalog id (#455 read-back). Only effects
// the app models as a buff are listed; effect items without a mapping (the aura
// *source* machinery, unmapped spell effects) are skipped by the read-back so they
// never surface as a phantom app effect. The stock "Spell Effect: Courageous
// Anthem" sluggifies to `spell-effect-courageous-anthem`; the legacy `inspire-
// courage`/`courageous-anthem` slugs are mapped too for resilience across PF2e data.
export const EFFECT_SLUG_MAP = {
  'spell-effect-courageous-anthem': 'inspire-courage',
  'courageous-anthem':             'inspire-courage',
  'inspire-courage':               'inspire-courage',
};

// Map a PF2e effect slug to an app effect id, or null when the effect isn't one
// the app models (so the read-back can drop it).
export function slugToAppEffectId(slug) {
  return EFFECT_SLUG_MAP[slug] ?? null;
}

// Stable incrementing counter for log entry deduplication.
let _logCounter = 0;
export function nextLogId() {
  return `bridge-${Date.now()}-${++_logCounter}`;
}
