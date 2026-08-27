// Shared helpers for exploration activity highlight/eligibility logic, AND
// (#1812, epic #1804 S8) the roll math/degree/effect-application logic behind
// an exploration activity's `mechanics.roll`. Used by ExplorationList (the
// player's picker) via RollActivityModal, FollowExpertModal (picker filter),
// and DockExplorationRoster (the GM's act-as picker #1810 + dock-side secret
// checks #1812) — every surface that rolls or gates an exploration activity
// pulls from here so they can't drift apart.
//
// RollActivityModal is now a THIN CONSUMER of the roll helpers below (not the
// other way around): it used to own this math inline, but #1812 needed the
// exact same "skill bonus for this character" and "degree of success" rules
// on the dock, which has no RollActivityModal instance to reuse directly (the
// dock rolls many PCs from one strip, never opens the player's roll sheet).
// Extracting here and refactoring RollActivityModal onto it means the two
// surfaces literally cannot compute a different number for the same PC/skill.

import { getSkillModifier } from './CharacterUtils';
import { resolveActionRoll } from './rollResolution';
import { newEntryUid } from './uid';
import { EXPLORATION_EFFECT_SOURCE } from '../hooks/useExplorationEffect';
import { APP, syncKey } from '../sync/keys';

export function profLabel(rank) {
  if (rank >= 4) return 'Legendary';
  if (rank >= 3) return 'Master';
  if (rank >= 2) return 'Expert';
  return null;
}

// Returns the proficiency rank map for a raw character object.
// Handles both { proficiency: N } objects and bare numbers.
export function skillProficienciesFor(character) {
  const result = {};
  for (const [skill, data] of Object.entries(character?.skills || {})) {
    result[skill] = typeof data === 'object' ? (data.proficiency || 0) : (data || 0);
  }
  return result;
}

// Whether an activity is offered to a character at all.
//   requiresFlag         — the named useCharacter() flag must be true
//   requiresAnyFlag      — at least one of the named flags must be true
//   requiresTrainedInAny — Trained (rank ≥ 1) in at least one of the named skills
// An activity with none of these is always available.
export function activityAvailableFor(activity, { flags = {}, skillProficiencies = {} } = {}) {
  if (!activity) return false;
  if (activity.requiresFlag && !flags[activity.requiresFlag]) return false;
  if (activity.requiresAnyFlag && !activity.requiresAnyFlag.some((f) => !!flags[f])) return false;
  if (activity.requiresTrainedInAny
    && !activity.requiresTrainedInAny.some((s) => (skillProficiencies[s] || 0) >= 1)) return false;
  return true;
}

// The gated activity list for one character, in catalog order.
export function availableActivitiesFor(activities, character) {
  return (activities || []).filter((a) => activityAvailableFor(a, character || {}));
}

// Returns the Expert+ label for an activity given a proficiency map, or null.
export function activityHighlightLabel(activity, skillProficiencies) {
  if (!activity?.highlightSkills) return null;
  const bestRank = Math.max(...activity.highlightSkills.map((s) => skillProficiencies[s] || 0));
  return profLabel(bestRank);
}

// Returns the skill id that makes this activity Expert-highlighted for this character,
// or null if no skill is Expert or higher. When multiple qualify, highest rank wins.
export function getExpertHighlightSkill(activity, skillProficiencies) {
  if (!activity?.highlightSkills) return null;
  let bestSkill = null, bestRank = 0;
  for (const s of activity.highlightSkills) {
    const rank = skillProficiencies[s] || 0;
    if (rank > bestRank) { bestRank = rank; bestSkill = s; }
  }
  return bestRank >= 2 ? bestSkill : null;
}

// ─── Roll math (#1812) ────────────────────────────────────────────────────
// Everything below drives an activity's `mechanics.roll`. Shared by
// RollActivityModal (player, one PC at a time, secret rolls shown to the
// player "for reference" per the existing preCommitNote) and
// DockExplorationRoster (GM, many PCs, deliberately unsynced — see that
// file's header comment for the secrecy ruling).

// Skill ids a roll config could use: the fixed `skill` for type:'skill', or
// the TRAINED subset of `skills` for type:'skill-pick' (Investigate, Detect
// Magic, ...) — mirrors RollActivityModal's `pickableSkills` filter exactly.
// `target:'party-pc'` rolls (Treat Poison) are intentionally excluded from
// this whole roll-math module's callers on the dock (see DockExplorationRoster's
// header comment) but this function itself doesn't need to know that.
export function pickableRollSkills(roll, characterModel) {
  if (!roll) return [];
  if (roll.type === 'skill-pick') {
    const profs = characterModel?.skillProficiencies || {};
    return (roll.skills || []).filter((s) => (profs[s] || 0) >= 1);
  }
  if (roll.type === 'skill' && roll.skill) return [roll.skill];
  return [];
}

// Auto-picks the trained skill with the highest modifier for this character —
// the same "best option wins" rule SkillCheckModal's `defaultSkill` applies to
// its `skillOptions` reduce. The dock has no player to ask which skill to use
// (it rolls secretly, often via "Roll all"), so defaulting to the character's
// best trained option is the least-surprising GM-facing behavior. Returns
// null when nothing is trained (mirrors RollActivityModal's empty-state block).
export function bestRollSkill(roll, character, characterModel) {
  const options = pickableRollSkills(roll, characterModel);
  if (options.length === 0) return null;
  return options.reduce(
    (best, s) => (getSkillModifier(character, s) > getSkillModifier(character, best) ? s : best),
    options[0]
  );
}

// Net bonus for one skill check, including the activity's own circumstance
// bonus (Coerce's +4) and an optional Follow the Expert +2 — identical inputs
// to what RollActivityModal fed into resolveActionRoll before this extraction.
// Returns { bonus, circumstanceBonus, circumstanceLabel }; bonus is null when
// there's no skill to roll (nothing trained for a skill-pick check).
export function explorationRollBonus(roll, skillId, character, {
  conditions = [], effects = [], effectCatalog, followExpertBonus = 0,
} = {}) {
  if (!skillId || !character) return { bonus: null, circumstanceBonus: 0, circumstanceLabel: '' };
  const syntheticAbility = { roll: { type: 'skill', skill: skillId } };
  const profile = resolveActionRoll(syntheticAbility, character, { conditions, effects, effectCatalog });
  const baseCircumstanceBonus = roll?.circumstanceBonus || 0;
  const baseCircumstanceLabel = roll?.circumstanceLabel || '';
  const circumstanceBonus = baseCircumstanceBonus + followExpertBonus;
  const circumstanceLabel = [baseCircumstanceLabel, followExpertBonus ? 'Follow the Expert' : '']
    .filter(Boolean).join(' + ');
  const bonus = profile.bonus != null ? profile.bonus + circumstanceBonus : null;
  return { bonus, circumstanceBonus, circumstanceLabel };
}

// Degree of success from a d20 total vs DC, applying the PF2e critical
// threshold rule (beat/miss the DC by 10+). Deliberately NOT computeSaveDegree
// (#1697 API freeze, "H — RollActivity + SkillCheck"): this activity dialect
// never applied the nat-1/20 shift, and that's unchanged by this extraction —
// moved verbatim out of RollActivityModal, not rewritten.
export function explorationDegreeOfSuccess(total, dc) {
  if (total >= dc + 10) return 'criticalSuccess';
  if (total >= dc) return 'success';
  if (total <= dc - 10) return 'criticalFailure';
  return 'failure';
}

// Raw d20 roll with an injectable RNG (default Math.random) so callers can be
// deterministic in tests — same pattern as utils/overload.js's rollOverload.
export function rollD20(rng = Math.random) {
  return Math.floor(rng() * 20) + 1;
}

// A roll config the dock can trigger with zero player interaction. Excludes
// `target:'party-pc'` (Treat Poison) — that config needs a target picker
// that doesn't fit a compact roster row, and Treat Poison isn't Secret-traited
// in the first place (no reason for the GM to roll it in place of the
// player). Player devices keep resolving it via RollActivityModal as today.
export function isDockRollable(roll) {
  return !!(roll && roll.target !== 'party-pc');
}

// Builds and applies the one onSuccessEffect entry a successful roll grants,
// via the SAME entry shape and write path RollActivityModal's onCommit always
// used (sendUpdate + a synchronous localStorage mirror so a same-tick reader
// sees it before the round trip). Note this call DOES touch the relay — only
// the roll's face/total/degree stay dock-local; the mechanical effect it
// grants is exactly as visible to every client as it always was (this is the
// same key the S6 dock-side effect driver — useExplorationEffect — already
// writes to for activity self-buffs).
//
// Deliberately an append, not a reconcile like useExplorationEffect: this
// mirrors RollActivityModal's existing (pre-#1812) behavior verbatim, so a
// PC re-rolled successfully twice can end up with two entries on both
// surfaces alike — a pre-existing quirk this slice does not attempt to fix.
export function applyExplorationSuccessEffect(effectId, targetId, { getState, sendUpdate }) {
  if (!effectId || !targetId) return null;
  const current = getState(targetId, APP.EFFECTS) || [];
  const next = [
    ...current,
    { id: newEntryUid(), effectId, source: EXPLORATION_EFFECT_SOURCE, ts: Date.now() },
  ];
  try { window.localStorage.setItem(syncKey(APP.EFFECTS, targetId), JSON.stringify(next)); } catch { /* noop */ }
  sendUpdate(targetId, APP.EFFECTS, next);
  return next;
}

// Display labels shared by every roll surface (RollActivityModal, ExplorationList,
// DockExplorationRoster) — kept here so a new surface doesn't restate its own copy.
export const SKILL_DISPLAY_NAMES = {
  arcana: 'Arcana', nature: 'Nature', occultism: 'Occultism', religion: 'Religion',
  society: 'Society', crafting: 'Crafting', survival: 'Survival', stealth: 'Stealth',
  deception: 'Deception', diplomacy: 'Diplomacy', intimidation: 'Intimidation',
  medicine: 'Medicine', perception: 'Perception', thievery: 'Thievery',
  acrobatics: 'Acrobatics', athletics: 'Athletics', performance: 'Performance',
};

export const DEGREE_LABEL = {
  criticalSuccess: 'Critical Success',
  success: 'Success',
  failure: 'Failure',
  criticalFailure: 'Critical Failure',
};
