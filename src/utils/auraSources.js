// Aura SOURCES — what projects an emanation for a character, and how big it is
// (#1733 S3). Pure: no React, no relay. `useAuraRegionSync` (hooks/) decides
// when to mirror the answer to Foundry as `auraset`; `useAuraMembers` reads the
// membership that comes back.
//
// Three source kinds, in the priority order this file resolves them:
//
//   1. champion  — a champion's aura, a passive class feature. Authored as
//                  `championAura: true` + an emanation `areaShape` on a feats[]
//                  entry (or an action on one). Activation piggybacks on the
//                  app-only `cnmh_aura_<charId>` key the kineticist aura
//                  already uses, because the table ruled (2026-07-25) that a
//                  character's kineticist aura and champion aura ARE THE SAME
//                  AURA — one key, one Region, one Dismiss.
//   2. kinetic   — `auraProfile` (utils/kineticAura.js), same key.
//   3. effect    — a spell whose ongoing effect on the CASTER is itself an
//                  aura: Courageous Anthem's 60-foot emanation while the caster
//                  carries `inspire-courage`. Driven by the effect list, not by
//                  the aura key, because nothing "activates" it — casting does.
//
// ── The one-aura-per-character contract, and the priority rule ───────────────
//
// The bridge draws exactly ONE aura Region per charId (foundry-bridge/README.md,
// `auraset` row). So when a character has several live sources we must pick one,
// and the rule is: A CLASS AURA OUTRANKS AN EFFECT AURA. Reasons:
//   - a class aura is the one the table's own automation keys on (champion
//     reactions, kineticist impulses) — losing its Region would break a gate,
//     while losing the Anthem's Region only loses a read-out;
//   - a class aura is persistent (up until dismissed) and an effect aura is
//     transient, so the stable thing wins the stable Region;
//   - it is edge-triggered either way: when the class aura is DOWN an effect
//     aura takes the Region, and the class aura reclaims it on activation.
// Within the class kinds, champion outranks kinetic — for the one character who
// has both (they are the same aura per the ruling above) the champion's 15-foot
// radius is the one Retributive Strike and Blessing of the Devoted are written
// against, so it is the honest circle to draw.

import { parseSpellArea } from './spellArea';
import { auraProfile } from './kineticAura';

// ── Champion aura ────────────────────────────────────────────────────────────

// Explicit flag rather than trait inference: `characterHasKineticAura`'s
// Aura+Kineticist trait pair deliberately cannot false-positive a champion
// (see kineticAura.test.js), and a champion's aura carries no distinguishing
// trait pair of its own, so content opts in by name.
const isChampionAuraEntry = (entry) => entry?.championAura === true;

// An entry's authored emanation radius, or null. Same "no fallback radius"
// discipline as `auraProfile` (#1733 ruling 2) — an aura nobody sized is an
// aura we never draw.
const emanationFeet = (entry) => {
  const area = parseSpellArea(entry);
  if (!area || area.shape !== 'emanation') return null;
  const feet = Number(area.feet);
  return feet > 0 ? feet : null;
};

// feats[] entries themselves, then their actions, then top-level actions — the
// same iteration shape `characterHasKineticAura` uses, plus the bare-feat case
// (a champion's aura is a class feature, not an activity, so it is authored as
// the feat entry itself).
const findChampionAuraEntry = (character) => {
  for (const f of character?.feats || []) {
    if (isChampionAuraEntry(f)) return f;
    const found = (f?.actions || []).find(isChampionAuraEntry);
    if (found) return found;
  }
  return (character?.actions || []).find(isChampionAuraEntry) || null;
};

/**
 * The champion's aura as { feet, label }, or null when the character has none
 * (or has one with no authored size).
 *
 * @param {Object} character
 * @returns {{feet:number,label:string}|null}
 */
export function championAuraProfile(character) {
  const entry = findChampionAuraEntry(character);
  if (!entry) return null;
  const feet = emanationFeet(entry);
  if (!feet) return null;
  return { feet, label: entry.name || "Champion's Aura" };
}

// Whether the character projects a champion aura at all — gates the aura row's
// Activate affordance (a champion's aura costs no action, so unlike Channel
// Elements it has no in-encounter activator of its own).
export const characterHasChampionAura = (character) => !!findChampionAuraEntry(character);

/**
 * The character's CLASS aura — the one the app-only `cnmh_aura_<charId>` key
 * switches on and off. Champion first, then kineticist (see the priority note
 * at the top of this file).
 *
 * @param {Object} character
 * @returns {{feet:number,label:string,kind:'champion'|'kinetic'}|null}
 */
export function classAuraProfile(character) {
  const champion = championAuraProfile(character);
  if (champion) return { ...champion, kind: 'champion' };
  const kinetic = auraProfile(character);
  if (kinetic) return { ...kinetic, kind: 'kinetic' };
  return null;
}

// ── Effect auras ─────────────────────────────────────────────────────────────

// effectId → the spell whose authored `area` sizes the aura. Keyed by effectId
// because that is what both effect stores speak: the app's own
// `cnmh_effects_<charId>` entries and the bridge's `cnmh_foundryeffects_<charId>`
// read-back (foundry-bridge/utils.js maps PF2e slugs onto these same ids), so
// one table covers the app-only and the foundry-authoritative path alike.
export const EFFECT_AURA_SOURCES = {
  'inspire-courage':   { spellId: 'inspire-courage', label: 'Courageous Anthem' },
  'inspire-courage-2': { spellId: 'inspire-courage', label: 'Courageous Anthem' },
};

// Bounded walk for `{ spellRef }` references — content nests them under
// focus_spells, spellcasting.spells, spellcasting.spell_slots and feats[].innate,
// and the shapes differ per list. Depth-limited so this never wanders into the
// resolved inventory (which is large and irrelevant here).
const findSpellRef = (node, spellId, depth) => {
  if (!node || depth > 5) return false;
  if (Array.isArray(node)) return node.some((n) => findSpellRef(n, spellId, depth + 1));
  if (typeof node !== 'object') return false;
  if (node.spellRef === spellId) return true;
  return Object.values(node).some((v) => findSpellRef(v, spellId, depth + 1));
};

/**
 * Whether this character can actually cast the spell — the discriminator that
 * keeps an effect aura on the CASTER. Courageous Anthem stamps the identical
 * `inspire-courage` effect on every ally in the area, so "has the effect" alone
 * would have four PCs each projecting a 60-foot Region.
 *
 * @param {Object} character
 * @param {string} spellId
 * @returns {boolean}
 */
export const characterCastsSpell = (character, spellId) =>
  !!spellId && (
    findSpellRef(character?.focus_spells, spellId, 0)
    || findSpellRef(character?.spellcasting, spellId, 0)
    || findSpellRef(character?.feats, spellId, 0)
  );

/**
 * The aura an ongoing effect on this character projects, or null.
 *
 * Caster identification is two-tier, because the two effect stores carry
 * different provenance: an app-applied entry stamps `appliedBy` (the caster's
 * charId, `buildEffectEntry`), which settles it outright; a Foundry-sourced
 * entry carries none, so we fall back to "can this character cast it".
 *
 * @param {Object} character
 * @param {Array}  effects  merged effect list (`useEffects`)
 * @param {Array}  spells   the spell catalog (`useContent().spells`)
 * @returns {{feet:number,label:string}|null}
 */
export function effectAuraProfile(character, effects, spells) {
  for (const entry of effects || []) {
    const source = EFFECT_AURA_SOURCES[entry?.effectId];
    if (!source) continue;
    const isCaster = entry.appliedBy
      ? entry.appliedBy === character?.id
      : characterCastsSpell(character, source.spellId);
    if (!isCaster) continue;
    const spell = (spells || []).find((s) => s?.id === source.spellId);
    const feet = emanationFeet(spell);
    if (!feet) continue;
    return { feet, label: source.label || spell?.name || 'Aura' };
  }
  return null;
}

/**
 * The single aura this character currently projects, per the priority rule at
 * the top of this file, or null for none.
 *
 * @param {Object}  opts
 * @param {Object}  opts.character
 * @param {boolean} opts.auraActive  the app-only `cnmh_aura_<charId>` state
 * @param {Array}   [opts.effects]
 * @param {Array}   [opts.spells]
 * @returns {{feet:number,label:string,kind:'champion'|'kinetic'|'effect'}|null}
 */
export function resolveAuraSource({ character, auraActive, effects, spells } = {}) {
  const klass = classAuraProfile(character);
  if (klass && auraActive) return klass;
  const effect = effectAuraProfile(character, effects, spells);
  if (effect) return { ...effect, kind: 'effect' };
  return null;
}

// ── Membership consumption ───────────────────────────────────────────────────

/**
 * The entryIds an `all-allies` application should narrow to, or null for
 * "don't narrow" — which is the answer for every case where membership cannot
 * be trusted to describe this ability's own area.
 *
 * The gate is deliberately narrow: membership must be KNOWN (a bridge actually
 * pushed a snapshot), the ability's area must be an emanation, and the aura the
 * caster is currently projecting must have the SAME radius — otherwise the
 * membership list describes a different circle (their champion aura, say) and
 * narrowing by it would be a lie. Anything short of all three returns null, so
 * a bridgeless table and a mismatched aura both behave exactly as before.
 *
 * The caster's own entry is always kept: they stand in their own emanation, and
 * the bridge's `inside` list is about creatures the Region caught, not the
 * creature it is attached to.
 *
 * @param {Object} opts
 * @param {Object} opts.ability        the ability being applied
 * @param {Object} opts.auraSource     `resolveAuraSource` for the caster
 * @param {Object} opts.members        `useAuraMembers` for the caster
 * @param {string} [opts.casterEntryId]
 * @returns {Array<string>|null}
 */
export function auraNarrowedEntryIds({ ability, auraSource, members, casterEntryId } = {}) {
  if (!members?.known || !auraSource) return null;
  const area = parseSpellArea(ability);
  if (!area || area.shape !== 'emanation' || !(Number(area.feet) > 0)) return null;
  if (Number(auraSource.feet) !== Number(area.feet)) return null;

  // Hidden members count: an ally the players can't see is still standing in
  // the aura, and `all-allies` has never filtered hidden entries either. This
  // is the GM-complete list on purpose (#1733 S2's `inside`, not `visibleAllies`).
  const ids = new Set((members.inside || []).map((m) => m?.entryId).filter(Boolean));
  if (casterEntryId) ids.add(casterEntryId);
  return [...ids];
}

/**
 * Whether a reaction's trigger requires the ALLY it protects to be inside the
 * reactor's aura ("an enemy damages an ally within 15 feet of you" — the
 * champion's aura). Explicit authoring flag, distinct from `requiresAura`
 * (utils/kineticAura.js), which gates the REACTOR: a champion whose aura is
 * down can still Shield Block, and blocking their own kit on the aura key would
 * be a behaviour change nobody asked for.
 *
 * @param {Object} ability
 * @returns {boolean}
 */
export const requiresAllyInAura = (ability) => ability?.requiresAllyInAura === true;

/**
 * Drop the reactions whose ally-in-aura trigger the struck ally fails.
 *
 * Suppression needs BOTH a known membership snapshot and an identified struck
 * ally — anything less (no bridge, no push yet, a prompt fired without an ally,
 * an older GM client) leaves the list exactly as it came in. A false suppression
 * costs the table a reaction it was entitled to; a false pass costs nothing but
 * a GM saying "no, they're too far".
 *
 * @param {Array}  reactions
 * @param {Object} opts
 * @param {Object} opts.members       `useAuraMembers` for the reacting character
 * @param {string} [opts.allyEntryId] the struck ally's combatant id
 * @returns {Array}
 */
export function filterAllyAuraReactions(reactions, { members, allyEntryId } = {}) {
  const list = reactions || [];
  if (!members?.known || !allyEntryId) return list;
  const inside = (members.inside || []).some((m) => m?.entryId === allyEntryId);
  if (inside) return list;
  return list.filter((r) => !requiresAllyInAura(r));
}
