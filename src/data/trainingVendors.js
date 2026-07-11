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
// S1 ships the Garrison's Shield Block track so the whole start→bank→ready
// flow is exercised end-to-end; the full launch catalog (House of Blue Stones
// Monk stances, the Specialized Shield Training tiers) lands in S3.

export const DEFAULT_TRAINING_HOURS = 160;

export const TRAINING_VENDORS = [
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
