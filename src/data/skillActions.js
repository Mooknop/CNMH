// Player-initiated skill actions (#260).
//
// Today the only player skill-check path is the GM-pushed SkillPrompt
// (cnmh_skillprompt_<charId>); the sheet's skill list is read-only and never
// spends actions or computes degrees. This registry is the data-driven source
// of truth for skill actions the player can launch themselves during an
// encounter — slice 1 ships Demoralize; maneuvers, Seek, and feat-granted
// entries slot in here later without touching the launch surface or resolver.
//
// Entry shape:
//   id          stable key, also the immunity abilityKey
//   name        display label
//   skill       skill id whose modifier the roll uses
//   skillOptions optional list of skill ids the player chooses among (Escape:
//               Athletics or Acrobatics); the special id 'unarmed' rolls the
//               unarmed-attack modifier instead of a skill. The modal defaults
//               to whichever option has the higher modifier
//   actionCost  actions spent on use
//   traits      PF2e traits; the 'Attack' trait makes the action participate in
//               the Multiple Attack Penalty (read + advance) like a strike
//   defense     target defense the degree is computed against ('will' = Will DC,
//               'perception' = Perception DC); null when the DC is GM-entered
//   selfTarget  true for actions that resolve against the acting PC rather than
//               an enemy (Escape) — no enemy picker, DC is GM-entered
//   outcomes    degree → outcome applied; absent degrees do nothing. An outcome is
//               one or more of:
//                 condition + value   enemy condition (value null = unvalued)
//                 scopedToAttacker    true scopes the enemy `condition` to the
//                                     acting PC (Feint's off-guard is "to your
//                                     attacks only", #348) rather than global
//                 selfCondition       condition applied to the acting PC (e.g. a
//                                     maneuver crit-fail leaving you prone)
//                 removeSelf          condition ids cleared from the acting PC
//                                     (Escape success removes grabbed/restrained)
//                 note                free text logged for GM-resolved effects
//                                     (Shove push, Disarm) with no condition
//   immunity    declarative immunity config (see utils/immunity.js); stamped on
//               the target on any non-error outcome (maneuvers omit this)
//   toggles     optional circumstance line items [{ id, label, bonus }] offered
//               as checkboxes on the roll (#260 AC4). The hook #223/#226 hang
//               feat bonuses on (Threat Display, Hunt Prey vs prey, Squox +2);
//               the modal also always offers a free-form "+N" circumstance entry
//   vsContexts  optional sub-context labels this action represents, e.g. Climb's
//               ['Climb'] (#510). A conditional ('vs X') effect modifier on this
//               action's skill surfaces as a toggle ONLY when its `vs` matches
//               one of these (normalized, case-insensitive) — so "+1 vs Climb"
//               offers on Climb, not on Grapple/Trip/Shove. Absent ⇒ the action
//               hosts no conditional effect toggles (the passive sheet hint in
//               EnhancedSkillsList still shows them)
//   surfaces    contexts the action appears in: 'encounter' (the combat Actions
//               list) and/or 'exploration' (the Explore tab). Absent ⇒
//               ['encounter'], so every combat action stays combat-only; Track
//               (#407) is ['exploration']
//   availableTo 'all' for basic actions everyone has; future entries gate per
//               character (feat-granted)
import { hasFeat } from '../utils/CharacterUtils';
import { conditionalModifiersFor } from '../utils/EffectUtils';

export const SKILL_ACTIONS = [
  {
    id: 'demoralize',
    name: 'Demoralize',
    skill: 'intimidation',
    actionCost: 1,
    traits: ['Auditory', 'Concentrate', 'Emotion', 'Mental'],
    defense: 'will',
    outcomes: {
      criticalSuccess: { condition: 'frightened', value: 2 },
      success:         { condition: 'frightened', value: 1 },
    },
    immunity: { duration: { value: 10, unit: 'minute' }, scope: 'per-caster' },
    availableTo: 'all',
  },
  // Seek (#223) — Perception to find a hidden/undetected creature. No save
  // defense: the DC is the creature's Stealth, GM-entered. Detection states
  // (undetected/hidden/observed) aren't modeled, so the outcomes are GM notes.
  // Hunt Prey layers a +2-vs-prey toggle via skillActionFeatAugments.
  {
    id: 'seek',
    name: 'Seek',
    skill: 'perception',
    actionCost: 1,
    traits: ['Concentrate', 'Secret'],
    defense: null,
    // Seek covers "find secret doors and traps" — the context Eagle-eye Elixir's
    // conditional Perception bonus targets (#510). The player flips it only when
    // Seeking for traps/doors rather than a hidden creature.
    vsContexts: ['find secret doors and traps'],
    outcomes: {
      criticalSuccess: { note: 'Pinpoint the creature (undetected → observed, hidden → observed)' },
      success:         { note: 'Locate the creature (undetected → hidden)' },
    },
    availableTo: 'all',
  },
  // Track (#407) — Survival to follow a trail. An exploration check (surfaces:
  // ['exploration']), not a combat action: it rolls vs a GM-entered DC, applies
  // no condition (outcomes are GM notes), and resolves standalone (selfTarget,
  // no enemy picker). Hunt Prey layers the same +2-vs-prey toggle it gives Seek.
  {
    id: 'track',
    name: 'Track',
    skill: 'survival',
    actionCost: 1,
    traits: ['Concentrate', 'Exploration', 'Move'],
    defense: null,
    selfTarget: true,
    surfaces: ['exploration'],
    outcomes: {
      criticalSuccess: { note: 'Follow the trail and learn the quarry\'s direction and pace' },
      success:         { note: 'Follow the trail (attempt a new check at each obstacle or fork)' },
      failure:         { note: 'Lose the trail; retry after 1 hour or by backtracking' },
      criticalFailure: { note: 'Lose the trail and can\'t try again for 24 hours' },
    },
    availableTo: 'all',
  },
  // Tumble Through (#349) — Acrobatics vs the creature's Reflex DC to move
  // through its space. Move trait, not Attack → no MAP. Movement-only: there's
  // no condition to apply, so the outcomes are GM/movement notes. Critical
  // results collapse to their non-critical counterparts per RAW.
  {
    id: 'tumble-through',
    name: 'Tumble Through',
    skill: 'acrobatics',
    actionCost: 1,
    traits: ['Move'],
    defense: 'reflex',
    outcomes: {
      criticalSuccess: { note: 'Move through the creature\'s space' },
      success:         { note: 'Move through the creature\'s space (treat its square as difficult terrain)' },
      failure:         { note: 'Movement ends; you can\'t move through the space' },
      criticalFailure: { note: 'Movement ends; you can\'t move through the space' },
    },
    availableTo: 'all',
  },
  // Athletics maneuvers (#260 slice 2). Attack-trait → MAP applies and advances.
  {
    id: 'trip',
    name: 'Trip',
    skill: 'athletics',
    actionCost: 1,
    traits: ['Attack'],
    defense: 'reflex',
    outcomes: {
      criticalSuccess: { condition: 'prone' },
      success:         { condition: 'prone' },
      criticalFailure: { selfCondition: 'prone' },
    },
    availableTo: 'all',
  },
  {
    id: 'grapple',
    name: 'Grapple',
    skill: 'athletics',
    actionCost: 1,
    traits: ['Attack'],
    defense: 'fortitude',
    outcomes: {
      criticalSuccess: { condition: 'restrained' },
      success:         { condition: 'grabbed' },
      criticalFailure: { selfCondition: 'prone' },
    },
    availableTo: 'all',
  },
  {
    id: 'shove',
    name: 'Shove',
    skill: 'athletics',
    actionCost: 1,
    traits: ['Attack'],
    defense: 'fortitude',
    outcomes: {
      criticalSuccess: { note: 'Pushed back 10 ft' },
      success:         { note: 'Pushed back 5 ft' },
    },
    availableTo: 'all',
  },
  {
    id: 'disarm',
    name: 'Disarm',
    skill: 'athletics',
    actionCost: 1,
    traits: ['Attack'],
    defense: 'reflex',
    outcomes: {
      criticalSuccess: { note: 'Item knocked to the ground' },
      success:         { note: 'Disarmed (−2 to attacks with that weapon until its turn ends)' },
    },
    availableTo: 'all',
  },
  // Climb (#510) — Athletics vs a GM-entered surface DC to move up/across.
  // Movement check with no enemy target (selfTarget, GM DC) and GM-note
  // outcomes; available in and out of combat. Hosts the "vs Climb" conditional
  // toggle (Gecko Potion) so the bonus applies on the roll it actually affects.
  {
    id: 'climb',
    name: 'Climb',
    skill: 'athletics',
    actionCost: 1,
    traits: ['Move'],
    defense: null,
    selfTarget: true,
    vsContexts: ['Climb'],
    surfaces: ['encounter', 'exploration'],
    outcomes: {
      criticalSuccess: { note: 'Move up/across at full Speed (or 5 ft beyond)' },
      success:         { note: 'Move up, across, or down 5 feet (plus 5 ft per 20 you beat the DC)' },
      failure:         { note: 'No progress' },
      criticalFailure: { note: 'You fall and take falling damage' },
    },
    availableTo: 'all',
  },
  // Palm an Object (#510) — Thievery vs observers' Perception DC to take a small
  // object unnoticed. selfTarget (GM-entered DC), GM-note outcomes; available in
  // and out of combat. Hosts the "vs Palm an Object" conditional toggle (Gecko).
  {
    id: 'palm-an-object',
    name: 'Palm an Object',
    skill: 'thievery',
    actionCost: 1,
    traits: ['Manipulate'],
    defense: null,
    selfTarget: true,
    vsContexts: ['Palm an Object'],
    surfaces: ['encounter', 'exploration'],
    outcomes: {
      success:         { note: 'You palm the object unnoticed' },
      failure:         { note: 'You fail to palm the object' },
      criticalFailure: { note: 'You palm the object but a creature notices' },
    },
    availableTo: 'all',
  },
  // Feint (#260 slice 3) — Deception vs the target's Perception DC. The off-guard
  // it grants is scoped to your own attacks (#348): on success off-guard to your
  // melee attacks, on crit to all your attacks — both flagged scopedToAttacker so
  // the enemy condition records the attacker (the attack resolver then offers the
  // off-guard bonus only to that PC). The melee-vs-all nuance stays GM-judged.
  {
    id: 'feint',
    name: 'Feint',
    skill: 'deception',
    actionCost: 1,
    traits: ['Mental'],
    defense: 'perception',
    outcomes: {
      criticalSuccess: { condition: 'off-guard', scopedToAttacker: true },
      success:         { condition: 'off-guard', scopedToAttacker: true },
      criticalFailure: { selfCondition: 'off-guard' },
    },
    availableTo: 'all',
  },
  // Escape (#260 slice 3) — self-targeted: shed grabbed/restrained/immobilized.
  // Has the Attack trait, so it reads + advances MAP. The DC is the binding
  // effect's (the grabber's), entered by the GM. Athletics, Acrobatics, or the
  // unarmed-attack modifier (#349).
  {
    id: 'escape',
    name: 'Escape',
    skill: 'athletics',
    skillOptions: ['athletics', 'acrobatics', 'unarmed'],
    actionCost: 1,
    traits: ['Attack'],
    defense: null,
    selfTarget: true,
    outcomes: {
      criticalSuccess: { removeSelf: ['grabbed', 'restrained', 'immobilized'] },
      success:         { removeSelf: ['grabbed', 'restrained', 'immobilized'] },
    },
    availableTo: 'all',
  },
];

/**
 * Skill actions available to a character in the current context. Every PC gets
 * the 'all' basic actions (Demoralize is usable untrained, so no proficiency
 * gate); the active surface ('encounter' vs 'exploration') filters by each
 * action's `surfaces` (absent ⇒ encounter-only). Feat-granted entries will
 * filter on character data here.
 *
 * @param {object} character        the acting PC (unused for 'all' entries today)
 * @param {{ encounterMode?: boolean, explorationMode?: boolean }} [opts]
 * @returns {Array} matching skill-action entries
 */
export function skillActionsFor(character, { encounterMode = false, explorationMode = false } = {}) {
  if (!character) return [];
  const ctx = encounterMode ? 'encounter' : explorationMode ? 'exploration' : null;
  if (!ctx) return [];
  return SKILL_ACTIONS.filter(
    (a) => a.availableTo === 'all' && (a.surfaces || ['encounter']).includes(ctx)
  );
}

export const getSkillAction = (id) => SKILL_ACTIONS.find((a) => a.id === id) || null;

/**
 * Feat- and companion-driven augments layered onto a base skill action for a
 * specific character (#223). The hook the SkillActionModal comments anticipate:
 *   - toggles: circumstance line items [{ id, label, bonus }] the player flips on
 *     (rendered beside the free-form "+N" entry); use for real bonuses.
 *   - hints: informational reminders for things the app can't auto-net — e.g.
 *     ignoring a penalty it never modeled. Rendered as a note, no math.
 * React-free; reads only character data.
 *
 * @param {object} character  the acting PC
 * @param {object} action     a SKILL_ACTIONS entry
 * @returns {{ toggles: Array, hints: string[] }}
 */
export function skillActionFeatAugments(character, action) {
  const toggles = [];
  const hints = [];
  if (!character || !action) return { toggles, hints };

  // Threat Display (Squox familiar): while the familiar is within 30 ft you may
  // Demoralize a creature that doesn't share your language without the −4
  // penalty. The app never applies that penalty, so surface a hint, not a bonus.
  const hasThreatDisplay = (character.familiar?.abilities || []).some(
    (a) => /threat display/i.test(a?.name || '')
  );
  if (action.id === 'demoralize' && hasThreatDisplay) {
    hints.push(
      `Threat Display: while ${character.familiar?.name || 'your familiar'} is within 30 ft and able to act, ignore the −4 penalty to Demoralize a creature that doesn't share your language.`
    );
  }

  // Hunt Prey: +2 circumstance to Seek *and* Track your designated prey (#407).
  // Ranger Dedication grants the Hunt Prey action; the player flips the toggle
  // when Seeking prey in combat or Tracking it in exploration (the prey badge on
  // the initiative list shows which enemy that is).
  if ((action.id === 'seek' || action.id === 'track') && hasFeat(character, 'Ranger Dedication')) {
    toggles.push({ id: `hunt-prey-${action.id}`, label: 'Hunt Prey vs prey', bonus: 2 });
  }

  return { toggles, hints };
}

// Normalize a sub-context label for matching: trim + lowercase, so the
// modifier's `vs` ("Climb") and the action's vsContexts (['Climb']) match
// regardless of casing/whitespace without any fuzzy/substring guessing.
const normContext = (s) => String(s || '').trim().toLowerCase();

/**
 * Conditional ('vs X') effect modifiers that apply to THIS action's sub-context,
 * mapped to the SkillActionModal toggle shape so the player can opt the bonus in
 * for the roll it actually affects (#510, refining #338). A modifier surfaces
 * only when (a) it targets the action's skill and (b) its `vs` exactly matches
 * one of the action's declared `vsContexts` (normalized) — so "+1 vs Climb"
 * offers on Climb, not on Grapple/Trip/Shove. An action without `vsContexts`
 * hosts no conditional toggles (the passive sheet hint still shows them).
 * Unconditional skill effects already net into the roll profile, so only
 * `vs`-scoped ones are considered. React-free.
 *
 * @param {object} action       a SKILL_ACTIONS entry
 * @param {Array}  effects       active effects (cnmh_effects_<id>)
 * @param {Array}  [effectCatalog] effect catalog (defaults to PF2E_EFFECTS)
 * @returns {Array<{ id, label, bonus }>}
 */
export function effectConditionalToggles(action, effects, effectCatalog) {
  if (!action || !effects || !effects.length) return [];
  const contexts = new Set((action.vsContexts || []).map(normContext));
  if (!contexts.size) return [];
  const skills = [action.skill, ...(action.skillOptions || [])].filter(Boolean);
  const toggles = [];
  const seen = new Set();
  for (const skill of skills) {
    for (const m of conditionalModifiersFor(effects, skill, effectCatalog)) {
      if (!contexts.has(normContext(m.vs))) continue;
      const id = `effect-${m.label}-${m.vs}`;
      if (seen.has(id)) continue;
      seen.add(id);
      toggles.push({ id, label: `${m.label} (vs ${m.vs})`, bonus: m.amount });
    }
  }
  return toggles;
}

/**
 * Immutably layer a character's feat augments (and, when its active effects are
 * supplied, conditional effect-modifier toggles) onto a base skill action so the
 * SkillActionModal can render the extra toggles/hints. Returns the action
 * unchanged when there's nothing to add.
 *
 * @param {object} character
 * @param {object} action
 * @param {{ effects?: Array, effectCatalog?: Array }} [opts]
 */
export function augmentSkillAction(character, action, opts = {}) {
  if (!action) return action;
  const { toggles, hints } = skillActionFeatAugments(character, action);
  const effectToggles = effectConditionalToggles(action, opts.effects, opts.effectCatalog);
  if (!toggles.length && !hints.length && !effectToggles.length) return action;
  return {
    ...action,
    toggles: [...(action.toggles || []), ...toggles, ...effectToggles],
    hints: [...(action.hints || []), ...hints],
  };
}
