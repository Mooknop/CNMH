// Augmentations (#1202 U1) — the "adjustment" concept from Everything Shields,
// generalized to a single-slot modifier that rides ONE weapon, armor, or shield.
//
// An augmentation is an `item.json` doc with `type: 'augmentation'`; it never
// exists as standalone inventory (noShop, unbuyable, uncraftable-as-loose). It is
// bound to a host by writing `augmentation: { ref, choice? }` onto that host's
// inventory ENTRY — beside `entry.runes` / affix bindings. Inventory is a
// LIVE-preserved character field, so the binding survives a content diff-apply
// (unlike a raw feats/reactions write). An item holds at most one augmentation;
// swapping or removing DESTROYS the old one (there is nothing to return).
//
// This module is the model + the single set of write shapes the two application
// paths call: GM Manage Gear (U1) and the shop/crafting acquisition rail (U2). It
// mirrors runeSockets.applyRune — a fresh-uid snapshot the acquired overlay
// credits back, transient loadout fields dropped so placement re-derives.

import { hostMatchesType } from './affix';
import { shieldCategory, shieldCategoriesFromUsage } from './shieldCategory';
import { newEntryUid } from './uid';

/** Whether a catalog doc is an augmentation. */
export const isAugmentation = (doc) => doc?.type === 'augmentation';

/**
 * The host types an augmentation applies to, as a lowercase string array. Accepts
 * the authored array (`augTarget: ['shield']`, `['armor','weapon']`) or a bare
 * string. Empty when unset.
 */
export const augTargets = (augDoc) => {
  const t = augDoc?.augTarget;
  const arr = Array.isArray(t) ? t : t != null ? [t] : [];
  return arr.map((x) => String(x).toLowerCase());
};

/**
 * Whether a host item matches any of an augmentation's target types. Reuses the
 * affix classifier (weapon = has strikes, armor = has an armor block, shield = has
 * a shield block). An augmentation with no declared target matches nothing.
 */
export const hostMatchesAugTarget = (host, augDoc) =>
  augTargets(augDoc).some((type) => hostMatchesType(host, type));

/**
 * Whether a SHIELD augmentation's size gate admits `host`. Some shield
 * augmentations are usage-restricted by shield category — "worn on a light or
 * medium shield" (Shield Strap), "on a medium or heavy shield" (Shield Harness).
 * The gate is read from an explicit `shieldCategories` array or, failing that, the
 * category words in the `usage` string. Non-shield hosts and unrestricted
 * augmentations pass; an unreadable Bulk doesn't block (GM-trust).
 */
export const augmentationUsageAllows = (host, augDoc) => {
  if (!host?.shield) return true; // only shields carry a size gate
  const cats = shieldCategoriesFromUsage(augDoc);
  if (!cats) return true; // unrestricted
  const cat = shieldCategory(host.weight);
  return cat ? cats.includes(cat) : true; // unknown Bulk → don't block
};

/** The augmentation binding on a host entry/resolved item ({ ref, choice? }), or null. */
export const augmentationOf = (host) =>
  (host && typeof host.augmentation === 'object' ? host.augmentation : null);

/** Whether a host already carries an augmentation (its single slot is filled). */
export const hasAugmentation = (host) => augmentationOf(host) != null;

/**
 * The catalog id of the augmentation on a host, or null. Reads `ref` (a raw
 * `{ ref, choice }` binding) or `id` (an already-resolved doc the finishItem
 * inline produced) — so both the entry and resolved-item shapes answer.
 */
export const augmentationId = (host) => {
  const a = augmentationOf(host);
  return a ? (a.ref ?? a.id ?? null) : null;
};

/**
 * Whether `augDoc` fits `host` by target + size gate, IGNORING slot occupancy.
 * The picker predicate for both the GM swap menu and shop staging — a swap must
 * still offer compatible augmentations onto an already-augmented host.
 */
export const augmentationFits = (host, augDoc) =>
  isAugmentation(augDoc)
  && hostMatchesAugTarget(host, augDoc)
  && augmentationUsageAllows(host, augDoc);

/**
 * Whether `augDoc` can be NEWLY applied to `host`: it fits AND the single slot is
 * free. (Attachments and talismans are separate alteration types — they never
 * occupy this slot.) Swapping onto an occupied host is a distinct, deliberate act
 * that goes through applyAugmentation directly with a destroy warning.
 */
export const canAugment = (host, augDoc) =>
  augmentationFits(host, augDoc) && !hasAugmentation(host);

/**
 * Apply `augDoc` to `host`, returning a fresh-uid snapshot carrying
 * `augmentation: { ref, choice? }` — the shape the acquired overlay credits back.
 * When the host already has an augmentation this REPLACES it (swap): the old
 * binding is overwritten and destroyed. Transient loadout fields (state/hand) are
 * dropped so placement re-derives. Returns null when the augmentation doesn't fit.
 *
 * The etch-time choice (Ancestral Predator's creature type) comes from `opts.choice`
 * (a GM instant-apply) or, for a shop-staged augmentation, its baked
 * `etchConfig.choice` (#1059 carrier) — so a player's pick survives fulfillment,
 * where the work-order applies the doc through applyRune WITHOUT opts.
 */
export const applyAugmentation = (host, augDoc, opts = {}) => {
  if (!host || !isAugmentation(augDoc) || !augmentationFits(host, augDoc)) return null;
  const choice = opts.choice != null
    ? opts.choice
    : (augDoc.etchConfig && augDoc.etchConfig.choice != null ? augDoc.etchConfig.choice : undefined);
  const binding = { ref: augDoc.id };
  if (choice != null) binding.choice = choice;
  const { state, hand, ...rest } = host;
  return { ...rest, uid: newEntryUid(), augmentation: binding };
};

/**
 * Remove the augmentation from `host`, returning a fresh-uid snapshot without it
 * (the old augmentation is destroyed). Returns null when there is none to remove.
 */
export const clearAugmentation = (host) => {
  if (!hasAugmentation(host)) return null;
  const { state, hand, augmentation, ...rest } = host;
  return { ...rest, uid: newEntryUid() };
};
