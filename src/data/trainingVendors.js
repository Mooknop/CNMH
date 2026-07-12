// Training Vendors (#1191 S1) — locations that teach new abilities through
// downtime. Pure static module, React-free, mirrors earnIncomeEmployers.js.
//
// A vendor is a Location (same lore-doc ids that support + shops key off — see
// useLocationSupport). Once the party has earned a location's support
// (cnmh_support_global), the location offers TRAINING TRACKS: a PC banks
// downtime hours into a track via the allocator; on completion + GM
// confirmation (S2) the ability is granted durably.
//
// Vendor shape:
//   id        — the Location lore doc id (support/shops use the same ids).
//   name      — display name.
//   offerings — the tracks this vendor teaches.
//
// Offering shape:
//   id              — unique within the vendor (track provenance key).
//   name            — the ability taught (display + known-ability matching).
//   hours           — total downtime hours to complete (default 160 ≈ 1 month
//                     of 8-hour days); per-offering override allowed.
//   kind            — 'reaction' | 'feat' — the grant shape S2 writes into
//                     trained[] (reaction → standalone reaction; feat → feat
//                     entry with nested actions/strikes, e.g. a Monk stance).
//   requiresClass   — null | class name; only PCs of that class see the track.
//   skipIfKnown     — hide the track when the PC already has the ability
//                     (innate or previously trained).
//   requiresAbility — null | ability name the PC must already have (innate OR
//                     trained), e.g. Shield Block for the Specialized tracks.
//   choices         — null | [{ id, name, note, trigger?, summary?, grant? }]
//                     — the track teaches ONE of these, picked at track start
//                     (stored on the track so the GM approval shows exactly
//                     what lands). Choices the PC already knows are filtered
//                     out; a track can be taken again later for a different
//                     choice.
//   trigger         — reaction trigger text, kept separate from summary so the
//                     granted reaction doc carries it as its own field.
//   summary         — rules text shown when browsing (verbatim OK — openly
//                     licensed rules text, see #1212).
//   grant           — optional explicit grant payload ({ kind:'feat', feat }
//                     or { kind:'reaction', reaction }) when the ability needs
//                     more than name/trigger/summary (stances author full feat
//                     entries with nested actions/strikes — S3). Without it,
//                     reaction-kind offerings derive the reaction from those
//                     fields (see buildGrant).
//
// The launch catalog (#1191 S3): House of Blue Stones teaches Monk stances,
// Sandpoint Garrison teaches Shield Block + the three Specialized Shield
// Training tiers. Stance text follows the AoN/Paizo precedent already on the
// character docs (Blu's Dragon Stance); shield-reaction text is verbatim from
// Everything Shields (openly licensed OGC — see #1212). Encounter automation
// of the granted reactions is a follow-up epic; here they render descriptively.

export const DEFAULT_TRAINING_HOURS = 160;

// A Monk-stance offering — kind:'feat' with an explicit grant mirroring the
// Dragon Stance shape on Blu's doc: a feat carrying a Stance-trait action plus
// the co-located unarmed Strike (getStrikes gates the Strike on the stance
// being active via that co-location). Strike traits follow the doc convention
// (Attack + the unarmed attack's traits + Melee + Unarmed).
const stanceOffering = ({ id, name, level = 1, actionTraits = ['Monk', 'Stance'], strike, description }) => ({
  id,
  name,
  hours: DEFAULT_TRAINING_HOURS,
  kind: 'feat',
  requiresClass: 'Monk',
  skipIfKnown: true,
  requiresAbility: null,
  choices: null,
  summary: description,
  grant: {
    kind: 'feat',
    feat: {
      name,
      source: 'Monk',
      level,
      description,
      actions: [{ name, actionCount: 1, traits: actionTraits, description }],
      strikes: [{
        name: strike.name,
        proficiency: 'unarmed',
        type: 'melee',
        action: 1,
        damage: strike.damage,
        damageType: strike.damageType,
        traits: strike.traits,
        description: strike.description,
      }],
    },
  },
});

// A single Everything Shields reaction option on a Specialized track: the
// verbatim trigger + effect text S2's buildGrant folds into a reactions[]
// entry. `note` is the short picker hint (tier + any gear caveat).
const shieldReaction = ({ id, name, note, trigger, summary }) => ({ id, name, note, trigger, summary });

export const TRAINING_VENDORS = [
  {
    id: 'house-of-blue-stones',
    name: 'House of Blue Stones',
    offerings: [
      stanceOffering({
        id: 'crane-stance',
        name: 'Crane Stance',
        strike: {
          name: 'Crane Wing',
          damage: '1d6',
          damageType: 'bludgeoning',
          traits: ['Attack', 'Agile', 'Finesse', 'Nonlethal', 'Melee', 'Unarmed'],
          description: 'A sweeping strike with your arm held like a crane’s wing. You can only make this Strike while in Crane Stance.',
        },
        description:
          'Requirements You are unarmored. Your arms flutter like a crane’s wings. You gain a +1 circumstance ' +
          'bonus to AC, but the only Strikes you can make are crane wing attacks. These deal 1d6 bludgeoning ' +
          'damage; are in the brawling group; and have the agile, finesse, nonlethal, and unarmed traits. While ' +
          'in Crane Stance, reduce the DC for High Jump and Long Jump by 5, and when you Leap, you can move an ' +
          'additional 5 feet horizontally or 2 feet vertically.',
      }),
      stanceOffering({
        id: 'gorilla-stance',
        name: 'Gorilla Stance',
        strike: {
          name: 'Gorilla Slam',
          damage: '1d8',
          damageType: 'bludgeoning',
          traits: ['Attack', 'Backswing', 'Forceful', 'Grapple', 'Nonlethal', 'Melee', 'Unarmed'],
          description: 'A heavy slam from your knuckle-walking stance. You can only make this Strike while in Gorilla Stance.',
        },
        description:
          'You lower yourself to the ground and take an imposing, knuckle-walking stance. While in this stance, ' +
          'the only Strikes you can make are gorilla slam unarmed attacks. These deal 1d8 bludgeoning damage; ' +
          'are in the brawling group; and have the backswing, forceful, grapple, nonlethal, and unarmed traits. ' +
          'While you are in Gorilla Stance, you gain a +2 circumstance bonus to Athletics checks to Climb, and ' +
          'if you roll a success on an Athletics check to Climb, you get a critical success instead.',
      }),
      stanceOffering({
        id: 'mountain-stance',
        name: 'Mountain Stance',
        strike: {
          name: 'Falling Stone',
          damage: '1d8',
          damageType: 'bludgeoning',
          traits: ['Attack', 'Forceful', 'Nonlethal', 'Melee', 'Unarmed'],
          description: 'A blow that lands with the weight of an avalanche. You can only make this Strike while in Mountain Stance.',
        },
        description:
          'Requirements You are unarmored and touching the ground. You enter the stance of an implacable ' +
          'mountain—a technique created by dwarven monks—allowing you to strike with the weight of an avalanche ' +
          'and block blows with your garments. The only Strikes you can make are falling stone unarmed attacks. ' +
          'These deal 1d8 bludgeoning damage; are in the brawling group; and have the forceful, nonlethal, and ' +
          'unarmed traits. While in Mountain Stance, you gain a +4 item bonus to AC and a +2 circumstance bonus ' +
          'to any defenses against Reposition, Shove, Trip, and other forced movement effects. You have a ' +
          'Dexterity modifier cap to your AC of +0, meaning you don’t add your Dexterity to your AC, and your ' +
          'Speeds are all reduced by 5 feet. The item bonus to AC from Mountain Stance is cumulative with armor ' +
          'potency runes on your explorer’s clothing, mystic armor, and bands of force.',
      }),
      stanceOffering({
        id: 'rain-of-embers-stance',
        name: 'Rain of Embers Stance',
        actionTraits: ['Monk', 'Stance', 'Fire'],
        strike: {
          name: 'Fire Talon',
          damage: '1d4',
          damageType: 'fire',
          traits: ['Attack', 'Agile', 'Finesse', 'Fire', 'Nonlethal', 'Melee', 'Unarmed'],
          description: 'A raking strike with fingers held like a phoenix’s flaming talons. You can only make this Strike while in Rain of Embers Stance.',
        },
        description:
          'Requirements You are unarmored. You enter the stance of an enraged phoenix, holding your fingers as ' +
          'rigid as deadly talons while moving with quick, flickering gestures that flicker with dancing flames. ' +
          'The only Strikes you can make are fire talon Strikes. These deal 1d4 fire damage; are in the brawling ' +
          'group; and have the agile, finesse, fire, nonlethal, and unarmed traits. While in Rain of Embers ' +
          'Stance, you gain a +1 status bonus to AC and fire resistance equal to half your level (minimum 1).',
      }),
      stanceOffering({
        id: 'stumbling-stance',
        name: 'Stumbling Stance',
        strike: {
          name: 'Stumbling Swing',
          damage: '1d8',
          damageType: 'bludgeoning',
          traits: ['Attack', 'Agile', 'Backstabber', 'Finesse', 'Nonlethal', 'Melee', 'Unarmed'],
          description: 'A deceptive, off-balance blow from your feigned stagger. You can only make this Strike while in Stumbling Stance.',
        },
        description:
          'You enter a seemingly unfocused stance that mimics the movements of the inebriated—bobbing, weaving, ' +
          'leaving false openings, and distracting your enemies from your true movements. While in this stance, ' +
          'you gain a +1 circumstance bonus to Deception checks to Feint. The only Strikes you can make are ' +
          'stumbling swing unarmed attacks. These deal 1d8 bludgeoning damage; are in the brawling group; and ' +
          'have the agile, backstabber, finesse, nonlethal, and unarmed traits. If an enemy hits you with a ' +
          'melee Strike while in this stance, it becomes off-guard against the next stumbling swing Strike you ' +
          'make against it before the end of your next turn.',
      }),
      stanceOffering({
        id: 'tiger-stance',
        name: 'Tiger Stance',
        strike: {
          name: 'Tiger Claw',
          damage: '1d8',
          damageType: 'slashing',
          traits: ['Attack', 'Agile', 'Finesse', 'Nonlethal', 'Melee', 'Unarmed'],
          description: 'A raking swipe with your hand held like a tiger’s claw. You can only make this Strike while in Tiger Stance.',
        },
        description:
          'Requirements You are unarmored. You enter the stance of a tiger and can make tiger claw attacks. ' +
          'These deal 1d8 slashing damage; are in the brawling group; and have the agile, finesse, nonlethal, ' +
          'and unarmed traits. On a critical success with your tiger claws, if you deal damage, the target takes ' +
          '1d4 persistent bleed damage. As long as your Speed is at least 20 feet while in Tiger Stance, you can ' +
          'Step 10 feet.',
      }),
      stanceOffering({
        id: 'wolf-stance',
        name: 'Wolf Stance',
        strike: {
          name: 'Wolf Jaw',
          damage: '1d8',
          damageType: 'piercing',
          traits: ['Attack', 'Agile', 'Backstabber', 'Finesse', 'Nonlethal', 'Melee', 'Unarmed'],
          description: 'A snapping strike with your hands held like a wolf’s fangs. You can only make this Strike while in Wolf Stance.',
        },
        description:
          'Requirements You are unarmored. You enter the stance of a wolf, low to the ground with your hands ' +
          'held like fangs. You can make wolf jaw unarmed attacks. These deal 1d8 piercing damage; are in the ' +
          'brawling group; and have the agile, backstabber, finesse, nonlethal, and unarmed traits. If you’re ' +
          'flanking a target while in Wolf Stance, your wolf jaw unarmed attacks also gain the trip trait.',
      }),
      stanceOffering({
        id: 'cobra-stance',
        name: 'Cobra Stance',
        level: 4,
        strike: {
          name: 'Cobra Fang',
          damage: '1d4',
          damageType: 'piercing',
          traits: ['Attack', 'Agile', 'Deadly d10', 'Finesse', 'Melee', 'Unarmed', 'Venomous'],
          description: 'A darting strike with your hands poised as venomous fangs. You can only make this Strike while in Cobra Stance.',
        },
        description:
          'You enter a tight stance, coiled up like a lashing cobra with your hands poised as venomous fangs. ' +
          'While in this stance, the only Strikes you can make are cobra fang unarmed attacks. These deal 1d4 ' +
          'piercing damage; are in the brawling group; and have the agile, deadly d10, finesse, unarmed, and ' +
          'venomous traits. While in Cobra Stance, you gain a +1 circumstance bonus to Fortitude saves and your ' +
          'Fortitude DC, and you gain poison resistance equal to half your level.',
      }),
    ],
  },
  {
    id: 'sandpoint-garrison',
    name: 'Sandpoint Garrison',
    offerings: [
      {
        id: 'shield-block',
        name: 'Shield Block',
        hours: DEFAULT_TRAINING_HOURS,
        kind: 'reaction',
        requiresClass: null,
        skipIfKnown: true,
        requiresAbility: null,
        choices: null,
        trigger: 'While you have your shield raised, you would take physical damage from an attack.',
        summary:
          'You snap your shield in place to ward off a blow. Your shield prevents you from taking an ' +
          'amount of damage up to the shield’s Hardness. You and the shield each take any remaining ' +
          'damage, possibly breaking or destroying the shield.',
      },
      {
        id: 'specialized-light',
        name: 'Specialized Shield Training (Light)',
        hours: DEFAULT_TRAINING_HOURS,
        kind: 'reaction',
        requiresClass: null,
        skipIfKnown: false,
        requiresAbility: 'Shield Block',
        summary:
          'Drill with a light shield (less than 1 Bulk) to master one specialized reaction. Pick one to learn; ' +
          'you can train the tier again later for another.',
        choices: [
          shieldReaction({
            id: 'disrupting-shield',
            name: 'Disrupting Shield',
            note: 'Light tier · trained in shield attacks',
            trigger: 'An adjacent enemy uses an action with the concentrate trait. (Requirements: you have a light shield raised. Prerequisites: trained in shield attacks.)',
            summary:
              'You watch enemies for that single moment when they focus their attention on a difficult task, and ' +
              'that’s when you strike. Attempt an attack roll against the target’s AC using a shield that satisfies ' +
              'the requirements of this ability. This attack deals no damage, but on a hit the target is flat-footed ' +
              'until the start of your next turn. On a critical hit, the target’s action is disrupted and has no ' +
              'effect. On a failure or critical failure, your shield loses Hit Points equal to the creature’s level. ' +
              'On a success or critical success, your shield loses Hit Points equal to two times the creature’s level.',
          }),
          shieldReaction({
            id: 'intercepting-shield',
            name: 'Intercepting Shield',
            note: 'Light tier · not usable with a shield gauntlet',
            trigger: 'An ally within 15 feet is hit by a ranged weapon attack, and a +2 circumstance bonus to AC would turn the critical hit into a hit or the hit into a miss. (Requirements: you have a light shield raised. This cannot be used with a shield gauntlet.)',
            summary:
              'You quickly throw your shield to intercept a projectile and knock it slightly off course. Your ally ' +
              'gains a +2 circumstance bonus to AC against the triggering attack. This turns the triggering critical ' +
              'hit into a hit, or the triggering hit into a miss. Your shield is no longer raised. If the shield has ' +
              'a returning or throwing rune, it returns immediately to the hand that threw it. Otherwise, the shield ' +
              'lands in a square of your choosing that is adjacent to the ally who received the bonus. If you have ' +
              'Reflexive Shield or Mirror Shield, or any other feat that allows you to reduce or redirect damage ' +
              'from non-physical attacks using your shield, you can use Intercepting Shield to grant your ally this ' +
              'bonus against ranged unarmed attacks and ranged magical attacks in addition to the normal trigger.',
          }),
          shieldReaction({
            id: 'catch-and-twist',
            name: 'Catch and Twist',
            note: 'Light tier · requires a shield gauntlet',
            trigger: 'A foe critically fails a melee attack against you. (Requirements: you are wielding a shield gauntlet and have it raised. Prerequisites: trained in shield attacks.)',
            summary:
              'You not only catch the foe’s attack in your shield gauntlet, but you take the opportunity to put ' +
              'them off balance or even make them drop their weapon. Attempt a shield attack against the triggering ' +
              'creature’s AC. Critical Success If the attack was a weapon attack, the weapon is disarmed. If the ' +
              'weapon’s bulk would make you encumbered, it falls at your feet, otherwise you keep it in your hand. ' +
              'If you keep it in your hand, you are not considered to be wielding the weapon, but you may spend an ' +
              'action to Change Grip on your turn to do so. If you keep the weapon in your hand, your shield ' +
              'gauntlet is no longer raised. If the attack was made with an unarmed attack, the target instead ' +
              'takes a -2 circumstance penalty to attacks made with that unarmed attack and is clumsy 1 or ' +
              'enfeebled 1 (your choice) for 1 round. The shield gauntlet loses Hit Points equal to two times the ' +
              'creature’s level. Success The foe takes a -2 circumstance penalty to attacks made with the ' +
              'triggering weapon or unarmed attack. The shield gauntlet loses Hit Points equal to two times the ' +
              'creature’s level. Failure no effect. Critical Failure You fail to cause the enemy any trouble, and ' +
              'damage your gauntlet in the process. Roll the creature’s damage as if it had hit with the attack and ' +
              'apply it to the gauntlet, reducing the damage by the gauntlet’s Hardness as normal.',
          }),
        ],
      },
      {
        id: 'specialized-medium',
        name: 'Specialized Shield Training (Medium)',
        hours: DEFAULT_TRAINING_HOURS,
        kind: 'reaction',
        requiresClass: null,
        skipIfKnown: false,
        requiresAbility: 'Shield Block',
        summary:
          'Drill with a medium shield (1 Bulk) to master one specialized reaction. Pick one to learn; you can ' +
          'train the tier again later for another.',
        choices: [
          shieldReaction({
            id: 'aiding-shield',
            name: 'Aiding Shield',
            note: 'Medium tier · trained in shield attacks',
            trigger: 'An ally attempts a skill check against an enemy that you are adjacent to. (Requirements: you have a medium shield raised. Prerequisites: trained in shield attacks.)',
            summary:
              'You use your shield to create space on the battlefield and distract opponents, with a mind to ' +
              'create openings for your allies’ plans. Attempt an attack roll with your shield and use the result ' +
              'as your check to Aid your ally’s skill check. For the purpose of this Aid check, the Raise a Shield ' +
              'action was your preparation for this reaction. Your shield is no longer raised after you take this ' +
              'reaction, and it loses Hit Points equal to the creature’s level on a failure or critical failure, ' +
              'or two times the creature’s level on a success or critical success.',
          }),
          shieldReaction({
            id: 'covering-shield',
            name: 'Covering Shield',
            note: 'Medium tier',
            trigger: 'An enemy attacks an adjacent ally with a reaction that was triggered by the ally leaving their current square, but has not yet rolled. (Requirements: you have a medium shield raised.)',
            summary:
              'You launch yourself into the void left by your ally and cover their escape, potentially leaving ' +
              'yourself unprotected. Stride into the space the ally left with the movement that triggered this ' +
              'reaction. The enemy’s attack now targets you instead. If the attack is a hit or critical hit, your ' +
              'shield takes damage as if you had used the Shield Block reaction against the attack, but it does not ' +
              'reduce the damage you take.',
          }),
        ],
      },
      {
        id: 'specialized-heavy',
        name: 'Specialized Shield Training (Heavy)',
        hours: DEFAULT_TRAINING_HOURS,
        kind: 'reaction',
        requiresClass: null,
        skipIfKnown: false,
        requiresAbility: 'Shield Block',
        summary:
          'Drill with a heavy shield (more than 1 Bulk) to master one specialized reaction. Pick one to learn; ' +
          'you can train the tier again later for another.',
        choices: [
          shieldReaction({
            id: 'bulwark-shield',
            name: 'Bulwark Shield',
            note: 'Heavy tier',
            trigger: 'You and at least one other ally are in an area of effect that deals damage or has the visual trait. (Requirements: you have a heavy shield raised.)',
            summary:
              'You plant your massive shield at an angle to absorb explosions and protect your allies’ eyes. You ' +
              'create a 15-foot cone of protected space. You and any allies who are within this protected space ' +
              'receive the following benefits. If the effect deals damage, reduce the damage that you and your ' +
              'allies take as if you had used the Shield Block reaction against the effect. Your shield takes ' +
              'double damage, reduced by its Hardness as normal. If the effect has the visual trait, you and your ' +
              'allies within the protected space receive a +2 circumstance bonus to your saving throws against the ' +
              'effect. If the effect has both, you receive both benefits.',
          }),
          shieldReaction({
            id: 'shoving-shield',
            name: 'Shoving Shield',
            note: 'Heavy tier',
            trigger: 'An adjacent enemy critically fails an attack against you or an ally. (Requirements: you have a heavy shield raised.)',
            summary:
              'When an enemy fumbles their attack, you use the enormous heft of your shield to bully the enemy ' +
              'backward. You Shove the enemy, without needing a free hand to do so. This action doesn’t count ' +
              'toward your multiple attack penalty, and your multiple attack penalty doesn’t apply to this action. ' +
              'Your shield is no longer raised after you take this reaction, and it loses Hit Points equal to the ' +
              'creature’s level on a failure or critical failure, or two times the creature’s level on a success ' +
              'or critical success.',
          }),
        ],
      },
    ],
  },
];

// Look up a single vendor by id.
export function trainingVendorById(id) {
  return TRAINING_VENDORS.find((v) => v.id === id) || null;
}

// Look up a track's offering definition from its provenance ids.
export function trackOffering(track, vendors = TRAINING_VENDORS) {
  const vendor = vendors.find((v) => v.id === track?.vendorId);
  return (vendor?.offerings || []).find((o) => o.id === track?.offeringId) || null;
}

// Display label for a training track: the offering name, plus the picked
// choice when the track has one ("Specialized Shield Training (Light):
// Intercepting Shield"). Falls back to the raw offering id if the data
// definition has since vanished.
export function trackLabel(track, vendors = TRAINING_VENDORS) {
  const offering = trackOffering(track, vendors);
  const base = offering?.name || track?.offeringId || 'Training';
  const choice = track?.choiceId
    ? (offering?.choices || []).find((c) => c.id === track.choiceId)?.name
    : null;
  return choice ? `${base}: ${choice}` : base;
}

const norm = (s) => String(s || '').trim().toLowerCase();

// True when the character already has the named ability, innate or trained.
// Matches by name across the character doc's reactions[], feats[] (and each
// feat's nested actions[] — stances live there), and the trained[] grants
// field (S2 — entries carry the ability under feat.name / reaction.name).
export function knowsAbility(character, name) {
  const want = norm(name);
  if (!want) return false;
  const reactions = character?.reactions || [];
  if (reactions.some((r) => norm(r?.name) === want)) return true;
  const feats = character?.feats || [];
  for (const f of feats) {
    if (norm(f?.name) === want) return true;
    if ((f?.actions || []).some((a) => norm(a?.name) === want)) return true;
  }
  const trained = character?.trained || [];
  return trained.some(
    (t) => norm(t?.feat?.name) === want || norm(t?.reaction?.name) === want || norm(t?.name) === want,
  );
}

// The subset of an offering's choices the character could still learn.
// Offerings without choices return null (the offering itself is the choice).
export function eligibleChoices(offering, character) {
  if (!offering?.choices) return null;
  return offering.choices.filter((c) => !knowsAbility(character, c.name));
}

// The offerings of one vendor this character can start right now. `tracks` is
// the PC's training-track list (cnmh_training_<charId>.tracks) — an offering
// with a track already in progress is hidden (finish or abandon it first;
// re-taking a choice track for a different pick comes after completion).
export function eligibleOfferings(vendor, character, tracks = []) {
  if (!vendor || !character) return [];
  return (vendor.offerings || []).filter((o) => {
    if (o.requiresClass && norm(character.class) !== norm(o.requiresClass)) return false;
    if (o.skipIfKnown && knowsAbility(character, o.name)) return false;
    if (o.requiresAbility && !knowsAbility(character, o.requiresAbility)) return false;
    const choices = eligibleChoices(o, character);
    if (choices && choices.length === 0) return false;
    if ((tracks || []).some(
      (t) => t.vendorId === vendor.id && t.offeringId === o.id && (t.status || 'in-progress') === 'in-progress',
    )) return false;
    return true;
  });
}

// The grant payload a completed track submits for GM approval (#1191 S2):
// { kind:'feat', feat:{...} } or { kind:'reaction', reaction:{...} }, carried
// on the queue entry so approval needs no re-lookup. An explicit `grant` on
// the picked choice (then the offering) wins — stances need full feat entries
// with nested actions/strikes. Otherwise a reaction-kind offering derives its
// reaction doc from name/trigger/summary (the choice's own fields first).
// Returns null when a feat-kind offering authors no grant (a data bug the
// shape test guards against).
export function buildGrant(offering, choice = null) {
  if (!offering) return null;
  const explicit = choice?.grant || offering.grant;
  if (explicit) return explicit;
  if (offering.kind !== 'reaction') return null;
  const reaction = { name: choice?.name || offering.name };
  const trigger = choice?.trigger || (choice ? null : offering.trigger);
  const description = choice?.summary || (choice ? choice.note : offering.summary);
  if (trigger) reaction.trigger = trigger;
  if (description) reaction.description = description;
  return { kind: 'reaction', reaction };
}

// Every { vendor, offerings } pair the character can start a track at, given
// the party's location-support map (cnmh_support_global — presence = earned).
// Drives both the TrainingProjects start flow and the allocator's "show the
// Training activity at all?" gate. `vendors` overrides the catalog in tests.
export function availableTrainingVendors(character, supported, tracks = [], vendors = TRAINING_VENDORS) {
  const map = supported || {};
  return vendors
    .filter((v) => Boolean(map[v.id]))
    .map((v) => ({ vendor: v, offerings: eligibleOfferings(v, character, tracks) }))
    .filter((e) => e.offerings.length > 0);
}
