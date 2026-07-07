// Whetstones (Battlecry! pg. 134 — epic #1212, W1 #1213). Pure helpers, no React.
//
// A whetstone is a Consumable applied to a wielded weapon with a single
// Interact action (no advance affixing, unlike talismans). It crumbles to dust
// on application and leaves a timed effect bound to that weapon — 1 minute
// unless the item says 1 hour. A weapon can be under only one whetstone effect
// at a time: applying a new one replaces the old.
//
// Authoring block on the item:
//
//   item.whetstone = {
//     duration: 'minute' | 'hour',      // default 'minute'
//     targets:  'any' | 'ranged',       // ranged-only (Featherlight Fletching)
//     choice:   { label, options: [] }, // apply-time picker (Morph Jewel type)
//     effect:   {...},                  // automation payload (W2–W4); absent = descriptive-only
//     reminder: '<effect rules text>',  // surfaced on the weapon card + effect entry
//   }
//
// The applied whetstone is an entry in cnmh_effects_<charId> (NO new synced
// key) carrying a `whetstone` binding:
//
//   { id, name, appliedBy, source, expireAt?|expireAtSecs?, ts,
//     whetstone: { itemId, itemName, weaponUid, weaponName, duration, choice?, reminder?, effect? } }
//
// 1-minute effects tick on the encounter round sweep when a combat is running
// (10 rounds), else on the game clock; 1-hour effects are always clock-timed so
// they survive encounter end (isEncounterScopedEffect keys off expireAt only).

import { newEntryUid } from './uid';
import { itemUidOf, isTalisman } from './affix';
import { resolveExpireAt } from './expiry';
import { translatePropertyRider } from './weaponRunes';

/** 1 minute = 10 rounds under the encounter round sweep. */
export const MINUTE_ROUNDS = 10;

/** The item's whetstone authoring block, or null. */
export const whetstoneMeta = (item) =>
  item?.whetstone && typeof item.whetstone === 'object' ? item.whetstone : null;

/** Whether an item is a whetstone (carries the block or the Whetstone trait). */
export const isWhetstone = (item) =>
  !!whetstoneMeta(item) ||
  (Array.isArray(item?.traits) && item.traits.some((t) => String(t).toLowerCase() === 'whetstone'));

/** Effect duration kind: 'minute' (default) or 'hour'. */
export const whetstoneDuration = (item) =>
  whetstoneMeta(item)?.duration === 'hour' ? 'hour' : 'minute';

export const whetstoneDurationLabel = (duration) =>
  duration === 'hour' ? '1 hour' : '1 minute';

/** The apply-time choice block ({ label, options: [...] }), or null. */
export const whetstoneChoice = (item) => {
  const c = whetstoneMeta(item)?.choice;
  return c && Array.isArray(c.options) && c.options.length ? c : null;
};

/** Reminder rules text for the bound-weapon card (falls back to description). */
export const whetstoneReminder = (item) =>
  whetstoneMeta(item)?.reminder || item?.description || '';

const hasRangedStrike = (weapon) =>
  (weapon?.strikes || []).some((s) => s?.type === 'ranged');

/**
 * Weapons a whetstone can be applied to, from a flat inventory list: anything
 * with a strikes block (excluding talismans and the whetstone itself), filtered
 * to ranged weapons when the whetstone declares targets:'ranged'.
 */
export const eligibleWhetstoneWeapons = (items, whetstone) => {
  const selfUid = itemUidOf(whetstone);
  const rangedOnly = whetstoneMeta(whetstone)?.targets === 'ranged';
  return (Array.isArray(items) ? items : []).filter(
    (it) =>
      itemUidOf(it) !== selfUid &&
      !isTalisman(it) &&
      !!it.strikes &&
      (!rangedOnly || hasRangedStrike(it))
  );
};

/**
 * Whether applying to this weapon warrants the two-handed regrip reminder
 * (reminder text only — action economy is not policed).
 */
export const needsRegripNote = (weapon) =>
  weapon?.state === 'held2' || /\b2 hands\b|\btwo hands\b/i.test(String(weapon?.usage || ''));

/** The active whetstone effect entry bound to a weapon uid, or null. */
export const activeWhetstoneOn = (effects, weaponUid) =>
  (Array.isArray(effects) ? effects : []).find((e) => e?.whetstone?.weaponUid === weaponUid) || null;

/** Set of weapon uids currently carrying a whetstone effect (tile medallion). */
export const whetstoneHostUids = (effects) =>
  new Set(
    (Array.isArray(effects) ? effects : [])
      .map((e) => e?.whetstone?.weaponUid)
      .filter(Boolean)
  );

/**
 * Build the cnmh_effects_ entry for an applied whetstone. Durations: 1 minute
 * → 10 rounds on the encounter sweep when a combat is active, else game-clock
 * (+60s); 1 hour → always game-clock (+3600s) so it survives encounter end.
 *
 * @param {Object} item          - the whetstone item
 * @param {Object} weapon        - the bound weapon (inventory item)
 * @param {string} charId        - the wielder
 * @param {*}      [choice]      - apply-time pick (whetstoneChoice option)
 * @param {Object} [encounter]   - current encounter state (for round expiry)
 * @param {string} [casterEntryId] - the wielder's encounter entryId
 * @param {number} [nowSecs]     - absolute game seconds (for clock expiry)
 */
export const buildWhetstoneEffectEntry = ({
  item, weapon, charId, choice, encounter, casterEntryId, nowSecs,
}) => {
  const duration = whetstoneDuration(item);
  const inEncounter = !!encounter?.active;
  const expireAt =
    duration === 'minute' && inEncounter
      ? resolveExpireAt({ until: 'rounds', rounds: MINUTE_ROUNDS }, encounter, casterEntryId)
      : null;
  const expireAtSecs =
    !expireAt && typeof nowSecs === 'number'
      ? nowSecs + (duration === 'hour' ? 3600 : 60)
      : undefined;
  const meta = whetstoneMeta(item) || {};
  return {
    id:        newEntryUid(),
    name:      `${item.name} (${weapon.name})`,
    appliedBy: charId,
    source:    item.name,
    whetstone: {
      itemId:     item.id ?? null,
      itemName:   item.name,
      weaponUid:  itemUidOf(weapon),
      weaponName: weapon.name,
      duration,
      ...(choice != null ? { choice } : {}),
      ...(whetstoneReminder(item) ? { reminder: whetstoneReminder(item) } : {}),
      ...(meta.effect ? { effect: meta.effect } : {}),
    },
    ...(expireAt ? { expireAt } : {}),
    ...(expireAtSecs != null ? { expireAtSecs } : {}),
    ts: Date.now(),
  };
};

/**
 * The effects list after applying a whetstone entry: any existing whetstone
 * effect on the same weapon is replaced in the same write (one per weapon).
 */
export const withWhetstoneApplied = (effects, entry) => [
  ...(Array.isArray(effects) ? effects : []).filter(
    (e) => e?.whetstone?.weaponUid !== entry.whetstone.weaponUid
  ),
  entry,
];

// ── Strike & damage alterations (W2, #1214) ─────────────────────────────────
//
// The composable `item.whetstone.effect` payload (copied onto the effect entry
// at apply time) alters the bound weapon's resolved strikes. All fields are
// optional; a whetstone may combine several:
//
//   effect: {
//     damageType: 'from-choice' | '<type>',  // override the strike's damage type
//                                            //   ('from-choice' reads the apply-time pick — Morph Jewel)
//     addTraits: ['Nonlethal'],              // grant traits (Hand of Mercy)
//     suppressPersistent: true,              // negate the weapon's persistent-damage riders (Hand of Mercy)
//     material: 'silver',                    // counts as that material (Transmuting Ingot)
//     iwrTags: ['ghost touch'],              // extra counts-as tags for weakness matching (#1014 rail)
//     perDieFlat: { amount: 1, type: 'bludgeoning' }, // +N flat per weapon damage die (Mighty Counterweight)
//     grantRunes: [{ id, name, rider? }],    // property-rune effects for the duration (Ethereal Crescent)
//     rangeMultiplier: 2,                    // scale the range increment, ranged strikes only (Featherlight Fletching)
//   }
//
// `material` + `iwrTags` surface on the strike as `iwrTags` and ride the damage
// profile into weakness matching (a creature weak to silver/ghost touch takes
// the bonus). Resistance exceptions ("physical 10, except silver") stay
// Foundry-side — the relay sends raw totals and Foundry nets IWR itself.

/** Active whetstone entries keyed by their bound weapon uid. */
export const whetstonesByWeaponUid = (effects) => {
  const out = {};
  for (const e of Array.isArray(effects) ? effects : []) {
    if (e?.whetstone?.weaponUid) out[e.whetstone.weaponUid] = e;
  }
  return out;
};

// '60 ft' / '60' / 60 → scaled by mult, preserving the string suffix.
const scaleRange = (range, mult) => {
  if (typeof range === 'number') return range * mult;
  const m = String(range ?? '').match(/^(\s*)(\d+)(.*)$/);
  if (!m) return range;
  return `${m[1]}${Number(m[2]) * mult}${m[3]}`;
};

/**
 * Apply an active whetstone entry's effect payload to a resolved strike object
 * (strikeUtils.resolveItemStrikes output). Descriptive whetstones (no payload)
 * only stamp the marker; unknown payload fields are ignored so future
 * whetstones stay content-only.
 */
export const applyWhetstoneStrikeAlterations = (strikeObj, entry) => {
  const ws = entry?.whetstone;
  if (!ws) return strikeObj;
  const eff = ws.effect || {};
  const s = { ...strikeObj, whetstone: { itemName: ws.itemName, ...(ws.choice != null ? { choice: ws.choice } : {}) } };

  const damageType = eff.damageType === 'from-choice' ? ws.choice : eff.damageType;
  if (damageType) s.damageType = damageType;

  if (Array.isArray(eff.addTraits) && eff.addTraits.length) {
    const have = new Set((s.traits || []).map((t) => String(t).toLowerCase()));
    s.traits = [
      ...(s.traits || []),
      ...eff.addTraits.filter((t) => !have.has(String(t).toLowerCase())),
    ];
  }

  const tags = [
    ...(eff.material ? [eff.material] : []),
    ...(Array.isArray(eff.iwrTags) ? eff.iwrTags : []),
  ];
  if (eff.material) s.material = eff.material;
  if (tags.length) s.iwrTags = [...new Set([...(s.iwrTags || []), ...tags])];

  if (eff.rangeMultiplier && s.type === 'ranged' && s.range != null) {
    s.range = scaleRange(s.range, eff.rangeMultiplier);
  }

  let riders = Array.isArray(s.riders) ? [...s.riders] : [];
  if (eff.suppressPersistent) riders = riders.filter((r) => !r.persistent);
  if (eff.perDieFlat) {
    riders.push({
      id: `whetstone-${ws.itemId || 'perdie'}`,
      label: ws.itemName,
      bonus: { perWeaponDie: eff.perDieFlat.amount ?? 1 },
      ...(eff.perDieFlat.type ? { type: eff.perDieFlat.type } : {}),
    });
  }
  if (Array.isArray(eff.grantRunes)) {
    riders.push(...eff.grantRunes.flatMap(translatePropertyRider));
  }
  if (riders.length) s.riders = riders;
  else delete s.riders;

  return s;
};
